export const MAX_RESUME_CHARS = 20_000;
export const MAX_ROLE_CHARS = 120;

/**
 * Strips non-printable control bytes (preserving tabs/newlines) and bounds input
 * length so oversized PDFs cannot exhaust LLM token budgets or smuggle binary data.
 */
export function sanitizeUntrustedText(value, maxChars = MAX_RESUME_CHARS) {
  const source = String(value || "").slice(0, maxChars * 2);
  let cleaned = "";

  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if ((code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13) {
      cleaned += source[i];
    }
  }

  cleaned = cleaned.trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}\n...[truncated at ${maxChars} chars]`;
}
