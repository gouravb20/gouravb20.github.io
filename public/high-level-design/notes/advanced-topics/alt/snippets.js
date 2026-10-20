// Java and Go versions of the advanced topics' Python snippets, matched to the code blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
(function () {
const bloomJava = `final class Bloom {
    private final int m, k;          // bits, hashes
    private final BitSet bits;

    Bloom(long n, double p) {
        m = (int) Math.ceil(-n * Math.log(p) / (Math.log(2) * Math.log(2)));
        k = Math.max(1, (int) Math.round((double) m / n * Math.log(2)));
        bits = new BitSet(m);
    }

    private int[] positions(String item) {          // double hashing: h1 + i * h2
        long h = Hashing.murmur3_128().hashString(item, UTF_8).asLong();   // Guava
        int h1 = (int) h, h2 = (int) (h >>> 32);
        int[] out = new int[k];
        for (int i = 0; i < k; i++) out[i] = Math.floorMod(h1 + i * h2, m);
        return out;
    }

    void add(String item) { for (int i : positions(item)) bits.set(i); }

    boolean maybeContains(String item) {
        for (int i : positions(item)) if (!bits.get(i)) return false;
        return true;                                // "maybe": false positives are possible
    }
}`;
const bloomGo = `type Bloom struct {
	m, k uint64 // bits, hashes
	bits []uint64
}

func NewBloom(n uint64, p float64) *Bloom {
	m := uint64(math.Ceil(-float64(n) * math.Log(p) / (math.Ln2 * math.Ln2)))
	k := max(1, uint64(math.Round(float64(m)/float64(n)*math.Ln2)))
	return &Bloom{m: m, k: k, bits: make([]uint64, (m+63)/64)}
}

func (b *Bloom) positions(item string) []uint64 { // double hashing: h1 + i * h2
	h := fnv.New64a()
	h.Write([]byte(item))
	sum := h.Sum64()
	h1, h2 := sum&0xffffffff, sum>>32
	out := make([]uint64, b.k)
	for i := range out {
		out[i] = (h1 + uint64(i)*h2) % b.m
	}
	return out
}

func (b *Bloom) Add(item string) {
	for _, i := range b.positions(item) {
		b.bits[i/64] |= 1 << (i % 64)
	}
}

func (b *Bloom) MaybeContains(item string) bool { // "maybe": false positives are possible
	for _, i := range b.positions(item) {
		if b.bits[i/64]&(1<<(i%64)) == 0 {
			return false
		}
	}
	return true
}`;

const morrisJava = `final class MorrisCounter {
    private final double a;   // a = 1 is the base-2 counter; larger a means smaller steps
    private int v;            // the only state

    MorrisCounter(double a) { this.a = a; }

    void increment() {
        double base = 1 + 1 / a;
        if (ThreadLocalRandom.current().nextDouble() < Math.pow(base, -v)) v++;
    }

    double estimate() {
        double base = 1 + 1 / a;
        return a * (Math.pow(base, v) - 1);
    }
}`;
const morrisGo = `type MorrisCounter struct {
	a float64 // a = 1 is the base-2 counter; larger a means smaller steps
	v int     // the only state
}

func (c *MorrisCounter) Increment() {
	base := 1 + 1/c.a
	if rand.Float64() < math.Pow(base, -float64(c.v)) {
		c.v++
	}
}

func (c *MorrisCounter) Estimate() float64 {
	base := 1 + 1/c.a
	return c.a * (math.Pow(base, float64(c.v)) - 1)
}`;
const morrisAvgJava = morrisJava + `

// Average k counters to cut the variance by k
MorrisCounter[] counters = new MorrisCounter[8];
for (int i = 0; i < counters.length; i++) counters[i] = new MorrisCounter(30);
for (int n = 0; n < 100_000; n++) for (MorrisCounter c : counters) c.increment();
System.out.println(Arrays.stream(counters).mapToDouble(MorrisCounter::estimate).average().orElse(0));   // ~100,000`;
const morrisAvgGo = morrisGo + `

// Average k counters to cut the variance by k
counters := make([]MorrisCounter, 8)
for i := range counters {
	counters[i].a = 30
}
for n := 0; n < 100_000; n++ {
	for i := range counters {
		counters[i].Increment()
	}
}
var sum float64
for _, c := range counters {
	sum += c.Estimate()
}
fmt.Println(sum / float64(len(counters))) // ~100,000`;

const topkJava = `// vectors: N unit-length float[d] rows, normalized once at load time
int[] topK(float[][] vectors, float[] query, int k) {
    float[] q = normalize(query);
    PriorityQueue<Integer> heap = new PriorityQueue<>(Comparator.comparingDouble(i -> dot(vectors[i], q)));
    for (int i = 0; i < vectors.length; i++) {          // keep the k best: O(N log k), no full sort
        heap.add(i);
        if (heap.size() > k) heap.poll();              // drop the worst of the k + 1
    }
    int[] best = new int[heap.size()];
    for (int j = best.length - 1; j >= 0; j--) best[j] = heap.poll();   // best first
    return best;
}

static float dot(float[] a, float[] b) {               // cosine == dot product for unit vectors
    float s = 0;
    for (int i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}`;
const topkGo = `// vectors: N unit-length rows, normalized once at load time
func TopK(vectors [][]float32, query []float32, k int) []int {
	q := normalize(query)
	scores := make([]float32, len(vectors))
	idx := make([]int, len(vectors))
	for i, v := range vectors {
		scores[i], idx[i] = dot(v, q), i // cosine == dot product for unit vectors
	}
	slices.SortFunc(idx, func(a, b int) int { return cmp.Compare(scores[b], scores[a]) }) // best first
	return idx[:min(k, len(idx))] // for very large N, keep a size-k min-heap instead: O(N log k)
}

func dot(a, b []float32) float32 {
	var s float32
	for i := range a {
		s += a[i] * b[i]
	}
	return s
}`;

const cdcJava = `void apply(ChangeEvent event) {
    String key = event.key().id();
    long pos = event.source().lsn();
    Doc doc = index.get(key);
    if (doc != null && doc.srcPos() >= pos) return;          // duplicate or out-of-date: skip
    if (event.op() == Op.DELETE) {
        index.delete(key);                                    // keep a tombstone with pos if deletes can race
    } else {
        index.put(key, Doc.from(event.after(), pos));
    }
}`;
const cdcGo = `func Apply(e ChangeEvent) error {
	key := e.Key.ID
	pos := e.Source.LSN
	if doc, ok := index.Get(key); ok && doc.SrcPos >= pos {
		return nil // duplicate or out-of-date: skip
	}
	if e.Op == OpDelete {
		return index.Delete(key) // keep a tombstone with pos if deletes can race
	}
	return index.Put(key, DocFrom(e.After, pos))
}`;

ALT["ch3"] = {
  java: { "A Bloom filter in a few lines": bloomJava },
  go: { "A Bloom filter in a few lines": bloomGo }
};
ALT["ch5"] = {
  java: { "A Morris counter (a = 1 is base 2: probability 2^-v, estimate 2^v - 1)": morrisJava, "A Morris counter in a few lines": morrisAvgJava },
  go: { "A Morris counter (a = 1 is base 2: probability 2^-v, estimate 2^v - 1)": morrisGo, "A Morris counter in a few lines": morrisAvgGo }
};
ALT["ch6"] = {
  java: { "Exact top-k with NumPy (argpartition finds top k without a full sort)": topkJava, "Exact search with NumPy": topkJava },
  go: { "Exact top-k with NumPy (argpartition finds top k without a full sort)": topkGo, "Exact search with NumPy": topkGo }
};
ALT["ch10"] = {
  java: { "A version-aware consumer (Elasticsearch external versioning enforces the same rule)": cdcJava },
  go: { "A version-aware consumer (Elasticsearch external versioning enforces the same rule)": cdcGo }
};
})();
