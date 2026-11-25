import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { diffText, summarize } from "../src/services/diffService.js";
import ApiError from "../src/utils/ApiError.js";
import { signToken, verifyToken, getCookieOptions } from "../src/utils/jwt.js";
import validate from "../src/middleware/validate.js";
import { errorHandler } from "../src/middleware/errorHandle.js";

describe("diffService", () => {
  it("computes word diffs and added/removed character summary", () => {
    const parts = diffText("Worked on API", "Engineered REST API");
    const stats = summarize(parts);

    assert.ok(parts.some((p) => p.removed && p.value.includes("Worked")));
    assert.ok(parts.some((p) => p.added && p.value.includes("Engineered")));
    assert.ok(stats.added > 0 && stats.removed > 0);
  });

  it("supports lines mode and handles null/empty inputs safely", () => {
    const parts = diffText("line 1\nline 2", "line 1\nline 3", "lines");
    assert.ok(parts.some((p) => p.added && p.value.includes("line 3")));

    const emptyParts = diffText(null, undefined);
    assert.deepEqual(summarize(emptyParts), { added: 0, removed: 0 });
  });
});

describe("ApiError and jwt utilities", () => {
  it("constructs operational HTTP errors with proper status codes", () => {
    const err400 = ApiError.badRequest("Bad input", { field: "email" });
    const err404 = ApiError.notFound("Missing");
    const err429 = ApiError.tooMany("Slow down");
    const err500 = ApiError.internal();

    assert.equal(err400.statusCode, 400);
    assert.equal(err400.isOperational, true);
    assert.deepEqual(err400.details, { field: "email" });
    assert.equal(err404.statusCode, 404);
    assert.equal(err429.statusCode, 429);
    assert.equal(err500.statusCode, 500);
  });

  it("signs and verifies JWTs with dynamic 1d vs 30d expiry and hardened cookie flags", () => {
    const shortToken = signToken("user-123", false);
    const longToken = signToken("user-123", true);

    const shortPayload = verifyToken(shortToken);
    const longPayload = verifyToken(longToken);

    assert.equal(shortPayload.id, "user-123");
    assert.ok(longPayload.exp - longPayload.iat > shortPayload.exp - shortPayload.iat);
    assert.throws(() => verifyToken("tampered.jwt.token"));

    const cookieOpts = getCookieOptions(true);
    assert.equal(cookieOpts.httpOnly, true);
    assert.equal(cookieOpts.maxAge, 30 * 24 * 60 * 60 * 1000);
  });
});

describe("validate & errorHandler middleware", () => {
  it("sanitizes Express query/params in place without reassigning getter property", () => {
    const schema = z.object({ mode: z.enum(["words", "lines"]).default("words") });
    const queryStore = { mode: "lines", extraNoise: "drop-me" };
    const req = {
      get query() {
        return queryStore;
      },
    };

    let nextArg;
    validate(schema, "query")(req, {}, (arg) => {
      nextArg = arg;
    });

    assert.equal(nextArg, undefined);
    assert.deepEqual(queryStore, { mode: "lines" });
  });

  it("forwards ApiError(400) when schema validation fails", () => {
    const schema = z.object({ email: z.string().email() });
    const req = { body: { email: "not-an-email" } };
    let forwarded;

    validate(schema, "body")(req, {}, (err) => {
      forwarded = err;
    });

    assert.equal(forwarded.statusCode, 400);
    assert.equal(forwarded.message, "Validation failed");
  });

  it("maps CastError, duplicate key (11000), and ZodError to appropriate non-500 codes", () => {
    const mockRes = () => {
      const out = { statusCode: null, body: null };
      return {
        status(code) {
          out.statusCode = code;
          return this;
        },
        json(payload) {
          out.body = payload;
          return this;
        },
        out,
      };
    };

    const r1 = mockRes();
    errorHandler({ name: "CastError", path: "id", value: "bad" }, {}, r1, () => {});
    assert.equal(r1.out.statusCode, 400);

    const r2 = mockRes();
    errorHandler({ code: 11000, keyValue: { email: "a@b.com" } }, {}, r2, () => {});
    assert.equal(r2.out.statusCode, 409);

    const r3 = mockRes();
    errorHandler({ name: "ZodError", issues: [{ message: "Invalid" }] }, {}, r3, () => {});
    assert.equal(r3.out.statusCode, 400);
  });
});
