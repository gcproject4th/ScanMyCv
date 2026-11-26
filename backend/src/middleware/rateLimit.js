import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const ipOnlyKeyGenerator = (req) =>
  ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");

const userOrIpKeyGenerator = (req) =>
  req.user?.id || req.user?._id?.toString() || ipOnlyKeyGenerator(req);

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 5 AI operations per user/IP per minute
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many analysis requests, please try again in a minute.",
  },
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15, // 15 PDF uploads per user/IP per 10 minutes
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many PDF uploads, please wait a few minutes before uploading again.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 auth attempts per IP per 15 minutes
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipOnlyKeyGenerator,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many auth attempts, please try again later.",
  },
});

export { analyzeLimiter, uploadLimiter, authLimiter, userOrIpKeyGenerator, ipOnlyKeyGenerator };
