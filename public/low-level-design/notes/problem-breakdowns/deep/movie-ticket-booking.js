// Deep dives: Movie Ticket Booking (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["movie-ticket-booking"] = {
  hook: `<p>Once holds, confirm and cancel work, interviewers push on the edges: slow payments, pricing rules, a premiere with a stampede of buyers, notifications, and what changes once there is a database behind several servers. You rarely implement these in full; you show which class changes and why the rest doesn't. Junior candidates may get none, mid-level one or two, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "payment-grace",
      title: "\"What if payment takes longer than the hold?\"",
      kicker: "Follow-up: slow payments",
      blocks: [
        { type: "text", html: `<p>In the core design a hold that runs out mid-payment fails the booking and refunds the charge. That is safe but unkind: a user who clicked Pay at minute 9:55 loses their seats because the bank took ten seconds. The fix is to <em>extend the hold once</em> when payment starts, so expiry cannot free it while the gateway works. Only <code>Show</code> changes, plus one line in <code>BookingService.confirm</code>.</p>` },
        { type: "code", lang: "java", title: "Payment pending: extend the hold while the gateway works", code: `// Hold gains a flag. It stays immutable, so starting payment replaces the hold in the map.
record Hold(String id, String userId, List<Seat> seats, long amountPaise, Instant expiresAt, boolean paying) {
    boolean expiredAt(Instant now) { return !now.isBefore(expiresAt); }
}

// In Show:
static final Duration PAYMENT_GRACE = Duration.ofMinutes(5);

/** Marks the hold as paying and pushes its deadline out, once, so expiry can't free it mid-payment. */
synchronized Hold startPayment(String holdId, String userId, Instant now) {
    Hold h = activeHold(holdId, userId, now);                // must still be valid when payment starts
    if (h.paying()) return h;                                // a second click gets no extra time
    Instant until = now.plus(PAYMENT_GRACE);
    if (until.isBefore(h.expiresAt())) until = h.expiresAt();   // never shorten a hold
    Hold paying = new Hold(h.id(), h.userId(), h.seats(), h.amountPaise(), until, true);
    holds.put(h.id(), paying);
    return paying;
}

// In BookingService.confirm, replace the activeHold call:
//     Hold hold = show.startPayment(holdId, userId, clock.instant());
// The rest is unchanged: charge with no lock, then show.confirm re-checks the (extended) hold,
// and the refund path now runs only when the gateway takes longer than PAYMENT_GRACE.` },
        { type: "keypoints", items: [
          "The deadline moves at most once (the <code>paying</code> flag), so nobody can keep seats forever by clicking Pay repeatedly.",
          "The gateway call needs its own timeout shorter than the grace period, or the refund path comes back.",
          "Return the new deadline to the client so the countdown on the payment page stays honest."
        ] }
      ]
    },
    {
      id: "pricing",
      title: "\"How would you add weekend pricing, convenience fees or coupons?\"",
      kicker: "Follow-up: pricing rules",
      blocks: [
        { type: "text", html: `<p>The core design keeps a price per seat category on each show. Real pricing stacks rules: a weekend surcharge, a fee per seat, a coupon. Put the calculation behind a <strong>Strategy</strong> that <code>Show</code> receives at construction, and build stacked rules as small wrappers around a base rule. <code>Show.hold</code> calls it in the one place it already computed the amount, so the price is still fixed at hold time and computed on the server.</p>` },
        { type: "code", lang: "java", title: "Pricing behind an interface", code: `interface PricingStrategy { long pricePaise(Show show, List<Seat> seats); }

/** The base rule: a price per seat category, set per show. */
record CategoryPricing(Map<SeatCategory, Long> pricePaise) implements PricingStrategy {
    public long pricePaise(Show show, List<Seat> seats) {
        long total = 0;
        for (Seat s : seats) total = Math.addExact(total, pricePaise.get(s.category()));
        return total;
    }
}

/** A weekend surcharge in basis points (2000 = 20%), rounded half up to the paisa. */
record WeekendSurcharge(PricingStrategy base, int basisPoints, ZoneId zone) implements PricingStrategy {
    public long pricePaise(Show show, List<Seat> seats) {
        long price = base.pricePaise(show, seats);
        DayOfWeek day = show.start.atZone(zone).getDayOfWeek();
        if (day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY) return price;
        return BigDecimal.valueOf(price).multiply(BigDecimal.valueOf(10_000L + basisPoints))
            .divide(BigDecimal.valueOf(10_000L), 0, RoundingMode.HALF_UP).longValueExact();
    }
}

/** A flat convenience fee per seat. */
record PerSeatFee(PricingStrategy base, long feePaise) implements PricingStrategy {
    public long pricePaise(Show show, List<Seat> seats) {
        return Math.addExact(base.pricePaise(show, seats), Math.multiplyExact(feePaise, (long) seats.size()));
    }
}

// Show takes a PricingStrategy instead of the price map, and hold() computes:
//     long amount = pricing.pricePaise(this, seats);       // on the server, once, under the lock
// Wiring: new PerSeatFee(new WeekendSurcharge(new CategoryPricing(prices), 2000, zone), 3000)` },
        { type: "keypoints", items: [
          "Strategies are immutable records, so one instance can be shared by every show and called under the show's lock without extra locking.",
          "Multiply before dividing and round once, with an explicit rule (HALF_UP); never pass money through <code>double</code>.",
          "A coupon is one more wrapper, but its usage limit is shared state across shows: track redemptions in their own service with an atomic claim, not inside the pricing rule."
        ] }
      ]
    },
    {
      id: "premiere-locking",
      title: "\"A premiere has thousands of buyers on one show. Is one lock per show enough?\"",
      kicker: "Follow-up: contention",
      blocks: [
        { type: "text", html: `<p>Usually yes. Payment is outside the lock, so the lock covers a few map operations: microseconds per request, which is hundreds of thousands of holds per second on one show. If profiling shows real contention, the lock can be split per seat, so two holds for different seats never wait for each other. The cost is that every multi-seat operation must take its seats' locks in one global order, or two overlapping requests can deadlock.</p>` },
        { type: "code", lang: "java", title: "Per-seat locks taken in a fixed order", code: `/** One show's seat ownership with one lock per seat. Seat ids are validated by the caller. */
final class FineGrainedSeats {
    private final Map<String, ReentrantLock> locks;          // one per seat, built once, read-only after
    private final Map<String, String> owner = new ConcurrentHashMap<>();   // each entry changed only under its seat's lock

    FineGrainedSeats(Screen screen) {
        Map<String, ReentrantLock> m = new HashMap<>();
        for (Seat s : screen.seats()) m.put(s.id(), new ReentrantLock());
        this.locks = Map.copyOf(m);
    }

    /** All or nothing, like Show.hold. Returns the seats that were taken; empty means claimed. */
    List<String> claim(Collection<String> seatIds, String holdId) {
        List<String> ordered = seatIds.stream().distinct().sorted().toList();   // one global order: no deadlock
        List<ReentrantLock> held = new ArrayList<>();
        try {
            for (String id : ordered) {
                ReentrantLock lock = locks.get(id);
                lock.lock();
                held.add(lock);
            }
            List<String> taken = ordered.stream().filter(owner::containsKey).toList();
            if (taken.isEmpty()) ordered.forEach(id -> owner.put(id, holdId));
            return taken;
        } finally {
            for (int i = held.size() - 1; i >= 0; i--) held.get(i).unlock();
        }
    }
}` },
        { type: "tradeoffs", prosLabel: "Per-seat locks", consLabel: "Costs", pros: ["Holds for different seats of one show run in parallel", "Still all or nothing"], cons: ["Expiry, confirm and cancel must take the same locks in the same order", "Hold and booking records need their own concurrent maps", "Rarely the real bottleneck: at premiere scale the limit is usually the network and the database"] },
        { type: "callout", tone: "interview", html: `<p>Say both halves: "One lock per show is enough, because the lock never covers the payment. If it ever isn't, I'd lock per seat in sorted order, and the class that changes is Show; the service doesn't notice." For a real stampede, the usual answer is a <em>waiting room</em> in front of the seat map that admits buyers at a fixed rate, rather than finer locks.</p>` }
      ]
    },
    {
      id: "listeners",
      title: "\"How would you tell users when seats free up, or when a show is cancelled?\"",
      kicker: "Follow-up: notifications",
      blocks: [
        { type: "text", html: `<p>Seats come back when a hold expires or a booking is cancelled, and a whole show can be cancelled by the cinema. A waitlist, a refund job and an email sender all care. That is the <strong>Observer</strong> pattern: <code>Show</code> keeps a list of listeners and tells them what changed. The one rule is to call listeners <em>after</em> releasing the lock, so a slow email server cannot stall the seat map.</p>` },
        { type: "code", lang: "java", title: "Listeners for released seats and a waitlist", code: `interface ShowListener {
    void seatsReleased(Show show, List<Seat> seats);         // a hold expired or a booking was cancelled
    void showCancelled(Show show, List<Booking> bookings);   // every booking needs a refund and a message
}

// In Show. Listeners are added at start-up and read on every release, so a copy-on-write list.
private final List<ShowListener> listeners = new CopyOnWriteArrayList<>();
private boolean closed;                                      // guarded by this; hold() refuses when true

void addListener(ShowListener l) { listeners.add(l); }

/** cancel() splits in two: the locked part changes state, the unlocked part notifies. */
Booking cancel(String bookingId, String userId, Instant now) {
    Booking b;
    synchronized (this) { b = cancelLocked(bookingId, userId, now); }   // the old method body
    listeners.forEach(l -> l.seatsReleased(this, b.seats()));          // lock released: slow listeners can't block
    return b;
}

/** The cinema cancels the whole show: no new holds, and every booking is handed over for refunds. */
List<Booking> cancelShow() {
    List<Booking> affected;
    synchronized (this) {
        closed = true;
        affected = List.copyOf(bookings.values());
        bookings.clear(); holds.clear(); owner.clear();
    }
    listeners.forEach(l -> l.showCancelled(this, affected));
    return affected;
}

/** A waitlist is one listener: freed seats are offered to the first user waiting for that show. */
final class Waitlist implements ShowListener {
    private final Map<String, Queue<String>> waiting = new ConcurrentHashMap<>();   // show id -> user ids
    private final Notifier notifier;                         // injected: email, SMS, push

    Waitlist(Notifier notifier) { this.notifier = notifier; }

    void join(String showId, String userId) {
        waiting.computeIfAbsent(showId, k -> new ConcurrentLinkedQueue<>()).add(userId);
    }

    public void seatsReleased(Show show, List<Seat> seats) {
        Queue<String> queue = waiting.get(show.id);
        String next = queue == null ? null : queue.poll();
        if (next != null) notifier.send(next, seats.size() + " seats just opened for " + show.movie.title());
    }

    public void showCancelled(Show show, List<Booking> bookings) {
        waiting.remove(show.id);
        for (Booking b : bookings) notifier.send(b.userId(), "Your show was cancelled; a refund is on its way");
    }
}

interface Notifier { void send(String userId, String message); }` },
        { type: "keypoints", items: [
          "Lazy expiry frees seats inside other calls; have <code>expireHolds</code> return the released seats so the calling method can notify after its lock is released.",
          "The waitlist only notifies; it does not hold seats for the user. Holding on their behalf would need its own expiry, and the first person to click still wins.",
          "Refunds for a cancelled show belong in a listener that retries, not in the show: the show's job ends once its seats are cleared."
        ] }
      ]
    },
    {
      id: "database",
      title: "\"What changes with several servers and a database?\"",
      kicker: "Follow-up: beyond one process",
      blocks: [
        { type: "text", html: `<p>A <code>synchronized</code> method protects one process. With several servers, exactly-one-wins has to be enforced where the seat state lives: the database. The design maps across almost one to one. <code>Show</code>'s owner map becomes a row per show and seat, the lock becomes a conditional update, and "check all, then claim all" becomes "update all, and check the row count".</p>` },
        { type: "table", headers: ["In memory", "With a database"], rows: [
          ["<code>owner</code> map in each Show", "A <code>show_seats</code> row per (show, seat), created when the show is scheduled"],
          ["<code>synchronized</code> on the show", "A conditional <code>UPDATE ... WHERE status = 'FREE'</code> in one transaction"],
          ["Check every seat, then claim every seat", "Update all requested rows; if the row count is short, roll back"],
          ["Lazy expiry", "Treat a held row whose expiry has passed as free in the same <code>WHERE</code> clause"],
          ["Re-check the hold at confirm", "<code>UPDATE ... WHERE hold_id = ? AND hold_expires_at &gt; now</code>; a short count means refund"],
          ["Idempotency key on the charge", "Unchanged: the gateway dedupes by hold id"]
        ] },
        { type: "code", lang: "text", title: "Hold and confirm as conditional updates", code: `-- hold: claim every seat or none, in one transaction
UPDATE show_seats
   SET status = 'HELD', hold_id = :hold, user_id = :user, hold_expires_at = :now + interval '10 minutes'
 WHERE show_id = :show AND seat_id IN (:seats)
   AND (status = 'FREE' OR (status = 'HELD' AND hold_expires_at <= :now));
-- rows updated != number of seats requested: ROLLBACK, nothing is held

-- confirm, after the gateway charge succeeds
UPDATE show_seats SET status = 'BOOKED'
 WHERE hold_id = :hold AND status = 'HELD' AND hold_expires_at > :now;
-- rows updated != number of seats in the hold: refund the charge` },
        { type: "quiz", q: "Two servers run the hold UPDATE at the same moment: one for {C5, C6}, the other for {C6, C7}. All three seats were free. What happens?", options: [
          "Both succeed, and C6 ends up owned by whichever wrote last",
          "One updates 2 rows and commits; the other waits for the C6 row lock, then updates only C7, sees 1 row instead of 2, and rolls back",
          "Both fail, because the rows conflict",
          "The second one updates C7 and keeps it as a partial hold"
        ], answer: 1, explain: `<p>Row locks serialise the two updates on C6. When the second statement re-evaluates its <code>WHERE</code> clause, C6 is no longer free, so only C7 matches. The row count (1, not 2) is the all-or-nothing check: the second transaction rolls back and C7 stays free, exactly like <code>Show.hold</code> throwing before it claims anything.</p>` }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one class: the hold lifecycle and locking live in Show, pricing in a strategy Show receives, notifications in listeners.",
    "Extend a hold once when payment starts, and give the gateway a timeout shorter than the extension.",
    "Pricing is a stack of immutable strategies working in long paise with one explicit rounding rule.",
    "One lock per show is enough because payment is outside it; per-seat locks need one global order, and a waiting room is the real answer to a stampede.",
    "Notify listeners after releasing the lock, never inside it.",
    "Across servers, a conditional update per seat row with a row-count check gives the same all-or-nothing guarantee as the show lock."
  ]
};
