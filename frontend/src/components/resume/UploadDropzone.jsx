import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { UploadCloud, FileText, X, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCreateSampleResume } from "@/hooks/useResumes";
import { useUploadManager } from "@/context/UploadContext";

const MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadDropzone({ onUploaded, compact = false }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const createSample = useCreateSampleResume();
  const { isUploading, uploadFileName, progressStage, startUpload } = useUploadManager();

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: MAX_BYTES,
    multiple: false,
    disabled: isUploading,
    onDropAccepted: (files) => {
      setErr("");
      setFile(files[0]);
      if (!title) setTitle(files[0].name.replace(/\.pdf$/i, ""));
    },
    onDropRejected: (rejections) => {
      const reason = rejections?.[0]?.errors?.[0]?.message || "File rejected";
      setErr(reason);
    },
  });

  async function submit() {
    if (!file) return;
    setErr("");
    try {
      const data = await startUpload({ file, title });
      setFile(null);
      setTitle("");
      onUploaded?.(data.resume);
    } catch (e) {
      setErr(e?.message || "Upload failed");
    }
  }

  function reset() {
    setFile(null);
    setTitle("");
    setErr("");
  }

  const hasActiveFile = Boolean(file || isUploading);

  return (
    <div className="space-y-3">
      {!hasActiveFile && (
        <>
          <div
            {...getRootProps()}
            className={cn(
              "rounded-3xl border border-dashed cursor-pointer transition-all duration-200 outline-none",
              compact ? "p-6" : "p-10",
              isDragActive
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/40",
              isDragReject && "border-[var(--danger)] bg-[#F8E3E0]"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center text-center">
              <motion.div
                animate={isDragActive ? { y: -4 } : { y: 0 }}
                className={cn(
                  "rounded-2xl flex items-center justify-center mb-3",
                  compact ? "h-10 w-10" : "h-14 w-14",
                  isDragActive
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                )}
              >
                <UploadCloud size={compact ? 18 : 22} />
              </motion.div>
              <div className={cn("font-display font-semibold tracking-tight", compact ? "text-sm" : "text-base")}>
                {isDragActive ? "Drop it here" : "Drop your resume PDF"}
              </div>
              <div className="text-xs text-[var(--ink-muted)] mt-1">
                or click to browse · max 5 MB · PDF only
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-[var(--ink-muted)]">
            <span>Don't have a PDF ready?</span>
            <button
              type="button"
              disabled={createSample.isPending}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const data = await createSample.mutateAsync();
                  if (data?.resume) {
                    onUploaded?.(data.resume);
                  }
                } catch {
                  // toast handled by hook
                }
              }}
              className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline cursor-pointer disabled:opacity-60"
            >
              {createSample.isPending ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Try with a Demo Resume →
                </>
              )}
            </button>
          </div>
        </>
      )}

      {hasActiveFile && (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-strong)] shrink-0">
            <FileText size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{file ? file.name : uploadFileName}</div>
            <div className="text-xs text-[var(--ink-muted)] truncate">
              {isUploading ? (progressStage || "Parsing in background...") : formatBytes(file?.size || 0)}
            </div>
          </div>
          {!isUploading && (
            <button
              onClick={reset}
              className="h-8 w-8 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-muted)] cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {hasActiveFile && (
        <div className="space-y-3">
          <Input
            placeholder="Resume title (optional)"
            value={isUploading ? (title || (uploadFileName ? uploadFileName.replace(/\.pdf$/i, "") : "")) : title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
          />
          <Button
            onClick={submit}
            variant="accent"
            size="lg"
            disabled={isUploading || (!file && !isUploading)}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {progressStage || "Parsing..."}
              </>
            ) : (
              "Upload & parse"
            )}
          </Button>
        </div>
      )}

      {err && (
        <div className="text-xs text-[var(--danger)] bg-[#F8E3E0] rounded-xl px-3 py-2">
          {err}
        </div>
      )}
    </div>
  );
}
