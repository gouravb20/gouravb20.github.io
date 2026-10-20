// Deep dives: Parking Lot (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["parking-lot"] = {
  hook: `<p>The core lot parks and unparks safely. The follow-ups test whether the two strategies and the atomic claim were the right seams: new allocation rules, bigger-spot fallback, display boards, operational edge cases and scale.</p>`,
  sections: [
    {
      id: "floors-and-nearest",
      title: "Floors and nearest-to-entrance allocation",
      kicker: "Follow-up: allocation",
      blocks: [
        { type: "text", html: `<p>Multiple floors and "park nearest the entrance" are just a new <code>SpotAllocationStrategy</code>. Give spots a floor and a distance, and return candidates in the order you want them tried.</p>` },
        { type: "code", lang: "java", title: "Nearest first, with bigger-spot fallback", code: `class NearestFirstAllocation implements SpotAllocationStrategy {
    private static final Map<VehicleType, List<VehicleType>> FITS = Map.of(
        VehicleType.MOTORCYCLE, List.of(VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.TRUCK),
        VehicleType.CAR,        List.of(VehicleType.CAR, VehicleType.TRUCK),
        VehicleType.TRUCK,      List.of(VehicleType.TRUCK));

    public List<ParkingSpot> candidates(List<ParkingSpot> all, VehicleType type) {
        List<ParkingSpot> out = new ArrayList<>();
        for (VehicleType fit : FITS.get(type)) {              // exact size first, then larger
            all.stream()
               .filter(s -> s.type == fit)
               .sorted(Comparator.comparingInt(ParkingSpot::distanceToEntrance))
               .forEach(out::add);
        }
        return out;
    }
}` },
        { type: "callout", tone: "interview", html: `<p>Point out what didn't change: <code>ParkingLot</code>, <code>ParkingSpot</code>, pricing. Also say that pricing stays based on the vehicle, not on the larger spot it happened to get.</p>` }
      ]
    },
    {
      id: "free-queues",
      title: "Scale: queues of free spots",
      kicker: "Follow-up: performance",
      blocks: [
        { type: "problem", html: `<p>Every <code>park</code> scans all spots and tries them one by one: O(n), and under load many threads hammer the same first few spots' locks.</p>` },
        { type: "code", lang: "java", title: "O(1) park and unpark", code: `class FastParkingLot {
    private final Map<VehicleType, ConcurrentLinkedQueue<ParkingSpot>> free = new EnumMap<>(VehicleType.class);

    FastParkingLot(List<ParkingSpot> spots) {
        for (VehicleType t : VehicleType.values()) free.put(t, new ConcurrentLinkedQueue<>());
        for (ParkingSpot s : spots) free.get(s.type).add(s);
    }

    ParkingSpot claim(VehicleType type) {
        ParkingSpot s = free.get(type).poll();               // atomic: each spot goes to one caller
        if (s == null) throw new IllegalStateException("No free spot for " + type);
        return s;
    }

    void release(ParkingSpot s) { free.get(s.type).offer(s); }
}` },
        { type: "keypoints", items: [
          "<code>poll()</code> on a concurrent queue is the atomic claim: no spot can be returned to two callers.",
          "For nearest-first, use a <code>PriorityBlockingQueue</code> ordered by distance (O(log n)).",
          "Counts per type for display boards come for free from the queue sizes."
        ] }
      ]
    },
    {
      id: "display-board",
      title: "Display boards: Observer on spot changes",
      kicker: "Follow-up: notifications",
      blocks: [
        { type: "code", lang: "java", title: "Boards subscribe to spot events", code: `interface SpotListener { void onChange(String floor, VehicleType type, int free); }

class SpotEvents {
    private final List<SpotListener> listeners = new CopyOnWriteArrayList<>();
    void subscribe(SpotListener l) { listeners.add(l); }
    void publish(String floor, VehicleType type, int free) {
        for (SpotListener l : listeners) l.onChange(floor, type, free);
    }
}

// ParkingLot calls events.publish(...) after a successful park or unpark.
// A DisplayBoard implements SpotListener and updates its counters.` },
        { type: "callout", tone: "tip", html: `<p>Keep listeners fast, or hand events to an executor, so a slow display can't slow down the gates. <code>CopyOnWriteArrayList</code> fits because subscriptions are rare and events are frequent.</p>` }
      ]
    },
    {
      id: "operations",
      title: "Lost tickets, reserved and EV spots, gates and payments",
      kicker: "Follow-up: real-world rules",
      blocks: [
        { type: "table", headers: ["Requirement", "Design change"], rows: [
          ["Lost ticket", "Look up the active ticket by plate (a second map), charge a lost-ticket fee via a pricing rule"],
          ["Reserved or EV spots", "A spot attribute; allocation strategies filter by it; EV charging adds a pricing component"],
          ["Several entry and exit gates", "Nothing new: the atomic claim and single-use tickets already make gates safe"],
          ["Payment methods", "A <code>PaymentMethod</code> interface (card, cash, wallet); unpark returns the fee, checkout charges it"],
          ["Persistence", "A <code>UPDATE spots SET occupied = true WHERE id = ? AND occupied = false</code> is the database version of tryOccupy"]
        ] },
        { type: "quiz", q: "Two cars reach different gates at the same instant and both see spot C7 as free in the candidate list. What guarantees only one gets it?", options: [
          "The candidate list is sorted",
          "tryOccupy() checks and sets the occupied flag atomically, so exactly one call returns true",
          "Tickets are stored in a ConcurrentHashMap",
          "The gates take turns"
        ], answer: 1, explain: `<p>Seeing a spot as free is not the same as owning it. <code>tryOccupy()</code> is synchronized and does the check and the write together, so only the first caller gets <code>true</code>; the other moves on to the next candidate.</p>` }
      ]
    }
  ],
  takeaways: [
    "New allocation rules (floors, nearest, bigger-spot fallback) are new strategies; the lot doesn't change.",
    "A concurrent queue of free spots per type gives O(1), atomic claiming.",
    "Display boards are observers of spot changes; keep them off the critical path.",
    "Lost tickets, reserved spots and payment methods slot in as maps, attributes and interfaces.",
    "In a database, a conditional UPDATE is the atomic claim."
  ]
};
