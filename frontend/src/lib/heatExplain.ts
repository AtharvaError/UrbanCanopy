/**
 * The request the AI explainer sends to the language model: what is allowed in,
 * and the prompt built from it.
 *
 * The model is given a locality's published numbers and asked to restate them
 * in plain language. It is told to add nothing: the explanation is a reading
 * aid for the score, not a second opinion on it. Its output is generated text
 * and the interface labels it as such.
 */

export const EXPLAIN_LANGUAGES = { en: "English", hi: "Hindi", mr: "Marathi" } as const;
export type ExplainLanguage = keyof typeof EXPLAIN_LANGUAGES;

export type ExplainRequest = {
  localityName: string;
  hvi: number | null;
  rank: number | null;
  /** Factor name to a short "value (points)" string. */
  factors: Record<string, string>;
  recommendation: string;
  language: ExplainLanguage;
};

/** Longest string accepted for any one field. Keeps a request from carrying an essay to the model. */
const MAX_FIELD_CHARS = 600;
const MAX_FACTORS = 12;

/** Text as given, cut to length. A number is accepted too, since a factor may arrive as a bare value. */
const clip = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value * 1000) / 1000);
  return typeof value === "string" ? value.slice(0, MAX_FIELD_CHARS) : "";
};
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Reduces whatever arrived in the request body to the fields the prompt uses.
 * Returns null when there is no locality name, which is the one field the
 * explanation cannot be written without.
 */
export function parseExplainRequest(body: unknown): ExplainRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  const localityName = clip(raw.localityName).trim();
  if (!localityName) return null;

  const factors: Record<string, string> = {};
  if (typeof raw.factors === "object" && raw.factors !== null) {
    for (const [key, value] of Object.entries(raw.factors as Record<string, unknown>).slice(0, MAX_FACTORS)) {
      const text = clip(value);
      if (text) factors[key.slice(0, 80)] = text;
    }
  }

  return {
    localityName,
    hvi: finite(raw.hvi),
    rank: finite(raw.rank),
    factors,
    recommendation: clip(raw.recommendation),
    language: raw.language === "hi" || raw.language === "mr" ? raw.language : "en",
  };
}

export function buildExplainPrompt(request: ExplainRequest): { system: string; user: string } {
  const language = EXPLAIN_LANGUAGES[request.language];
  const system = `You explain a heat priority score for a locality in Nagpur, India, for UrbanCanopy, a decision-support prototype.

Rules:
- Use only the numbers and facts given to you. Do not add figures, places, causes or history that are not in the data.
- The score is an illustrative intervention-priority score from a transparent formula. It is not a forecast, a health prediction or a measure of deaths or illness. Never describe it as one.
- Temperatures given are land surface temperatures from satellite, not air temperatures.
- Write in ${language}, in plain words a city official or resident can follow. No headings longer than four words.
- Keep it under 180 words, in three short parts: what the score and rank mean, which factors push it up or down, and why the suggested actions fit this locality.`;

  const factorLines = Object.entries(request.factors).map(([name, value]) => `- ${name}: ${value}`);
  const user = `Locality: ${request.localityName}
Priority score (0 to 100): ${request.hvi === null ? "not available" : request.hvi.toFixed(1)}
Rank in the city: ${request.rank === null ? "not available" : `${request.rank} (1 is the highest priority)`}
Factors, each with its measured value and the score points it adds or removes against a city-average locality:
${factorLines.length ? factorLines.join("\n") : "- not available"}
Suggested actions: ${request.recommendation || "not available"}`;

  return { system, user };
}
