/**
 * Reading windows out of cloud-optimised GeoTIFFs over HTTP, and reducing them
 * onto grid cells.
 *
 * Nothing is downloaded whole. A Landsat scene is about 60 MB per band and the
 * India population raster several gigabytes; each read here asks for only the
 * blocks covering the city, by HTTP range request.
 */

import { fromArrayBuffer, fromUrl } from "geotiff";
import { bboxOf, pointInGeometry } from "./geo.mjs";

const STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const SAS_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token";

async function fetchJson(url, init, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return await response.json();
      last = new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
  }
  throw last;
}

/**
 * Range reads against blob storage fail now and then for no reason a caller can
 * act on. One retry after a pause clears almost all of them; a build that reads
 * a few hundred blocks should not die on the first.
 */
export async function withRetry(task, attempts = 5) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await task();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (i + 1)));
    }
  }
  throw last;
}

/** Every item in a Planetary Computer collection intersecting `bbox` in the date range, following pagination. */
export async function stacSearch(collection, bbox, datetime, query = undefined) {
  const items = [];
  let body = { collections: [collection], bbox, datetime, limit: 100, ...(query ? { query } : {}) };
  let url = STAC_SEARCH;
  for (;;) {
    const page = await fetchJson(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    items.push(...page.features);
    const next = (page.links ?? []).find((l) => l.rel === "next");
    if (!next) return items;
    url = next.href;
    body = next.body ?? body;
  }
}

const tokens = new Map();

/**
 * Planetary Computer assets need a short-lived read token appended. No account
 * is involved. One token covers a whole collection, so it is fetched once and
 * reused: asking for a signature per asset is a few hundred requests for one
 * season of Landsat, and the signing endpoint rate-limits long before that.
 */
export async function signHref(collection, href) {
  if (!tokens.has(collection)) {
    tokens.set(collection, fetchJson(`${SAS_TOKEN}/${collection}`).then((body) => body.token));
  }
  return `${href}?${await tokens.get(collection)}`;
}

/**
 * Reads the part of a GeoTIFF covering `bbox` (in the image's own CRS) onto a
 * fixed lattice, so several scenes can be stacked pixel for pixel.
 *
 * The lattice is the caller's: `originX`/`originY` is its top-left corner and
 * `resolution` its pixel size. Pixels the image does not cover come back as
 * `fill`. The image's own pixels are used as they are where the two lattices
 * line up, which they do for every Landsat scene in one UTM zone, and the
 * nearest one otherwise.
 */
export async function readOntoLattice(url, { originX, originY, resolution, width, height }, fill = 0) {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const [imgOriginX, imgOriginY] = image.getOrigin();
  const [resX, resYSigned] = image.getResolution();
  const resY = Math.abs(resYSigned);
  if (Math.abs(resX - resolution) > 1e-6 || Math.abs(resY - resolution) > 1e-6) {
    throw new Error(`image resolution ${resX} x ${resY} does not match the ${resolution} lattice`);
  }

  const offsetX = Math.round((originX - imgOriginX) / resolution);
  const offsetY = Math.round((imgOriginY - originY) / resolution);
  const x0 = Math.max(offsetX, 0);
  const y0 = Math.max(offsetY, 0);
  const x1 = Math.min(offsetX + width, image.getWidth());
  const y1 = Math.min(offsetY + height, image.getHeight());

  const sample = image.getSampleFormat?.() === 3 ? Float32Array : Uint16Array;
  const out = new sample(width * height).fill(fill);
  if (x1 <= x0 || y1 <= y0) return out;

  const [band] = await image.readRasters({ window: [x0, y0, x1, y1] });
  const windowWidth = x1 - x0;
  for (let row = 0; row < y1 - y0; row++) {
    out.set(
      band.subarray(row * windowWidth, (row + 1) * windowWidth),
      (row + y0 - offsetY) * width + (x0 - offsetX),
    );
  }
  return out;
}

/**
 * Reads the native pixels of a geographic (lon/lat) GeoTIFF covering `bbox`.
 * Returns the values with the exact georeferencing of the window read.
 * `source` is a URL, read by range request, or the file's bytes.
 */
export async function readGeographicWindow(source, [minLon, minLat, maxLon, maxLat]) {
  const tiff = typeof source === "string" ? await fromUrl(source) : await fromArrayBuffer(source);
  const image = await tiff.getImage();
  const [originLon, originLat] = image.getOrigin();
  const [resLon, resLatSigned] = image.getResolution();
  const resLat = Math.abs(resLatSigned);

  const x0 = Math.max(Math.floor((minLon - originLon) / resLon), 0);
  const x1 = Math.min(Math.ceil((maxLon - originLon) / resLon), image.getWidth());
  const y0 = Math.max(Math.floor((originLat - maxLat) / resLat), 0);
  const y1 = Math.min(Math.ceil((originLat - minLat) / resLat), image.getHeight());
  if (x1 <= x0 || y1 <= y0) throw new Error("the requested window does not intersect the image");

  const [values] = await image.readRasters({ window: [x0, y0, x1, y1] });
  return {
    values,
    width: x1 - x0,
    height: y1 - y0,
    originLon: originLon + x0 * resLon,
    originLat: originLat - y0 * resLat,
    resLon,
    resLat,
    nodata: image.getGDALNoData(),
  };
}

/**
 * Calls `visit(index)` for every pixel whose centre falls inside `geometry`.
 * `lattice` describes a north-up raster: origin at the top-left corner, in the
 * same coordinates as the geometry.
 */
export function forEachPixelIn(geometry, { originX, originY, resX, resY, width, height }, visit) {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  const c0 = Math.max(Math.floor((minX - originX) / resX), 0);
  const c1 = Math.min(Math.ceil((maxX - originX) / resX), width);
  const r0 = Math.max(Math.floor((originY - maxY) / resY), 0);
  const r1 = Math.min(Math.ceil((originY - minY) / resY), height);
  for (let r = r0; r < r1; r++) {
    const y = originY - (r + 0.5) * resY;
    for (let c = c0; c < c1; c++) {
      if (pointInGeometry(originX + (c + 0.5) * resX, y, geometry)) visit(r * width + c);
    }
  }
}

/** One-dimensional squared distance transform (Felzenszwalb and Huttenlocher), unit spacing, in place via `out`. */
function distanceTransform1d(f, n, out, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s > z[k]) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    out[q] = (q - p) * (q - p) + f[p];
  }
}

/**
 * Exact Euclidean distance, in metres, from every pixel to the nearest pixel
 * where `isTarget` is true. Pixels are `stepX` by `stepY` metres, which need
 * not be equal: a 10 m WorldCover pixel is narrower east-west than north-south
 * away from the equator.
 */
export function distanceToNearest(isTarget, width, height, stepX, stepY) {
  // A large finite stand-in for infinity: Infinity - Infinity is NaN in the
  // parabola intersection, and a row with no target at all would produce it.
  const FAR = 1e12;
  const grid = new Float64Array(width * height);
  const longest = Math.max(width, height);
  const f = new Float64Array(longest);
  const out = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);

  // Along rows, in units of stepX squared.
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) f[c] = isTarget[r * width + c] ? 0 : FAR;
    distanceTransform1d(f, width, out, v, z);
    for (let c = 0; c < width; c++) grid[r * width + c] = out[c] * stepX * stepX;
  }
  // Along columns: min over q of (p - q)^2 stepY^2 + g(q), done at unit spacing on g / stepY^2.
  const scale = stepY * stepY;
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) f[r] = grid[r * width + c] / scale;
    distanceTransform1d(f, height, out, v, z);
    for (let r = 0; r < height; r++) grid[r * width + c] = Math.sqrt(out[r] * scale);
  }
  return grid;
}
