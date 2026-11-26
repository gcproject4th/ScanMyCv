import express from "express";

import AuthMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import uploadPdf from "../middleware/upload.js";
import { analyzeLimiter, uploadLimiter } from "../middleware/rateLimit.js";

import {
  idParamSchema,
  versionParamSchema,
  analysisBodySchema,
  rewriteBodySchema,
  diffQuerySchema,
  createResume,
  createSampleResume,
  getAllResumes,
  getResumeById,
  getResumeVersion,
  deleteResume,
  analyzeResumeVersion,
  getVersionAnalysis,
  getAllAnalyses,
  getLatestAnalysis,
  applyRewrites,
  getDiffBetweenVersions,
} from "../controllers/resume.controller.js";

const router = express.Router();

router.use(AuthMiddleware);

// Resume CRUD & Versions
router.post("/sample", createSampleResume);

router.route("/")
  .post(uploadLimiter, uploadPdf("file"), createResume)
  .get(getAllResumes);

router.route("/:id")
  .get(validate(idParamSchema, "params"), getResumeById)
  .delete(validate(idParamSchema, "params"), deleteResume);

router.get(
  "/:id/versions/:versionId",
  validate(versionParamSchema, "params"),
  getResumeVersion
);

// Analyses & AI Processing
router.route("/:id/analyze")
  .post(
    analyzeLimiter,
    validate(idParamSchema, "params"),
    validate(analysisBodySchema, "body"),
    analyzeResumeVersion
  )
  .get(
    validate(idParamSchema, "params"),
    getLatestAnalysis
  );

router.get(
  "/:id/versions/:versionId/analysis",
  validate(versionParamSchema, "params"),
  getVersionAnalysis
);

router.get(
  "/:id/analyses",
  validate(idParamSchema, "params"),
  getAllAnalyses
);

// Rewrites & Diffing
router.post(
  "/:id/rewrite",
  analyzeLimiter,
  validate(idParamSchema, "params"),
  validate(rewriteBodySchema, "body"),
  applyRewrites
);

router.get(
  "/:id/diff",
  validate(idParamSchema, "params"),
  validate(diffQuerySchema, "query"),
  getDiffBetweenVersions
);

export default router;