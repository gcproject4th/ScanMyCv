import { GoogleGenAI, Type } from "@google/genai";
import { ENV } from "../config/ENV.js";
import ApiError from "../utils/ApiError.js";
import { z } from "zod";
import { analyzeResumeLocally } from "./localHeuristicAnalyzer.js";

const ai = ENV.geminiApi ? new GoogleGenAI({ apiKey: ENV.geminiApi }) : null;

const responseSchema = {
  type: Type.OBJECT,
  required: [
    "atsScore",
    "scoreBreakdown",
    "issues",
    "strengths",
    "bulletRewrites",
    "keywordsPresent",
    "keywordsMissing",
    "summary"
  ],
  properties: {
    atsScore: {
      type: Type.NUMBER,
      description: "Overall ATS score from 0 to 100",
    },
    scoreBreakdown: {
      type: Type.OBJECT,
      required: ["keywords", "formatting", "impact", "clarity"],
      properties: {
        keywords: { type: Type.NUMBER, description: "Score from 0 to 25" },
        formatting: { type: Type.NUMBER, description: "Score from 0 to 25" },
        impact: { type: Type.NUMBER, description: "Score from 0 to 25" },
        clarity: { type: Type.NUMBER, description: "Score from 0 to 25" },
      },
    },
    issues: {
      type: Type.ARRAY,
      description: "Exactly 5 prioritized issues",
      items: {
        type: Type.OBJECT,
        required: ["title", "severity", "explanation", "fix"],
        properties: {
          title: { type: Type.STRING },
          severity: { type: Type.STRING },
          explanation: { type: Type.STRING },
          fix: { type: Type.STRING },
        },
      },
    },
    strengths: {
      type: Type.ARRAY,
      description: "Exactly 5 strengths",
      items: {
        type: Type.OBJECT,
        required: ["title"],
        properties: {
          title: { type: Type.STRING },
          evidence: { type: Type.STRING },
        },
      },
    },
    bulletRewrites: {
      type: Type.ARRAY,
      description: "5-10 weak bullets rewritten to be stronger and ATS-friendly",
      items: {
        type: Type.OBJECT,
        required: ["section", "rationale", "original", "rewritten"],
        properties: {
          section: { type: Type.STRING },
          original: { type: Type.STRING },
          rewritten: { type: Type.STRING },
          rationale: { type: Type.STRING },
        },
      },
    },
    keywordsPresent: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of relevant keywords found in the resume",
    },
    keywordsMissing: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of important missing keywords",
    },
    summary: {
      type: Type.STRING,
      description: "Overall evaluation summary of the resume",
    },
  },
};

// Helper to normalize and clamp sub-scores (0 - 25)
const clampSubScore = (val) => {
  const num = Number(val) || 0;
  // If Gemini provided scores out of 100 instead of 25, scale down
  if (num > 25 && num <= 100) return Math.min(25, Math.max(0, Math.round(num / 4)));
  return Math.min(25, Math.max(0, Math.round(num)));
};

// Defensive Zod Validator: ultra-resilient against LLM formatting deviations
export const analysisValidator = z.object({
  atsScore: z.coerce.number().min(0).max(100).catch(75),
  scoreBreakdown: z.object({
    keywords: z.any().transform(clampSubScore),
    formatting: z.any().transform(clampSubScore),
    impact: z.any().transform(clampSubScore),
    clarity: z.any().transform(clampSubScore),
  }).default({
    keywords: 18,
    formatting: 18,
    impact: 18,
    clarity: 18,
  }),
  issues: z.array(
    z.object({
      title: z.string().default("ATS Optimization Opportunity"),
      severity: z.string().transform((s) => {
        const lower = String(s || "").toLowerCase();
        if (lower.includes("high") || lower.includes("crit")) return "high";
        if (lower.includes("low") || lower.includes("info")) return "low";
        return "medium";
      }).default("medium"),
      explanation: z.string().default(""),
      fix: z.string().default(""),
    })
  ).default([]),
  strengths: z.array(
    z.object({
      title: z.string().default("Strong Foundation"),
      evidence: z.string().optional(),
    })
  ).default([]),
  bulletRewrites: z.array(
    z.object({
      section: z.string().default("Experience"),
      original: z.string().default(""),
      rewritten: z.string().default(""),
      rationale: z.string().default("Elevates impact and adds quantification."),
    })
  ).default([]),
  keywordsPresent: z.array(z.string()).default([]),
  keywordsMissing: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

function buildPrompt({ rawText, targetRole }) {
  const roleContext = targetRole
    ? `Target role: ${targetRole}.`
    : "No specific target role was provided; assess for the role the candidate appears to be aiming for.";

  return [
    "You are a senior technical recruiter and ATS expert reviewing a resume.",
    roleContext,
    "Score the resume from 0 to 100 based on ATS readiness (keyword match, parseable formatting, quantified impact, and clarity).",
    "Return exactly 5 prioritized issues, 5 standout strengths, and 5 to 10 weak bullets rewritten to be stronger and quantified.",
    "Rewrites must preserve the original meaning. Each rewrite needs a one-line rationale.",
    "Identify keywords clearly present and notable keywords missing for the apparent target role.",
    "Be specific and evidence-based—cite phrasing from the resume in explanations.",
    "",
    "RESUME TEXT:",
    "----------",
    rawText,
    "----------",
  ].join("\n");
}

async function callWithTimeout(promise, ms = 15000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(prompt, modelName) {
  if (!ai) {
    throw new ApiError(500, "Gemini API key is missing in server environment config.");
  }

  const aiCall = ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.2,
    },
  });

  const response = await callWithTimeout(aiCall, 15000);

  const text = typeof response?.text === "function" ? response.text() : response?.text;
  if (!text) {
    throw new ApiError(500, "Received empty response from Gemini API.");
  }

  return {
    text,
    usage: response.usageMetadata || {},
  };
}

const PARSER_MODELS = Array.from(
  new Set([ENV.geminiModel, "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash"].filter(Boolean))
);

async function analyzeResume({ rawText, targetRole }) {
  // If AI client is absent, immediately fall back to local heuristic analyzer
  if (!ai) {
    console.warn("[Analysis Notice]: Gemini client unconfigured. Using local ATS heuristic analyzer.");
    const fallback = analyzeResumeLocally({ rawText, targetRole });
    return {
      analysis: analysisValidator.parse(fallback),
      model: "heuristic-ats-engine",
      promptTokens: 0,
      responseTokens: 0,
    };
  }

  const prompt = buildPrompt({ rawText, targetRole });
  let lastErr;

  for (const modelName of PARSER_MODELS) {
    try {
      const { text, usage } = await callGemini(prompt, modelName);
      const parsed = JSON.parse(text);
      const validated = analysisValidator.parse(parsed);

      return {
        analysis: validated,
        model: modelName,
        promptTokens: usage.promptTokenCount || 0,
        responseTokens: usage.candidatesTokenCount || 0,
      };
    } catch (err) {
      console.warn(`[Analysis Warning]: Model ${modelName} failed or timed out (${err.message}), trying next model...`);
      lastErr = err;
    }
  }

  // Resilient Infallible Fallback: If Gemini hits 429 quota exhaustion, timeouts, or network loss,
  // NEVER fail with 500! Compute high-fidelity local ATS analysis immediately.
  console.info(`[Analysis Notice]: All Gemini models failed (${lastErr?.message}). Falling back to local heuristic ATS engine to guarantee uptime.`);
  const fallback = analyzeResumeLocally({ rawText, targetRole });
  return {
    analysis: analysisValidator.parse(fallback),
    model: "heuristic-ats-engine",
    promptTokens: 0,
    responseTokens: 0,
  };
}

export { analyzeResume };
