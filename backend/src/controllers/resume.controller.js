import crypto from "crypto";
import { z } from "zod";
import mongoose from "mongoose";

import Resume from "../models/Resume.js";
import ResumeVersion from "../models/ResumeVersion.js";
import Analysis from "../models/Analysis.js";

import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";

import { extractTextFromPdf } from "../services/pdfService.js";
import { parseResume } from "../services/structuredParser.js";
import { parseResumeLocally } from "../services/fastLocalParser.js";
import { analyzeResume } from "../services/geminiService.js";
import { diffText, summarize } from "../services/diffService.js";


export const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid ID format" });

export const idParamSchema = z.object({ id: objectIdSchema });

export const versionParamSchema = z.object({
  id: objectIdSchema,
  versionId: objectIdSchema,
});

export const analysisBodySchema = z.object({
  versionId: objectIdSchema.optional(),
  targetRole: z.string().trim().max(120).optional(),
});

export const rewriteBodySchema = z.object({
  analysisId: objectIdSchema,
  rewriteIds: z.array(objectIdSchema).optional(),
  label: z.string().trim().max(50).optional(),
});

export const diffQuerySchema = z.object({
  from: objectIdSchema,
  to: objectIdSchema,
  mode: z.enum(["words", "lines"]).optional(),
});

// Helper: Loads a resume owned by the requesting user
const loadOwnResume = async (req) => {
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest("Invalid resume ID format");
  }

  const resume = await Resume.findOne({
    _id: id,
    userId: req.user?._id,
  });

  if (!resume) {
    throw ApiError.notFound("Resume not found");
  }

  return resume;
};

// Helper: Loads a specific version for a given resume
const loadVersion = async (resumeId, versionId) => {
  const version = await ResumeVersion.findOne({ _id: versionId, resumeId });
  if (!version) throw ApiError.notFound("Resume version not found");
  return version;
};

// Helper: Applies rewrite patches to raw text
function applyRewritesToText(rawText, rewrites) {
  let result = rawText;
  for (let r of rewrites) {
    if (!r.original || !r.rewritten) continue;
    const idx = result.indexOf(r.original);
    if (idx >= 0) {
      result =
        result.slice(0, idx) + r.rewritten + result.slice(idx + r.original.length);
    } else {
      result += `\n${r.rewritten}`;
    }
  }
  return result;
}

// Helper: Patches experience bullet points directly in structured JSON
function patchBulletsInSection(sections, rewrites) {
  if (!sections) return null;
  const cloned = JSON.parse(JSON.stringify(sections));
  for (const r of rewrites) {
    if (!r?.original || !r?.rewritten) continue;
    for (const exp of cloned.experience || []) {
      exp.bullets = exp.bullets.map((b) => (b === r.original ? r.rewritten : b));
    }
  }
  return cloned;
}

// Helper: Checks if parsed sections are virtually empty
function looksEmpty(sections) {
  if (!sections) return true;
  const b = sections.basics || {};
  const hasIdentity = b.name || b.email || b.title;
  const hasBody =
    sections.summary ||
    sections.experience?.length ||
    sections.education?.length ||
    sections.skills?.length;
  return !hasBody && !hasIdentity;
}

// ==========================================
// CONTROLLER ACTIONS
// ==========================================

/**
 * @desc    Upload PDF and create initial resume & version V1
 * @route   POST /api/resumes
 */
export const createResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("PDF file is required");
  }

  const { text, meta } = await extractTextFromPdf(req.file.buffer);
  const parsedSections = await parseResume(text);

  const title =
    (req.body.title || "").trim() ||
    req.file.originalname.replace(/\.pdf$/i, "") ||
    "Untitled_Resume";

  const resume = await Resume.create({
    userId: req.user._id,
    title,
    latestVersionNumber: 1,
  });

  const version = await ResumeVersion.create({
    resumeId: resume._id,
    versionNumber: 1,
    label: "V1",
    rawText: text,
    parsedSections,
    sourceType: "upload",
    parentVersionId: null,
  });

  resume.currentVersion = version._id;
  await resume.save();

  res.status(201).json({ resume, version, meta });
});

/**
 * @desc    Get all resumes for logged-in user
 * @route   GET /api/resumes
 */
export const getAllResumes = asyncHandler(async (req, res) => {
  const resumes = await Resume.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ resumes });
});

/**
 * @desc    Get single resume with version history list
 * @route   GET /api/resumes/:id
 */
export const getResumeById = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);
  const versions = await ResumeVersion.find({ resumeId: resume._id })
    .sort({ versionNumber: 1 })
    .lean();

  // Self-heal: If any versions were uploaded when parser returned empty sections, reconstruct now
  for (const v of versions) {
    const p = v.parsedSections || {};
    if ((!p.experience?.length || !p.skills?.length) && v.rawText) {
      const repaired = parseResumeLocally(v.rawText);
      v.parsedSections = repaired;
      ResumeVersion.updateOne({ _id: v._id }, { $set: { parsedSections: repaired } }).exec();
    }
    delete v.rawText;
  }

  res.json({ resume, versions });
});

/**
 * @desc    Get a single version of a resume
 * @route   GET /api/resumes/:id/version/:versionId
 */
export const getResumeVersion = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);
  const version = await loadVersion(resume._id, req.params.versionId);

  // Self-heal version if parsed sections are empty
  const p = version.parsedSections || {};
  if ((!p.experience?.length || !p.skills?.length) && version.rawText) {
    version.parsedSections = parseResumeLocally(version.rawText);
    await version.save();
  }

  res.json({ version });
});

/**
 * @desc    Delete a resume and all associated data
 * @route   DELETE /api/resumes/:id
 */
export const deleteResume = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);

  await Promise.all([
    ResumeVersion.deleteMany({ resumeId: resume._id }),
    Analysis.deleteMany({ resumeId: resume._id }),
    resume.deleteOne(),
  ]);

  res.json({
    ok: true,
    message: "Resume and all associated data deleted successfully",
  });
});

/**
 * @desc    Analyze a resume version using AI
 * @route   POST /api/resumes/:id/analyze
 */
export const analyzeResumeVersion = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);
  const versionId = req.body.versionId || resume.currentVersion;

  if (!versionId) throw ApiError.badRequest("No version available to analyze");

  const version = await loadVersion(resume._id, versionId);

  // Exact-Hash Idempotency Cache:
  // Normalize target role and compute SHA-256 over rawText + normalized targetRole
  const normalizedRole = (req.body.targetRole || "").trim().toLowerCase();
  const contentHash = crypto
    .createHash("sha256")
    .update(`${version.rawText || ""}::${normalizedRole}`)
    .digest("hex");

  // Check if an analysis with the exact same contentHash and versionId already exists
  const existingAnalysis = await Analysis.findOne({
    versionId: version._id,
    contentHash,
  }).sort({ createdAt: -1 });

  if (existingAnalysis) {
    if (version.latestAnalysisId?.toString() !== existingAnalysis._id.toString()) {
      version.latestAnalysisId = existingAnalysis._id;
      await version.save();
    }
    return res.status(200).json({ analysis: existingAnalysis, cached: true });
  }

  const { analysis, model, promptTokens, responseTokens } = await analyzeResume({
    rawText: version.rawText,
    targetRole: req.body.targetRole,
  });

  const saved = await Analysis.create({
    userId: req.user._id,
    resumeId: resume._id,
    versionId: version._id,
    targetRole: req.body.targetRole || "",
    contentHash,
    atsScore: analysis.atsScore,
    scoreBreakdown: analysis.scoreBreakdown,
    issues: analysis.issues,
    strengths: analysis.strengths,
    bulletRewrites: analysis.bulletRewrites,
    keywordsPresent: analysis.keywordsPresent,
    keywordsMissing: analysis.keywordsMissing,
    summary: analysis.summary,
    model,
    promptTokens,
    responseTokens,
  });

  // Ensure parsed sections are hydrated if originally saved empty
  const p = version.parsedSections || {};
  if ((!p.experience?.length || !p.skills?.length) && version.rawText) {
    version.parsedSections = parseResumeLocally(version.rawText);
  }

  version.latestAnalysisId = saved._id;
  await version.save();

  res.status(201).json({ analysis: saved, cached: false });
});

/**
 * @desc    Get analysis for a specific version
 * @route   GET /api/resumes/:id/versions/:versionId/analysis
 */
export const getVersionAnalysis = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);
  const version = await loadVersion(resume._id, req.params.versionId);

  const analysis = await Analysis.findOne({
    resumeId: resume._id,
    versionId: version._id,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ analysis: analysis || null });
});

/**
 * @desc    Get all analyses for a resume
 * @route   GET /api/resumes/:id/analyses
 */
export const getAllAnalyses = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);
  const analysis = await Analysis.find({ resumeId: resume._id })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ analysis });
});

/**
 * @desc    Get the latest analysis for a resume
 * @route   GET /api/resumes/:id/analyze
 */
export const getLatestAnalysis = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);
  const analysis = await Analysis.findOne({ resumeId: resume._id })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ analysis: analysis || null });
});

/**
 * @desc    Apply AI bullet rewrites and create a new resume version
 * @route   POST /api/resumes/:id/rewrite
 */
export const applyRewrites = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);

  const analysis = await Analysis.findOne({
    _id: req.body.analysisId,
    resumeId: resume._id,
  });

  if (!analysis) throw ApiError.notFound("Analysis not found");

  const baseVersion = await loadVersion(resume._id, analysis.versionId);

  const selected = req.body.rewriteIds?.length
    ? analysis.bulletRewrites.filter((r) =>
        req.body.rewriteIds.includes(r._id.toString())
      )
    : analysis.bulletRewrites;

  if (!selected.length) {
    throw ApiError.badRequest("No rewrites selected to apply");
  }

  const newRaw = applyRewritesToText(baseVersion.rawText, selected);
  const patchedFromBase = patchBulletsInSection(
    baseVersion.parsedSections,
    selected
  );

  const reparsed = await parseResume(newRaw);
  const finalParsed = looksEmpty(reparsed) ? patchedFromBase : reparsed;

  // Find highest version number directly from MongoDB
  const latestVersionDoc = await ResumeVersion.findOne({ resumeId: resume._id })
    .sort({ versionNumber: -1 })
    .select("versionNumber")
    .lean();

  const currentHighest =
    latestVersionDoc?.versionNumber || resume.latestVersionNumber || 0;
  const nextNumber = currentHighest + 1;

  const nextVersion = await ResumeVersion.create({
    resumeId: resume._id,
    versionNumber: nextNumber,
    label: req.body.label?.trim() || `V${nextNumber}`,
    rawText: newRaw,
    parsedSections: finalParsed,
    sourceType: "rewrite",
    parentVersionId: baseVersion._id,
  });

  resume.latestVersionNumber = nextNumber;
  resume.currentVersion = nextVersion._id;
  await resume.save();

  res.status(201).json({
    version: nextVersion,
    appliedCount: selected.length,
  });
});

/**
 * @desc    Diff two versions of a resume
 * @route   GET /api/resumes/:id/diff
 */
export const getDiffBetweenVersions = asyncHandler(async (req, res) => {
  const resume = await loadOwnResume(req);

  const [fromV, toV] = await Promise.all([
    loadVersion(resume._id, req.query.from),
    loadVersion(resume._id, req.query.to),
  ]);

  const parts = diffText(fromV.rawText, toV.rawText, req.query.mode);

  res.json({
    from: {
      id: fromV._id,
      label: fromV.label,
      versionNumber: fromV.versionNumber,
    },
    to: {
      id: toV._id,
      label: toV.label,
      versionNumber: toV.versionNumber,
    },
    parts,
    stats: summarize(parts),
  });
});

/**
 * @desc    Create realistic sample/demo resume with V1 version
 * @route   POST /api/resumes/sample
 */
export const createSampleResume = asyncHandler(async (req, res) => {
  const sampleSections = {
    basics: {
      name: "Alex Mercer",
      title: "Senior Full Stack Engineer",
      location: "San Francisco, CA",
      email: "alex.mercer.dev@example.com",
      phone: "+1 (555) 382-9104",
      links: [
        { label: "GitHub", url: "https://github.com/alexmercer" },
        { label: "LinkedIn", url: "https://linkedin.com/in/alexmercer" },
      ],
    },
    summary:
      "High-impact Senior Full Stack Engineer with 6+ years of experience architecting distributed cloud systems, modern web platforms, and REST/GraphQL APIs. Proven track record of improving web performance, scaling database throughput, and mentoring engineering teams.",
    experience: [
      {
        company: "Apex Cloud Technologies",
        role: "Senior Full Stack Engineer",
        location: "San Francisco, CA",
        period: "2022 - Present",
        bullets: [
          "Architected real-time event analytics pipeline processing 45M+ daily messages with Node.js, Kafka, and Redis, lowering ingestion latency by 42%.",
          "Led frontend modernizations using React, Vite, and Tailwind CSS, improving Core Web Vitals (LCP from 3.4s to 0.9s) and elevating user retention by 18%.",
          "Refactored monolithic billing service into decoupled AWS microservices (ECS, SQS, RDS PostgreSQL), achieving 99.99% uptime and zero payment interruptions.",
          "Instituted comprehensive automated testing suite and CI/CD pipelines with GitHub Actions, reducing release cycle time from 5 days to 2 hours.",
        ],
      },
      {
        company: "Streamline Systems",
        role: "Full Stack Software Engineer",
        location: "Austin, TX",
        period: "2019 - 2022",
        bullets: [
          "Developed high-throughput customer management dashboards serving 350K+ active users using React, Node.js, Express, and PostgreSQL.",
          "Implemented multi-layer Redis caching strategy, reducing database server loads by 55% during peak traffic windows.",
          "Partnered with product managers and UX designers to build accessible, WCAG AA compliant design system components.",
        ],
      },
    ],
    education: [
      {
        degree: "B.S. in Computer Science",
        school: "University of California, Berkeley",
        location: "Berkeley, CA",
        period: "2015 - 2019",
        details: "Graduated with Honors · Magna Cum Laude · Coursework in Distributed Systems & Data Structures",
      },
    ],
    skills: [
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "Express",
      "Next.js",
      "PostgreSQL",
      "MongoDB",
      "Redis",
      "Docker",
      "AWS (ECS, S3, RDS)",
      "GraphQL",
      "REST APIs",
      "Tailwind CSS",
      "Jest",
      "CI/CD (GitHub Actions)",
      "Git",
    ],
    projects: [
      {
        name: "CloudMetrics Dashboard",
        description:
          "Open-source monitoring tool for Docker cluster health with live WebSocket streaming and automated alerting.",
        tech: ["TypeScript", "React", "Node.js", "Redis", "Docker"],
        links: "https://github.com/alexmercer/cloudmetrics",
      },
    ],
    certifications: [
      {
        name: "AWS Certified Solutions Architect – Associate",
        issuer: "Amazon Web Services",
        year: "2023",
      },
    ],
    languages: ["English (Native)", "Spanish (Conversational)"],
    interests: ["Distributed Systems", "Open Source Contributing", "Tech Mentorship"],
  };

  const sampleRawText = `Alex Mercer
Senior Full Stack Engineer
San Francisco, CA | alex.mercer.dev@example.com | +1 (555) 382-9104
GitHub: github.com/alexmercer | LinkedIn: linkedin.com/in/alexmercer

PROFESSIONAL SUMMARY
High-impact Senior Full Stack Engineer with 6+ years of experience architecting distributed cloud systems, modern web platforms, and REST/GraphQL APIs. Proven track record of improving web performance, scaling database throughput, and mentoring engineering teams.

EXPERIENCE
Apex Cloud Technologies — Senior Full Stack Engineer
San Francisco, CA | 2022 - Present
• Architected real-time event analytics pipeline processing 45M+ daily messages with Node.js, Kafka, and Redis, lowering ingestion latency by 42%.
• Led frontend modernizations using React, Vite, and Tailwind CSS, improving Core Web Vitals (LCP from 3.4s to 0.9s) and elevating user retention by 18%.
• Refactored monolithic billing service into decoupled AWS microservices (ECS, SQS, RDS PostgreSQL), achieving 99.99% uptime and zero payment interruptions.
• Instituted comprehensive automated testing suite and CI/CD pipelines with GitHub Actions, reducing release cycle time from 5 days to 2 hours.

Streamline Systems — Full Stack Software Engineer
Austin, TX | 2019 - 2022
• Developed high-throughput customer management dashboards serving 350K+ active users using React, Node.js, Express, and PostgreSQL.
• Implemented multi-layer Redis caching strategy, reducing database server loads by 55% during peak traffic windows.
• Partnered with product managers and UX designers to build accessible, WCAG AA compliant design system components.

EDUCATION
University of California, Berkeley — B.S. in Computer Science
Berkeley, CA | 2015 - 2019
Graduated with Honors · Magna Cum Laude

SKILLS
JavaScript, TypeScript, React, Node.js, Express, Next.js, PostgreSQL, MongoDB, Redis, Docker, AWS (ECS, S3, RDS), GraphQL, REST APIs, Tailwind CSS, Jest, CI/CD (GitHub Actions), Git

PROJECTS
CloudMetrics Dashboard — Open-source monitoring tool for Docker cluster health with live WebSocket streaming and automated alerting.

CERTIFICATIONS
AWS Certified Solutions Architect – Associate (Amazon Web Services, 2023)`;

  const resume = await Resume.create({
    userId: req.user._id,
    title: "Alex Mercer - Senior Full Stack Engineer (Demo)",
    latestVersionNumber: 1,
  });

  const version = await ResumeVersion.create({
    resumeId: resume._id,
    versionNumber: 1,
    label: "V1",
    rawText: sampleRawText,
    parsedSections: sampleSections,
    sourceType: "sample",
    parentVersionId: null,
  });

  resume.currentVersion = version._id;
  await resume.save();

  res.status(201).json({ resume, version });
});