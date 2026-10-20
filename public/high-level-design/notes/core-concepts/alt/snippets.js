// Java and Go versions of the core concepts' Python and JavaScript snippets, matched to the code blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
(function () {
const retryJava = `<T> T callWithRetry(Callable<T> fn, int attempts, long baseMs, long capMs) throws Exception {
    for (int i = 0; ; i++) {
        try {
            return fn.call();
        } catch (Exception err) {
            if (i + 1 >= attempts || !isRetryable(err)) throw err;
            long ceiling = Math.min(capMs, baseMs << i);
            Thread.sleep(ThreadLocalRandom.current().nextLong(ceiling));   // full jitter: anywhere in [0, ceiling)
        }
    }
}
// callWithRetry(() -> client.send(req), 4, 100, 5_000)`;
const retryGo = `func CallWithRetry[T any](ctx context.Context, fn func(context.Context) (T, error), attempts int, base, maxDelay time.Duration) (T, error) {
	for i := 0; ; i++ {
		v, err := fn(ctx)
		if err == nil || i+1 >= attempts || !isRetryable(err) {
			return v, err
		}
		ceiling := min(maxDelay, base<<i)
		select { // full jitter: anywhere in [0, ceiling)
		case <-time.After(rand.N(ceiling)):
		case <-ctx.Done():
			var zero T
			return zero, ctx.Err()
		}
	}
}
// CallWithRetry(ctx, client.Send, 4, 100*time.Millisecond, 5*time.Second)`;

const cacheJava = `Profile getProfile(String userId) {
    String key = "user:" + userId + ":profile";
    String value = redis.get(key);                            // Jedis
    if (value != null) return deserialize(value);             // hit
    Profile row = db.fetchProfile(userId);                    // miss: go to the source of truth
    redis.setex(key, 600, serialize(row));                    // fill with a 10-minute TTL
    return row;
}

void updateProfile(String userId, Changes changes) {
    db.updateProfile(userId, changes);                        // write the database first
    redis.del("user:" + userId + ":profile");                 // then invalidate; next read refills
}`;
const cacheGo = `func GetProfile(ctx context.Context, userID string) (Profile, error) {
	key := "user:" + userID + ":profile"
	if v, err := rdb.Get(ctx, key).Result(); err == nil { // go-redis
		return deserialize(v) // hit
	}
	row, err := db.FetchProfile(ctx, userID) // miss: go to the source of truth
	if err != nil {
		return Profile{}, err
	}
	rdb.Set(ctx, key, serialize(row), 10*time.Minute) // fill with a 10-minute TTL
	return row, nil
}

func UpdateProfile(ctx context.Context, userID string, changes Changes) error {
	if err := db.UpdateProfile(ctx, userID, changes); err != nil { // write the database first
		return err
	}
	return rdb.Del(ctx, "user:"+userID+":profile").Err() // then invalidate; next read refills
}`;

const flightJava = `String get(String key) throws InterruptedException {
    String value = redis.get(key);
    if (value != null) return value;
    String lock = "lock:" + key;
    if ("OK".equals(redis.set(lock, "1", SetParams.setParams().nx().ex(5)))) {   // only one rebuilder
        try {
            value = loadFromDb(key);
            int ttl = 600 + ThreadLocalRandom.current().nextInt(61);           // jitter the expiry
            redis.setex(key, ttl, value);
            return value;
        } finally {
            redis.del(lock);
        }
    }
    Thread.sleep(50);                                                         // someone else is rebuilding
    value = redis.get(key);
    return value != null ? value : loadFromDb(key);                           // fall back if still missing
}`;
const flightGo = `func Get(ctx context.Context, key string) (string, error) {
	if v, err := rdb.Get(ctx, key).Result(); err == nil {
		return v, nil
	}
	lock := "lock:" + key
	if ok, _ := rdb.SetNX(ctx, lock, 1, 5*time.Second).Result(); ok { // only one rebuilder
		defer rdb.Del(ctx, lock)
		v, err := loadFromDB(ctx, key)
		if err != nil {
			return "", err
		}
		ttl := 600*time.Second + time.Duration(rand.IntN(61))*time.Second // jitter the expiry
		rdb.Set(ctx, key, v, ttl)
		return v, nil
	}
	time.Sleep(50 * time.Millisecond) // someone else is rebuilding
	if v, err := rdb.Get(ctx, key).Result(); err == nil {
		return v, nil
	}
	return loadFromDB(ctx, key) // fall back if still missing
}
// In-process, golang.org/x/sync/singleflight collapses concurrent loads of the same key.`;

const ringJava = `TreeMap<Long, String> ring = new TreeMap<>();               // position -> physical node
for (String node : nodes)
    for (int i = 0; i < V; i++) ring.put(hash(node + "-vn" + i), node);

String owner(String key) {
    Map.Entry<Long, String> e = ring.ceilingEntry(hash(key)); // first position >= h
    return (e != null ? e : ring.firstEntry()).getValue();     // wrap around the circle
}

List<String> replicas(String key, int r) { ... }              // next r distinct physical nodes clockwise`;
const ringGo = `type vnode struct {
	pos  uint64
	node string
}

var ring []vnode // sorted by pos
for _, node := range nodes {
	for i := 0; i < V; i++ {
		ring = append(ring, vnode{hash(fmt.Sprintf("%s-vn%d", node, i)), node})
	}
}
slices.SortFunc(ring, func(a, b vnode) int { return cmp.Compare(a.pos, b.pos) })

func owner(key string) string {
	h := hash(key)
	i := sort.Search(len(ring), func(i int) bool { return ring[i].pos >= h }) // first position >= h
	return ring[i%len(ring)].node                                            // wrap around the circle
}

func replicas(key string, r int) []string { /* next r distinct physical nodes clockwise */ }`;

ALT["ch6"] = {
  java: { "Retry with capped exponential backoff and full jitter": retryJava },
  go: { "Retry with capped exponential backoff and full jitter": retryGo }
};
ALT["ch12"] = {
  java: { "Cache-aside in a few lines": cacheJava, "Cache-aside in code": cacheJava },
  go: { "Cache-aside in a few lines": cacheGo, "Cache-aside in code": cacheGo }
};
ALT["ch13"] = {
  java: { "Single-flight rebuild with a Redis lock": flightJava, "Single-flight rebuild": flightJava },
  go: { "Single-flight rebuild with a Redis lock": flightGo, "Single-flight rebuild": flightGo }
};
ALT["ch16"] = {
  java: { "Ring lookup": ringJava },
  go: { "Ring lookup": ringGo }
};
})();
