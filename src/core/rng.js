// Seeded, serialisable RNG (mulberry32). The whole game is replayable from `seed`
// and `s` (current state) is stored in saves so reloads don't re-roll outcomes.

export class RNG {
  constructor(seed = (Date.now() ^ 0x9e3779b9) >>> 0) {
    this.s = seed >>> 0;
  }

  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(a = 0, b = 1) { return a + this.next() * (b - a); }
  /** Inclusive integer range. */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** Weighted pick. `wfn(item)` returns a non-negative weight. */
  weighted(arr, wfn) {
    let total = 0;
    const ws = arr.map((x) => { const w = Math.max(0, wfn(x)); total += w; return w; });
    if (total <= 0) return null;
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r < 0) return arr[i]; }
    return arr[arr.length - 1];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
