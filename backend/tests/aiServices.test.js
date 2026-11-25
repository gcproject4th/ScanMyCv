import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analysisValidator, analyzeResume } from "../src/services/geminiService.js";
import { parseResume } from "../src/services/structuredParser.js";

describe("analysisValidator defensive schema hardening", () => {
  it("normalizes uppercase/typo severities, coerces string scores, and scales 0-100 sub-scores", () => {
    const messyLlmPayload = {
      atsScore: "84",
      scoreBreakdown: {
        keywords: 88,   // LLM mistakenly scored /100 instead of /25 -> scaled to 22
        formatting: "21",
        impact: 40,     // /100 -> scaled to 10
        clarity: 24,
      },
      issues: [
        { title: "Missing metrics", severity: "HIGH" },
        { title: "Spacing tweak", severity: "midium" },
        { title: "Critical header", severity: "Critical" },
        { title: "Optional tag", severity: "Low Info" },
      ],
      strengths: [{ title: "Strong ownership" }],
      bulletRewrites: [{ original: "Worked on API", rewritten: "Built scalable APIs cutting latency 35%" }],
      keywordsPresent: ["React"],
      keywordsMissing: ["Docker"],
      summary: "Solid profile.",
    };

    const validated = analysisValidator.parse(messyLlmPayload);

    assert.equal(validated.atsScore, 84);
    assert.equal(validated.scoreBreakdown.keywords, 22);
    assert.equal(validated.scoreBreakdown.formatting, 21);
    assert.equal(validated.scoreBreakdown.impact, 10);
    assert.equal(validated.scoreBreakdown.clarity, 24);
    assert.deepEqual(
      validated.issues.map((i) => i.severity),
      ["high", "medium", "high", "low"]
    );
    assert.equal(validated.bulletRewrites[0].section, "Experience");
  });

  it("falls back atsScore cleanly when invalid type or out-of-range value is provided", () => {
    const validated = analysisValidator.parse({ atsScore: 999 });
    assert.equal(validated.atsScore, 75);
    assert.equal(validated.scoreBreakdown.keywords, 18);
  });
});

describe("AI services resilience fallbacks", () => {
  it("analyzeResume falls back to heuristic-ats-engine instead of throwing 500 when Gemini API fails", async () => {
    const result = await analyzeResume({
      rawText: "Jane Doe\njane@dev.io\nExperience\n• Engineered Node.js services with Docker.",
      targetRole: "Backend Engineer",
    });

    assert.equal(result.model, "heuristic-ats-engine");
    assert.ok(result.analysis.atsScore >= 45 && result.analysis.atsScore <= 100);
    assert.equal(result.analysis.issues.length, 5);
    assert.equal(result.promptTokens, 0);
  });

  it("parseResume falls back to local parser on Gemini failure and returns empty structure on blank input", async () => {
    const empty = await parseResume("   ");
    assert.deepEqual(empty.experience, []);
    assert.deepEqual(empty.skills, []);

    const parsed = await parseResume("Alex Smith\nalex@test.com\nSkills\nReact, TypeScript, Node.js");
    assert.equal(parsed.basics.name, "Alex Smith");
    assert.equal(parsed.basics.email, "alex@test.com");
    assert.ok(parsed.skills.includes("TypeScript"));
  });
});
