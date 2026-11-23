import { createContext, useContext, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { resumesApi } from "@/api/resumes";
import { resumeKeys } from "@/hooks/useResumes";
import { dashboardKey } from "@/hooks/useDashboard";
import { useToast } from "@/context/UIContext";

const UploadContext = createContext(null);

const UPLOAD_STAGES = [
  { minTime: 0, label: "Uploading PDF binary & checking signature..." },
  { minTime: 1200, label: "Extracting contact info & technical skills..." },
  { minTime: 3000, label: "Structuring experience & education nodes..." },
  { minTime: 5000, label: "Finalizing version V1 and registering audit..." },
];

export function UploadProvider({ children }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileSize, setUploadFileSize] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const [lastUploaded, setLastUploaded] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const qc = useQueryClient();
  const toast = useToast();
  const timerRef = useRef(null);

  const startUpload = useCallback(
    async ({ file, title }) => {
      if (!file) return;

      setIsUploading(true);
      setUploadFileName(file.name);
      setUploadFileSize(file.size);
      setUploadError(null);
      setProgressStage(UPLOAD_STAGES[0].label);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        for (let i = UPLOAD_STAGES.length - 1; i >= 0; i--) {
          if (elapsed >= UPLOAD_STAGES[i].minTime) {
            setProgressStage(UPLOAD_STAGES[i].label);
            break;
          }
        }
      }, 200);

      try {
        const data = await resumesApi.upload(file, title);
        clearInterval(timerRef.current);
        setIsUploading(false);
        setLastUploaded(data?.resume || null);

        qc.invalidateQueries({ queryKey: resumeKeys.list() });
        qc.invalidateQueries({ queryKey: dashboardKey });

        toast.success(
          "Resume parsed & uploaded",
          `${data?.resume?.title || file.name} · parsed and ready as V1`
        );

        return data;
      } catch (err) {
        clearInterval(timerRef.current);
        setIsUploading(false);
        const errMsg = err?.message || "Upload failed. Please try again.";
        setUploadError(errMsg);
        toast.error("Upload failed", errMsg);
        throw err;
      }
    },
    [qc, toast]
  );

  const resetUpload = useCallback(() => {
    setIsUploading(false);
    setUploadFileName("");
    setUploadFileSize(0);
    setProgressStage("");
    setUploadError(null);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return (
    <UploadContext.Provider
      value={{
        isUploading,
        uploadFileName,
        uploadFileSize,
        progressStage,
        uploadError,
        lastUploaded,
        startUpload,
        resetUpload,
      }}
    >
      {children}
      <GlobalUploadWidget
        isUploading={isUploading}
        fileName={uploadFileName}
        stage={progressStage}
        lastUploaded={lastUploaded}
        onDismiss={() => setLastUploaded(null)}
      />
    </UploadContext.Provider>
  );
}

export function useUploadManager() {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error("useUploadManager must be used within an UploadProvider");
  }
  return ctx;
}

function GlobalUploadWidget({ isUploading, fileName, stage, lastUploaded, onDismiss }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            className="pointer-events-auto flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-[var(--surface)] border border-[var(--accent)]/35 shadow-2xl backdrop-blur-md max-w-sm"
          >
            <div className="relative w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-strong)] shrink-0">
              <Sparkles size={18} className="animate-spin text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-xs font-semibold text-[var(--ink)] truncate">
                Parsing {fileName || "Resume"}...
              </div>
              <div className="text-[11px] text-[var(--ink-muted)] truncate mt-0.5">
                {stage || "Extracting structured layout"}
              </div>
            </div>
          </motion.div>
        )}

        {!isUploading && lastUploaded && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--surface)] border border-[var(--success)]/35 shadow-2xl backdrop-blur-md max-w-sm"
          >
            <div className="w-8 h-8 rounded-xl bg-[var(--success)]/15 flex items-center justify-center text-[var(--success)] shrink-0">
              <CheckCircle2 size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[var(--ink)] truncate">
                {lastUploaded.title || "Resume"} ready!
              </div>
              <a
                href={`/resumes/${lastUploaded._id}`}
                onClick={onDismiss}
                className="text-[11px] font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1 mt-0.5"
              >
                View & score now <ArrowRight size={11} />
              </a>
            </div>
            <button
              onClick={onDismiss}
              className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] px-1.5 py-1 rounded"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
