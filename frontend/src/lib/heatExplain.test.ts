/**
 * What the AI explainer lets into a prompt, and what the prompt tells the model.
 *
 * The explainer restates published numbers. These tests hold the two things
 * that keep it to that: nothing unbounded reaches the model, and the standing
 * instructions forbid inventing figures or calling the score a health forecast.
 */

import { describe, it, expect } from "vitest";
import { buildExplainPrompt, parseExplainRequest } from "./heatExplain";

const full = {
  localityName: "Itwari",
  hvi: 82.4,
  rank: 1,
  factors: { "Population density": "32,400 per km² (+7.1 pts)", "Surface heat": "43.9°C (-0.9 pts)" },
  recommendation: "Cool roofs: dense built-up cells",
  language: "mr",
};

describe("parseExplainRequest", () => {
  it("keeps the fields the prompt uses", () => {
    expect(parseExplainRequest(full)).toEqual(full);
  });

  it("refuses a request with no locality name", () => {
    expect(parseExplainRequest({ ...full, localityName: "  " })).toBeNull();
    expect(parseExplainRequest({ hvi: 50 })).toBeNull();
    expect(parseExplainRequest(null)).toBeNull();
    expect(parseExplainRequest("Itwari")).toBeNull();
  });

  it("falls back to English for a language it does not offer", () => {
    expect(parseExplainRequest({ ...full, language: "fr" })!.language).toBe("en");
    expect(parseExplainRequest({ ...full, language: undefined })!.language).toBe("en");
  });

  it("drops numbers that are not numbers instead of passing them on", () => {
    const parsed = parseExplainRequest({ ...full, hvi: "82.4", rank: Number.NaN })!;
    expect(parsed.hvi).toBeNull();
    expect(parsed.rank).toBeNull();
  });

  it("accepts a factor given as a bare number", () => {
    expect(parseExplainRequest({ ...full, factors: { "Surface heat": 0.1234567 } })!.factors).toEqual({ "Surface heat": "0.123" });
  });

  it("cuts long text and caps the number of factors", () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, "x"]));
    const parsed = parseExplainRequest({ ...full, recommendation: "a".repeat(5000), factors: many })!;
    expect(parsed.recommendation.length).toBe(600);
    expect(Object.keys(parsed.factors).length).toBe(12);
  });
});

describe("buildExplainPrompt", () => {
  const prompt = buildExplainPrompt(parseExplainRequest(full)!);

  it("gives the model the locality's own numbers", () => {
    expect(prompt.user).toContain("Itwari");
    expect(prompt.user).toContain("82.4");
    expect(prompt.user).toContain("Population density: 32,400 per km² (+7.1 pts)");
  });

  it("asks for the reader's language", () => {
    expect(prompt.system).toContain("Write in Marathi");
    expect(buildExplainPrompt(parseExplainRequest({ ...full, language: "hi" })!).system).toContain("Write in Hindi");
  });

  it("forbids invented figures and health claims", () => {
    expect(prompt.system).toContain("Use only the numbers and facts given");
    expect(prompt.system).toContain("not a forecast, a health prediction");
    expect(prompt.system).toContain("land surface temperatures");
  });

  it("says so when a number is missing rather than leaving a gap to fill", () => {
    const sparse = buildExplainPrompt(parseExplainRequest({ localityName: "Sadar" })!);
    expect(sparse.user).toContain("Priority score (0 to 100): not available");
    expect(sparse.user).toContain("- not available");
  });
});
