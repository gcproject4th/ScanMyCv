import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/Login";
import { UIProvider } from "@/context/UIContext";
import { formatAuthError } from "@/api/auth";

const mockLogin = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <UIProvider>
        <Login />
      </UIProvider>
    </MemoryRouter>
  );
}

describe("Login wrong-password notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("displays friendly wrong-password banner and toast popup on 401 instead of raw status code", async () => {
    mockLogin.mockRejectedValueOnce({
      status: 401,
      message: "Request failed with status code 401",
    });

    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "john@gmail.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "wrongpass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Wrong password or email. Please check your credentials and try again."
      );
    });

    expect(screen.getByText("Sign in failed")).toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code 401/i)).not.toBeInTheDocument();
  });

  it("preserves provider-specific OAuth guidance when account has no local password", () => {
    const oauthMsg = "This account uses Google sign-in. Please continue with your provider.";
    expect(formatAuthError({ status: 401, message: oauthMsg })).toBe(oauthMsg);
    expect(formatAuthError({ status: 401, message: "Invalid email or password" })).toBe(
      "Wrong password or email. Please check your credentials and try again."
    );
  });
});
