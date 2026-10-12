/**
 * K-means clustering, small and deterministic.
 *
 * Used to sort a city's localities into a few types by their indicator
 * profile: which ones are crowded and built-up, which are hot open land, and so
 * on. That is a different question from the score. The score says how much
 * attention a locality needs; the type says what kind of place it is, and two
 * localities with the same score can need different things.
 *
 * Deterministic on purpose. K-means starts from random centres and can land on
 * a different answer each run, which is no good for a published label that
 * gets committed and compared. The random numbers here come from a seeded
 * generator, so the same data always yields the same clusters.
 */

/** A small seeded random number generator (mulberry32). Same seed, same sequence. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function squaredDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return sum;
}

/** k-means++ seeding: each new centre is drawn in proportion to its squared distance from the nearest one already chosen. */
function initialCentres(points, k, random) {
  const centres = [points[Math.floor(random() * points.length)]];
  while (centres.length < k) {
    const distances = points.map((p) => Math.min(...centres.map((c) => squaredDistance(p, c))));
    const total = distances.reduce((s, d) => s + d, 0);
    if (total === 0) {
      centres.push(points[Math.floor(random() * points.length)]);
      continue;
    }
    let target = random() * total;
    let chosen = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      target -= distances[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centres.push(points[chosen]);
  }
  return centres.map((c) => [...c]);
}

function runOnce(points, k, random, maxIterations) {
  let centres = initialCentres(points, k, random);
  let assignments = new Array(points.length).fill(-1);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const next = points.map((p) => {
      let best = 0;
      let bestDistance = Infinity;
      centres.forEach((c, j) => {
        const d = squaredDistance(p, c);
        if (d < bestDistance) {
          bestDistance = d;
          best = j;
        }
      });
      return best;
    });
    const changed = next.some((a, i) => a !== assignments[i]);
    assignments = next;
    if (!changed) break;
    centres = centres.map((centre, j) => {
      const members = points.filter((_, i) => assignments[i] === j);
      // An emptied cluster keeps its centre; the next pass can refill it.
      if (members.length === 0) return centre;
      return centre.map((_, d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    });
  }
  const inertia = points.reduce((s, p, i) => s + squaredDistance(p, centres[assignments[i]]), 0);
  return { assignments, centres, inertia };
}

/**
 * Clusters `points` (arrays of equal length) into `k` groups. Runs several
 * seeded starts and keeps the tightest result, since any single start can
 * settle in a poor arrangement.
 */
export function kmeans(points, k, { seed = 7, restarts = 40, maxIterations = 200 } = {}) {
  if (k < 1 || k > points.length) throw new Error(`k must be between 1 and ${points.length}, got ${k}`);
  const random = seededRandom(seed);
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const result = runOnce(points, k, random, maxIterations);
    const filled = new Set(result.assignments).size === k;
    if (filled && (!best || result.inertia < best.inertia - 1e-12)) best = result;
  }
  if (!best) throw new Error(`could not form ${k} non-empty clusters`);
  return best;
}

/**
 * Mean silhouette: for each point, how much closer it is to its own cluster
 * than to the nearest other one, from -1 to 1. Near 1 means clean groups, near
 * 0 means the split is arbitrary. A point alone in its cluster scores 0.
 */
export function silhouette(points, assignments) {
  const clusters = [...new Set(assignments)];
  if (clusters.length < 2) return 0;
  const distance = (a, b) => Math.sqrt(squaredDistance(a, b));
  let total = 0;
  points.forEach((p, i) => {
    const meanTo = (cluster) => {
      const members = points.filter((_, j) => assignments[j] === cluster && j !== i);
      return members.length ? members.reduce((s, m) => s + distance(p, m), 0) / members.length : null;
    };
    const within = meanTo(assignments[i]);
    if (within === null) return;
    const nearest = Math.min(...clusters.filter((c) => c !== assignments[i]).map((c) => meanTo(c) ?? Infinity));
    total += (nearest - within) / Math.max(nearest, within);
  });
  return total / points.length;
}

/**
 * Tries each candidate k and picks one, by a stated rule: the largest k whose
 * silhouette is within `tolerance` of the best.
 *
 * The cleanest split is often the coarsest. Two groups nearly always separate
 * better than three, and "core versus fringe" is true but says little. So when
 * a finer grouping is almost as clean, it is preferred for what it adds; when
 * it is clearly worse, it is not. Every candidate's figures are returned, so
 * the choice can be shown and not just asserted.
 */
export function chooseClusters(points, candidates = [2, 3, 4], { tolerance = 0.05, ...options } = {}) {
  const tried = candidates
    .filter((k) => k < points.length)
    .map((k) => {
      const result = kmeans(points, k, options);
      return { k, ...result, silhouette: silhouette(points, result.assignments) };
    });
  const top = Math.max(...tried.map((t) => t.silhouette));
  const chosen = tried.filter((t) => t.silhouette >= top - tolerance).reduce((a, b) => (b.k > a.k ? b : a));
  return { chosen, tolerance, tried: tried.map(({ k, inertia, silhouette: s }) => ({ k, inertia, silhouette: s })) };
}
