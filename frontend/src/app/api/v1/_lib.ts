/**
 * Shared plumbing for the public v1 API (issue #70).
 *
 * Design decisions worth stating once, here, rather than repeating per route:
 *
 * Co-located with the site rather than a separate service. TourneyRadar runs its
 * API as its own repo, but here the data, the types and the deployment already
 * exist in this project. One repo means one CI run, one deploy, and no chance of
 * the API and the dashboard disagreeing about what a ward looks like.
 *
 * Read-only and unauthenticated. Everything served is already public: the same
 * numbers are in the committed GeoJSON snapshots and on the dashboard. Requiring
 * a key would add friction and a user table without protecting anything. Writes
 * are impossible regardless, because the anon key is constrained by the RLS
 * policies in supabase/migrations/0005_add_rls_policies.sql, verified on
 * 2026-09-03 by attempting anon INSERT, UPDATE and DELETE against the live
 * database and confirming all three are refused.
 *
 * Cached at the edge, hard. The underlying data changes at most monthly (see
 * pipeline/README.md on refresh cadence), so a long s-maxage with a long
 * stale-while-revalidate keeps Supabase's free tier out of the request path for
 * essentially all traffic, and keeps the dashboard up if the database is
 * unavailable.
 *
 * Falls back to the static snapshots. If Supabase is paused, deleted or simply
 * slow, these routes serve the committed files instead of failing. That is the
 * same demo-safe principle the dashboard was built on, and it earned itself
 * again when the Supabase project was found deleted on 2026-09-03.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkRateLimit } from "@/lib/rateLimit";

export const API_VERSION = "v1";

/** Long cache: the data behind it changes monthly at most. */
export const CACHE_HEADER =
  "public, s-maxage=3600, stale-while-revalidate=86400";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": CACHE_HEADER,
      // Open CORS: the whole point is that other people's pages can call this.
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(status: number, message: string, hint?: string): Response {
  return jsonResponse(
    { error: { status, message, ...(hint ? { hint } : {}) } },
    {
      status,
      // Do not cache errors for as long as data; a 404 may become a 200 after a
      // refresh, and a 503 should retry soon.
      headers: { "cache-control": "public, s-maxage=30" },
    }
  );
}

let cachedClient: SupabaseClient | null = null;

/**
 * The anon-key client, or null when the deployment has no Supabase configured.
 *
 * Checks the unprefixed names first. `NEXT_PUBLIC_*` variables are inlined into
 * the bundle at BUILD time, but Vercel deliberately withholds variables marked
 * Sensitive from the build environment, so a sensitive `NEXT_PUBLIC_SUPABASE_URL`
 * compiles to undefined and stays undefined at runtime however it is set. That
 * is exactly what happened on the first deploy of this API: every route silently
 * served the snapshot fallback and /meta reported database_configured false.
 *
 * `SUPABASE_URL` and `SUPABASE_ANON_KEY` are read from the real runtime
 * environment instead, so a server-side route can reach the database whether or
 * not the public names were available when the bundle was built. The anon key is
 * public by design (it ships in the browser bundle and is read-only under the
 * RLS policies), so nothing is weakened by reading it this way.
 */
export function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cachedClient ??= createClient(url, key, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

/**
 * Reads one of the committed snapshots from `public/`.
 *
 * The fallback path for every route. Slower and coarser than a real query, but
 * it is never unavailable, which is the property that matters when the
 * alternative is a 500.
 */
export async function readSnapshot<T>(filename: string): Promise<T> {
  const path = join(process.cwd(), "public", filename);
  return JSON.parse(await readFile(path, "utf8")) as T;
}

/**
 * Records why a route is serving the snapshot instead of the database.
 *
 * The fallback is the right behaviour and it is silent by design: a caller gets
 * a normal response with `source: "snapshot"`. That silence hid a real fault.
 * A change to /wards selected columns that a migration had never added, so
 * every database query failed, and the route quietly served the snapshot for
 * days. Nothing looked wrong because the two sources return the same shape.
 *
 * Logging the reason costs nothing on the happy path and makes a dead database
 * path visible in the deployment logs, where somebody can see it.
 */
export function logFallback(route: string, error: { message?: string; code?: string } | null): void {
  if (!error) return;
  console.error(
    `[api] ${route}: database query failed, serving the snapshot instead ` +
      `(${error.code ?? "no code"}): ${error.message ?? "unknown error"}`
  );
}

/** Parses and validates a `limit` query param against a sane ceiling. */
export function parseLimit(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * Area ids are locality names here ("Shanti Nagar"), not ward codes: letters
 * with single spaces, and the odd full stop, hyphen or apostrophe. Validated
 * rather than trusted, since these arrive from the URL and reach a database
 * query.
 *
 * Every published name is in title case, so normalising to title case is what
 * makes "shanti nagar" and "SHANTI NAGAR" resolve. A locality whose published
 * name is not title case would need this to look the id up instead.
 */
const WARD_ID_PATTERN = /^[A-Za-z][A-Za-z .'-]{0,39}$/;

export function normaliseWardId(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const id = decoded.trim().replace(/\s+/g, " ");
  if (!WARD_ID_PATTERN.test(id)) return null;
  return id
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function parseCoordinate(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Applies the per-IP limit to a request, returning a 429 when it is exceeded
 * and null when the request should proceed (issue #101).
 *
 * Every route calls this first. Cache headers mean most traffic never reaches
 * it, so this is for the requests that defeat caching: a crawler walking every
 * ward, or a script varying a parameter in a loop.
 *
 * Returns null when no limiter is configured, so the API behaves exactly as it
 * did before until the Upstash credentials exist.
 */
export async function rateLimited(request: Request): Promise<Response | null> {
  const result = await checkRateLimit(request.headers);
  if (!result || result.ok) return null;

  return jsonResponse(
    {
      error: {
        status: 429,
        message: "Too many requests.",
        hint:
          "The whole dataset is one request to /api/v1/export. If you need it " +
          "repeatedly, cache it rather than polling.",
      },
    },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": String(result.retryAfterSeconds),
        "x-ratelimit-limit": String(result.limit),
        "x-ratelimit-remaining": String(result.remaining),
      },
    }
  );
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}
