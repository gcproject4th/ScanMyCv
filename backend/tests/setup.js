/**
 * Test bootstrap loaded via `node --import ./tests/setup.js --test`.
 * Ensures required ENV defaults exist before modules importing ENV.js evaluate,
 * while setting safe test defaults without touching real .env secrets.
 */
process.env.NODE_ENV ??= "test";
process.env.MONGO_URL ??= "mongodb://127.0.0.1:27017/scanmycv_test";
process.env.JWT_SECRET ??= "scanmycv-unit-test-secret-key-do-not-use-in-prod";
process.env.GEMINI_API_KEY ??= "test-invalid-key-triggers-fallback-if-called";
