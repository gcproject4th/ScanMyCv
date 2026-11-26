
import axios from "axios";

// Fall back to relative path "/api" in local dev so Vite proxy works,
// or use explicit VITE_API_URL in production.
const baseURL = import.meta.env.VITE_API_URL || "/api";

export const getApiBaseUrl = () => baseURL;

export const apiClient = axios.create({
  baseURL,
  withCredentials: true, // Crucial for HTTP-only JWT cookies across domains
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("scanmycv_token") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const rawMsg =
      err.response?.data?.message ||
      err.response?.data?.error?.message ||
      (typeof err.response?.data === "string" ? err.response.data : null) ||
      err.message ||
      "Request failed";
    const message =
      status === 401 && /^Request failed with status code 401$/i.test(rawMsg)
        ? "Invalid email or password"
        : rawMsg;
    return Promise.reject({
      status,
      message,
      details: err.response?.data?.details || err.response?.data?.error?.details,
      original: err,
    });
  }
);


