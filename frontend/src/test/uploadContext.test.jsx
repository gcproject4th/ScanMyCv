import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UIProvider } from "@/context/UIContext";
import { UploadProvider, useUploadManager } from "@/context/UploadContext";
import { resumesApi } from "@/api/resumes";

vi.mock("@/api/resumes", () => ({
  resumesApi: {
    upload: vi.fn(),
  },
}));

function TriggerUploadButton({ file, title }) {
  const { startUpload, uploadError } = useUploadManager();
  return (
    <div>
      <button type="button" onClick={() => startUpload({ file, title }).catch(() => {})}>
        Trigger Upload
      </button>
      {uploadError && <span data-testid="upload-error">{uploadError}</span>}
    </div>
  );
}

function renderWithoutRouter(ui) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <UIProvider>
        <UploadProvider>{ui}</UploadProvider>
      </UIProvider>
    </QueryClientProvider>
  );
}

describe("UploadProvider router-isolation & widget resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mounts outside RouterProvider without crashing and renders safe anchor link on upload success", async () => {
    resumesApi.upload.mockResolvedValueOnce({
      resume: { _id: "resume-999", title: "Daksh_CV" },
    });

    const pdfFile = new File(["%PDF-1.4 mock"], "Daksh_CV.pdf", { type: "application/pdf" });
    renderWithoutRouter(<TriggerUploadButton file={pdfFile} title="Daksh_CV" />);

    await act(async () => {
      screen.getByText("Trigger Upload").click();
    });

    await waitFor(() => {
      expect(screen.getByText("Daksh_CV ready!")).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /View & score now/i });
    expect(link).toHaveAttribute("href", "/resumes/resume-999");
  });

  it("captures upload errors cleanly without breaking the floating widget", async () => {
    resumesApi.upload.mockRejectedValueOnce({
      message: "Uploaded file is corrupted or not a valid PDF document",
    });

    const badFile = new File(["not-a-pdf"], "bad.pdf", { type: "application/pdf" });
    renderWithoutRouter(<TriggerUploadButton file={badFile} title="bad" />);

    await act(async () => {
      screen.getByText("Trigger Upload").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toHaveTextContent(
        "Uploaded file is corrupted or not a valid PDF document"
      );
    });
  });
});
