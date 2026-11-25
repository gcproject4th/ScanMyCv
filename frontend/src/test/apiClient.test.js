import { describe, it, expect, beforeEach } from "vitest";
import { apiClient } from "@/api/client";

describe("apiClient interceptors", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("attaches Bearer token from localStorage on outgoing requests", async () => {
    localStorage.setItem("scanmycv_token", "jwt-test-token");
    const requestHandler = apiClient.interceptors.request.handlers[0].fulfilled;

    const config = await requestHandler({ headers: {} });
    expect(config.headers.Authorization).toBe("Bearer jwt-test-token");
  });

  it("surfaces backend response.data.message before generic Axios message", async () => {
    const errorHandler = apiClient.interceptors.response.handlers[0].rejected;

    await expect(
      errorHandler({
        message: "Request failed with status code 400",
        response: {
          status: 400,
          data: {
            success: false,
            message: "Only PDF files are allowed",
            details: { field: "file" },
          },
        },
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "Only PDF files are allowed",
      details: { field: "file" },
    });
  });

  it("extracts nested error.message and plain-string proxy errors cleanly", async () => {
    const errorHandler = apiClient.interceptors.response.handlers[0].rejected;

    await expect(
      errorHandler({
        message: "Request failed with status code 422",
        response: {
          status: 422,
          data: { error: { message: "Nested schema error", details: ["bad"] } },
        },
      })
    ).rejects.toMatchObject({
      status: 422,
      message: "Nested schema error",
      details: ["bad"],
    });

    await expect(
      errorHandler({
        message: "Request failed with status code 502",
        response: {
          status: 502,
          data: "An error occurred with this application.",
        },
      })
    ).rejects.toMatchObject({
      status: 502,
      message: "An error occurred with this application.",
    });
  });
});
