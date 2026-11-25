import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeResumeLocally } from "../src/services/localHeuristicAnalyzer.js";

describe("analyzeResumeLocally", () => {
  it("computes bounded ATS metrics, breakdown sub-scores, issues, strengths, and bullet rewrites", () => {
    const rawText = `
      Jordan Lee
      jordan@example.com | 555-234-5678 | github.com/jordanlee | linkedin.com/in/jordanlee
      Experience
      • Built distributed REST APIs in TypeScript and Node.js serving 120k users with 40% lower p99 latency.
      • Worked on Docker deployments and PostgreSQL schema migrations for billing services.
      • Helped team migrate legacy React components to modern hooks and Vite.
      Education
      B.S. Computer Science, University of California
      Skills
      JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, CI/CD
    `;

    const result = analyzeResumeLocally({
      rawText,
      targetRole: "Senior Backend Engineer",
    });

    assert.ok(result.atsScore >= 0 && result.atsScore <= 100);
    for (const key of ["keywords", "formatting", "impact", "clarity"]) {
      assert.ok(
        result.scoreBreakdown[key] >= 0 && result.scoreBreakdown[key] <= 25,
        `${key} must stay within 0..25`
      );
    }

    assert.equal(result.issues.length, 5);
    for (const issue of result.issues) {
      assert.ok(["low", "medium", "high"].includes(issue.severity));
      assert.ok(issue.title.length > 0);
      assert.ok(issue.fix.length > 0);
    }

    assert.equal(result.strengths.length, 5);
    assert.ok(result.bulletRewrites.length >= 5 && result.bulletRewrites.length <= 8);
    assert.ok(result.keywordsPresent.includes("TypeScript"));
    assert.ok(result.summary.includes("Senior Backend Engineer"));
  });

  it("handles minimal resume text without division-by-zero or empty arrays", () => {
    const result = analyzeResumeLocally({ rawText: "Minimal resume text" });

    assert.ok(result.atsScore >= 45 && result.atsScore <= 100);
    assert.equal(result.issues.length, 5);
    assert.equal(result.strengths.length, 5);
    assert.equal(result.bulletRewrites.length, 5);
    assert.ok(result.summary.length > 10);
  });
});
