/**
 * The handful of statistics the index needs, written to match the numpy,
 * pandas and scikit-learn calls in the Python stages exactly, because the two
 * implementations publish the same quantities and must not disagree in the
 * fourth decimal place.
 */

export function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Population standard deviation (ddof=0), as `Series.std(ddof=0)`. */
export function populationStd(values) {
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/** `zscore` from 05_hvi.py: a constant column scores zero rather than NaN. */
export function zscores(values) {
  const m = mean(values);
  const sigma = populationStd(values);
  if (sigma === 0 || Number.isNaN(sigma)) return values.map(() => 0);
  return values.map((v) => (v - m) / sigma);
}

/** Linear-interpolated quantile, pandas' default. */
export function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Median that averages the two middle values, as Earth Engine's does. */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Rank descending, ties sharing the lower number: pandas `rank(ascending=False, method="min")`. */
export function rankDescending(values) {
  const sorted = [...values].sort((a, b) => b - a);
  return values.map((v) => sorted.indexOf(v) + 1);
}

export function pearson(a, b) {
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}

/** Kendall tau-b, which is what `scipy.stats.kendalltau` returns. */
export function kendallTau(a, b) {
  let concordant = 0;
  let discordant = 0;
  let tiesA = 0;
  let tiesB = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const da = Math.sign(a[i] - a[j]);
      const db = Math.sign(b[i] - b[j]);
      if (da === 0 && db === 0) continue;
      if (da === 0) tiesA++;
      else if (db === 0) tiesB++;
      else if (da === db) concordant++;
      else discordant++;
    }
  }
  const denominator = Math.sqrt((concordant + discordant + tiesA) * (concordant + discordant + tiesB));
  return denominator === 0 ? NaN : (concordant - discordant) / denominator;
}

/**
 * Eigen-decomposition of a small symmetric matrix by cyclic Jacobi rotations.
 * Returns eigenvalues descending with their unit eigenvectors as rows.
 */
export function symmetricEigen(matrix) {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => ({ value: a[i][i], vector: v.map((row) => row[i]) })).sort(
    (x, y) => y.value - x.value,
  );
}

/**
 * First principal component of `columns` (one array per variable), as
 * `sklearn.decomposition.PCA` computes it: sample covariance, n - 1 in the
 * denominator. The sign of the loading vector is arbitrary here, as it is
 * there; the caller orients it.
 */
export function firstPrincipalComponent(columns) {
  const k = columns.length;
  const n = columns[0].length;
  const means = columns.map(mean);
  const covariance = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let sum = 0;
      for (let r = 0; r < n; r++) sum += (columns[i][r] - means[i]) * (columns[j][r] - means[j]);
      covariance[i][j] = covariance[j][i] = sum / (n - 1);
    }
  }
  const eigen = symmetricEigen(covariance);
  const total = eigen.reduce((s, e) => s + e.value, 0);
  return { loadings: eigen[0].vector, explainedVarianceRatio: eigen[0].value / total };
}
