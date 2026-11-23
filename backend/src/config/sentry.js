import * as Sentry from "@sentry/node";

export function initBackendSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Sentry remains completely dormant without a DSN
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV || "development",
  });
}
