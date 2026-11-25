import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/context/ThemeContext";
import { Navbar } from "@/components/landing/Navbar";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

describe("Landing Navbar anchor clearance & active scrollspy", () => {
  let pricingEl;

  beforeEach(() => {
    pricingEl = document.createElement("section");
    pricingEl.id = "pricing";
    pricingEl.getBoundingClientRect = () => ({
      top: 620,
      bottom: 1200,
      left: 0,
      right: 1280,
      width: 1280,
      height: 580,
    });
    document.body.appendChild(pricingEl);

    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    pricingEl?.remove();
  });

  it("offsets anchor scrolling beneath floating header and highlights clicked item", () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <Navbar />
        </ThemeProvider>
      </MemoryRouter>
    );

    const pricingLinks = screen.getAllByRole("link", { name: "Pricing" });
    fireEvent.click(pricingLinks[0]);

    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    const callArg = window.scrollTo.mock.calls[0][0];
    // Target top (620) minus DEFAULT_HEADER_OFFSET (112) when barBottom is 0 in jsdom -> 508px
    expect(callArg.top).toBeLessThan(620);
    expect(callArg.behavior).toBe("smooth");
    expect(pricingLinks[0]).toHaveAttribute("aria-current", "location");
  });
});
