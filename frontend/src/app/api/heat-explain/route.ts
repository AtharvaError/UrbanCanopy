import { NextResponse } from "next/server";
import { buildExplainPrompt, parseExplainRequest } from "@/lib/heatExplain";
import { createLocalLimiter } from "@/lib/localRateLimit";
import { rateLimitKey } from "@/lib/rateLimit";

/**
 * The AI explainer's server side. The browser sends a locality's published
 * numbers; this asks an Experiential Labs model to restate them in plain
 * language and returns the text.
 *
 * It lives in the site, not in a separate process, so the explainer works on a
 * hosted copy as well as on a laptop, and the key never reaches the browser.
 * With no key set it answers 503 with a sentence the panel can show.
 *
 * This is the one endpoint that spends money per call and takes a request
 * body, so it is the one with its own limits: a per-caller request limit that
 * is always on, a cap on the body, and no CORS headers, which leaves browsers
 * able to call it only from the site's own pages.
 */

export const dynamic = "force-dynamic";

const COMPLETIONS_URL = "https://api.experientiallabs.ai/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
const TIMEOUT_MS = 30_000;
/** A real request is under 2 KB. Anything far past that is not a locality's numbers. */
const MAX_BODY_BYTES = 8 * 1024;
/** One person reading through localities does not need more than this. */
const checkLimit = createLocalLimiter(10, 60_000);

type Answer = { explanation: string } | { error: string };

export async function POST(request: Request): Promise<NextResponse<Answer>> {
  const limit = checkLimit(rateLimitKey(request.headers));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many explanations requested. Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const key = process.env.EXPLABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "The AI explainer is not set up on this copy of the site." }, { status: 503 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "The request was not valid JSON." }, { status: 400 });
  }
  const parsed = parseExplainRequest(body);
  if (!parsed) return NextResponse.json({ error: "A locality name is required." }, { status: 400 });

  const prompt = buildExplainPrompt(parsed);
  try {
    const response = await fetch(COMPLETIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.EXPLABS_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        // Low, because the job is to restate given numbers, not to be inventive.
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;

    if (!response.ok) {
      // The provider's own message stays in the server log. It can name the
      // account or the key's state, which is not the visitor's business.
      console.error("[heat-explain] model service answered", response.status);
      return NextResponse.json({ error: "The AI service could not produce an explanation." }, { status: 502 });
    }

    const explanation = data?.choices?.[0]?.message?.content?.trim();
    if (!explanation) return NextResponse.json({ error: "The AI service returned no text." }, { status: 502 });
    return NextResponse.json({ explanation });
  } catch (err) {
    console.error("[heat-explain] request failed:", err instanceof Error ? err.name : err);
    return NextResponse.json({ error: "The AI service could not be reached. Try again in a moment." }, { status: 502 });
  }
}
