import crypto from "crypto";
import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { ENV } from "../src/config/ENV.js";
import { signToken } from "../src/utils/jwt.js";
import User from "../src/models/user.model.js";
import Resume from "../src/models/Resume.js";
import ResumeVersion from "../src/models/ResumeVersion.js";
import Analysis from "../src/models/Analysis.js";

const VALID_USER_ID = "507f1f77bcf86cd799439011";
const VALID_RESUME_ID = "507f1f77bcf86cd799439012";
const VALID_VERSION_ID = "507f1f77bcf86cd799439013";
const VALID_ANALYSIS_ID = "507f1f77bcf86cd799439014";

describe("HTTP API & Security Contracts", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe("Health, Security Headers, CORS & 404 Handling", () => {
    it("GET /api/health returns 200 with status payload and Helmet security headers", async () => {
      const res = await request(app).get("/api/health");

      assert.equal(res.status, 200);
      assert.equal(res.body.status, "ok");
      assert.equal(res.body.db, "disconnected");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
    });

    it("returns structured 404 JSON for unknown routes", async () => {
      const res = await request(app).get("/api/does-not-exist");

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.statusCode, 404);
      assert.match(res.body.message, /not found/i);
    });

    it("blocks disallowed CORS origins", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "https://malicious.example.com");

      assert.equal(res.status, 500);
      assert.match(res.body.message, /CORS policy blocked/);
    });
  });

  describe("Auth Middleware Guards (401 Enforcement)", () => {
    it("rejects unauthenticated access to protected endpoints with 401", async () => {
      const endpoints = [
        { method: "get", path: "/api/auth/me" },
        { method: "get", path: "/api/resumes" },
        { method: "get", path: "/api/dashboard" },
        { method: "post", path: `/api/resumes/${VALID_RESUME_ID}/analyze` },
      ];

      for (const ep of endpoints) {
        const res = await request(app)[ep.method](ep.path);
        assert.equal(res.status, 401, `${ep.method.toUpperCase()} ${ep.path} must require auth`);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, "No token provided");
      }
    });

    it("rejects tampered and expired JWT tokens with 401", async () => {
      const expiredToken = jwt.sign({ id: VALID_USER_ID }, ENV.jwtSecret, { expiresIn: "-10s" });

      const expiredRes = await request(app)
        .get("/api/resumes")
        .set("Authorization", `Bearer ${expiredToken}`);
      assert.equal(expiredRes.status, 401);
      assert.equal(expiredRes.body.message, "Invalid token");

      const tamperedRes = await request(app)
        .get("/api/resumes")
        .set("Cookie", [`${ENV.cookieName}=tampered.token.value`]);
      assert.equal(tamperedRes.status, 401);
      assert.equal(tamperedRes.body.message, "Invalid token");
    });

    it("rejects valid token if user record no longer exists", async () => {
      mock.method(User, "findById", async () => null);
      const token = signToken(VALID_USER_ID);

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 401);
      assert.equal(res.body.message, "User not found");
    });
  });

  describe("Request Validation & Upload Magic-Byte Security Gate", () => {
    it("rejects invalid auth payloads with 400 before hitting controllers", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "", email: "not-an-email", password: "123" });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, "Validation failed");
      assert.ok(Array.isArray(res.body.details));
    });

    it("rejects malformed ObjectId params with 400 instead of 500 CastError", async () => {
      mock.method(User, "findById", async () => ({ _id: VALID_USER_ID, email: "u@test.com" }));
      const token = signToken(VALID_USER_ID);

      const getRes = await request(app)
        .get("/api/resumes/not-a-valid-id")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(getRes.status, 400);
      assert.equal(getRes.body.message, "Validation failed");

      const postRes = await request(app)
        .post("/api/resumes/not-a-valid-id/analyze")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      assert.equal(postRes.status, 400);
      assert.equal(postRes.body.message, "Validation failed");
    });

    it("rejects non-PDF MIME uploads and spoofed PDFs failing %PDF- magic-byte inspection", async () => {
      mock.method(User, "findById", async () => ({ _id: VALID_USER_ID, email: "u@test.com" }));
      const token = signToken(VALID_USER_ID);

      const noFileRes = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(noFileRes.status, 400);
      assert.equal(noFileRes.body.message, "No file uploaded");

      const wrongMimeRes = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from("plain text"), { filename: "notes.txt", contentType: "text/plain" });
      assert.equal(wrongMimeRes.status, 400);
      assert.equal(wrongMimeRes.body.message, "Only PDF files are allowed");

      const spoofedPdfRes = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from("MZ_SPOOFED_EXECUTABLE_BYTES"), {
          filename: "evil.pdf",
          contentType: "application/pdf",
        });
      assert.equal(spoofedPdfRes.status, 400);
      assert.match(spoofedPdfRes.body.message, /corrupted or not a valid PDF/i);
    });
  });

  describe("Analysis Idempotency Cache & Route Contracts", () => {
    it("POST /api/resumes/:id/analyze hits SHA-256 idempotency cache and returns 200 { cached: true }", async () => {
      const rawText = "Daksh Singh Rathore\nSenior Software Engineer\nBuilt TypeScript APIs.";
      const targetRole = "Staff Engineer";
      const expectedHash = crypto
        .createHash("sha256")
        .update(`${rawText}::${targetRole.toLowerCase()}`)
        .digest("hex");

      const cachedAnalysis = {
        _id: VALID_ANALYSIS_ID,
        atsScore: 91,
        contentHash: expectedHash,
        model: "gemini-1.5-flash",
      };

      mock.method(User, "findById", async () => ({ _id: VALID_USER_ID, email: "daksh@test.com" }));
      mock.method(Resume, "findOne", async () => ({
        _id: VALID_RESUME_ID,
        userId: VALID_USER_ID,
        currentVersion: VALID_VERSION_ID,
      }));
      mock.method(ResumeVersion, "findOne", async () => ({
        _id: VALID_VERSION_ID,
        resumeId: VALID_RESUME_ID,
        rawText,
        latestAnalysisId: VALID_ANALYSIS_ID,
        save: async () => {},
      }));
      mock.method(Analysis, "findOne", (query) => {
        assert.equal(query.contentHash, expectedHash);
        return {
          sort: async () => cachedAnalysis,
        };
      });

      const token = signToken(VALID_USER_ID);
      const res = await request(app)
        .post(`/api/resumes/${VALID_RESUME_ID}/analyze`)
        .set("Authorization", `Bearer ${token}`)
        .send({ targetRole });

      assert.equal(res.status, 200);
      assert.equal(res.body.cached, true);
      assert.equal(res.body.analysis.atsScore, 91);
      assert.equal(res.body.analysis._id, VALID_ANALYSIS_ID);
    });

    it("GET /api/resumes/:id/analyze returns latest analysis cleanly instead of 404", async () => {
      const latest = { _id: VALID_ANALYSIS_ID, atsScore: 88, model: "gemini-1.5-flash" };

      mock.method(User, "findById", async () => ({ _id: VALID_USER_ID, email: "daksh@test.com" }));
      mock.method(Resume, "findOne", async () => ({ _id: VALID_RESUME_ID, userId: VALID_USER_ID }));
      mock.method(Analysis, "findOne", () => ({
        sort: () => ({
          lean: async () => latest,
        }),
      }));

      const token = signToken(VALID_USER_ID);
      const res = await request(app)
        .get(`/api/resumes/${VALID_RESUME_ID}/analyze`)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.analysis.atsScore, 88);
    });
  });
});
