import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseResumeLocally } from "../src/services/fastLocalParser.js";

describe("parseResumeLocally", () => {
  it("extracts contact info, varied section headers, projects, education, and skills", () => {
    const sample = `
      Alex Mercer
      alex.mercer@example.com | +1 (415) 555-0199 | github.com/alexmercer | linkedin.com/in/alexmercer

      PROFESSIONAL SUMMARY
      Senior Full-Stack Engineer building resilient distributed systems and TypeScript web applications.

      WORK EXPERIENCE
      Senior Software Engineer | Acme Cloud
      • Architected Node.js microservices handling 50,000 req/s with Redis caching.
      • Reduced CI pipeline duration by 45% across 12 repositories.

      KEY PROJECTS
      ScanMyCv AI (React, Node.js, MongoDB)
      • Built an ATS resume scoring and diff comparison workflow.

      ACADEMIC BACKGROUND
      B.Tech in Computer Science
      Indian Institute of Technology

      TECHNICAL SKILLS
      JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, Kubernetes
    `;

    const parsed = parseResumeLocally(sample);

    assert.equal(parsed.basics.name, "Alex Mercer");
    assert.equal(parsed.basics.email, "alex.mercer@example.com");
    assert.match(parsed.basics.phone, /415.*555.*0199/);
    assert.ok(parsed.basics.links.some((l) => l.label === "GitHub"));
    assert.ok(parsed.basics.links.some((l) => l.label === "LinkedIn"));

    assert.ok(parsed.summary.includes("resilient distributed systems"));
    assert.ok(parsed.experience.length >= 1);
    assert.ok(parsed.experience[0].bullets.length >= 2);
    assert.ok(parsed.projects.length >= 1);
    assert.ok(parsed.projects[0].tech.includes("React"));
    assert.ok(parsed.education.length >= 1);
    assert.ok(parsed.skills.includes("TypeScript"));
    assert.ok(parsed.skills.includes("Docker"));
  });

  it("falls back to dictionary skill extraction and bullet reconstruction when headers are missing", () => {
    const unstructured = `
      Jane Doe
      jane@dev.io
      ▪ Developed production APIs using Python, FastAPI, Docker, and PostgreSQL for internal analytics.
      ▪ Deployed Kubernetes clusters on AWS with automated Terraform monitoring dashboards.
      ▪ Collaborated with frontend teams delivering React and TypeScript interfaces.
      ▪ Maintained 99.9% service uptime across multi-region cloud environments.
      ▪ Wrote comprehensive unit and integration suites for critical payment workflows.
      ▪ Optimized SQL queries cutting reporting latency by 60%.
      Bachelor of Science in Software Engineering, State University
    `;

    const parsed = parseResumeLocally(unstructured);

    assert.equal(parsed.basics.name, "Jane Doe");
    assert.equal(parsed.basics.email, "jane@dev.io");
    assert.ok(parsed.experience.length >= 1, "should reconstruct experience from bullet lines");
    assert.ok(parsed.experience[0].bullets.length >= 4);
    assert.ok(parsed.skills.includes("Python"));
    assert.ok(parsed.skills.includes("Kubernetes"));
    assert.ok(parsed.education.length >= 1, "should infer degree line into education");
  });

  it("handles empty or non-string input gracefully without throwing", () => {
    const empty = parseResumeLocally("");
    const nullInput = parseResumeLocally(null);

    assert.equal(Array.isArray(empty.experience), true);
    assert.equal(Array.isArray(empty.skills), true);
    assert.equal(Array.isArray(nullInput.projects), true);
    assert.equal(empty.basics.email, "");
  });
});
