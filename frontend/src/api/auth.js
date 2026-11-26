import { apiClient } from "./client";

/**
 * Translates raw auth HTTP errors into clear, actionable user-facing copy.
 */
export function formatAuthError(err, fallback = "Authentication failed. Please try again.") {
  const status = err?.status ?? err?.original?.response?.status;
  const rawMessage = typeof err?.message === "string" ? err.message.trim() : "";
  const details = err?.details ?? err?.original?.response?.data?.details;

  if (rawMessage && /uses (Google|GitHub|OAuth) sign-in/i.test(rawMessage)) {
    return rawMessage;
  }

  if (
    status === 401 ||
    /status code 401/i.test(rawMessage) ||
    /invalid email or password/i.test(rawMessage)
  ) {
    return "Wrong password or email. Please check your credentials and try again.";
  }

  if (status === 429) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  if (status === 400 && Array.isArray(details) && details[0]?.message) {
    return details[0].message;
  }

  if (rawMessage && !/^Request failed with status code \d+$/i.test(rawMessage)) {
    return rawMessage;
  }

  return fallback;
}

export const authApi = {
  register: (payload) => apiClient.post("/auth/register", payload).then((r) => r.data),
  login: (payload) => apiClient.post("/auth/login", payload).then((r) => r.data),
  logout: () => apiClient.post("/auth/logout").then((r) => r.data),
  me: () => apiClient.get("/auth/me").then((r) => r.data),
  updateProfile: (payload) => apiClient.patch("/auth/profile", payload).then((r) => r.data),
  changePassword: (payload) => apiClient.patch("/auth/password", payload).then((r) => r.data),
};
