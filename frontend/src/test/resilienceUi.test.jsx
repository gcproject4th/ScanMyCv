import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AIProgressStepper } from "@/components/analysis/AIProgressStepper";
import ResumeDetail from "@/pages/ResumeDetail";
import Export from "@/pages/Export";
import * as resumeHooks from "@/hooks/useResumes";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { _id: "u1", name: "Daksh", email: "daksh@test.com" }, loading: false }),
}));

vi.mock("@/context/UIContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock("@/hooks/useResumes", () => ({
  useResume: vi.fn(),
  useFullVersion: vi.fn(),
  useAnalysisForVersion: vi.fn(),
  useAnalyzeResume: vi.fn(),
  useApplyRewrites: vi.fn(),
}));

describe("Analysis & Export defensive UI rendering", () => {
  it("AIProgressStepper displays active mode title and step list", () => {
    render(<AIProgressStepper mode="analyze" />);
    expect(screen.getByText("Analyzing Resume with AI...")).toBeInTheDocument();
    expect(screen.getByText(/Extracting resume layout/i)).toBeInTheDocument();
  });

  it("ResumeDetail displays graceful fallback notice when parsedSections is empty", () => {
    resumeHooks.useResume.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        resume: { _id: "r1", title: "dsr", currentVersionId: "v1", updatedAt: new Date().toISOString() },
        versions: [{ _id: "v1", label: "V1", parsedSections: {} }],
      },
    });
    resumeHooks.useAnalysisForVersion.mockReturnValue({ isLoading: false, data: null });
    resumeHooks.useAnalyzeResume.mockReturnValue({ isPending: false, error: null, mutateAsync: vi.fn() });
    resumeHooks.useApplyRewrites.mockReturnValue({ isPending: false, error: null, mutateAsync: vi.fn() });

    render(
      <MemoryRouter initialEntries={["/resumes/r1"]}>
        <Routes>
          <Route path="/resumes/:id" element={<ResumeDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Parsed Sections (V1)")).toBeInTheDocument();
    expect(screen.getByText(/No structured sections extracted yet/i)).toBeInTheDocument();
  });

  it("Export renders Paper Preview safely and shows fallback hint when sections are empty", () => {
    resumeHooks.useResume.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        resume: { _id: "r1", title: "dsr", currentVersion: "v1" },
        versions: [{ _id: "v1", label: "V1", parsedSections: { basics: { name: "Daksh", email: "daksh@test.com" } } }],
      },
    });
    resumeHooks.useFullVersion.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        _id: "v1",
        label: "V1",
        parsedSections: {
          basics: { name: "Daksh", email: "daksh@test.com" },
          experience: [],
          projects: [],
          education: [],
          skills: [],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/resumes/r1/export"]}>
        <Routes>
          <Route path="/resumes/:id/export" element={<Export />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Daksh")).toBeInTheDocument();
    expect(screen.getByText(/No structured sections found in this version/i)).toBeInTheDocument();
  });
});
