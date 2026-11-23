import { useEffect, useMemo, useState, Component } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PDFViewer } from "@react-pdf/renderer";
import { ArrowLeft, Download, FileText, Loader2, Eye, FileCode } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { VersionSwitcher } from "@/components/resume/VersionSwitcher";
import { ResumeDocument } from "@/components/export/ResumeDocument";
import { useResume, useFullVersion } from "@/hooks/useResumes";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/UIContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

class PdfErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("PDFViewer render error, falling back to Paper view:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function Export() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const { data, isLoading, error } = useResume(id);
  const resume = data?.resume;
  const versions = data?.versions || [];

  useDocumentTitle(resume?.title ? `Export ${resume.title}` : "Export Resume");
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [viewMode, setViewMode] = useState("paper"); // 'paper' | 'pdf'
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!activeVersionId && versions.length) {
      setActiveVersionId(resume?.currentVersion || versions[versions.length - 1]._id);
    }
  }, [versions, resume, activeVersionId]);

  const activeVersionFromList = useMemo(
    () => versions.find((v) => v._id === activeVersionId),
    [versions, activeVersionId]
  );

  const fullVersion = useFullVersion(id, activeVersionId);
  const version = fullVersion.data || activeVersionFromList;

  const docProps = useMemo(
    () => ({ user, version, title: resume?.title }),
    [user, version, resume?.title]
  );

  const fileName = useMemo(() => {
    const base = (resume?.title || "resume")
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "_");
    return `${base}_${version?.label || "V1"}.pdf`;
  }, [resume?.title, version?.label]);

  async function handleDownload() {
    if (!version) return;
    setIsDownloading(true);
    try {
      // 1. Primary: Try generating via @react-pdf/renderer
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<ResumeDocument {...docProps} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF exported successfully", fileName);
    } catch (pdfErr) {
      console.warn("React-PDF export failed, using robust jsPDF fallback:", pdfErr);
      try {
        // 2. Reliable Fallback: jsPDF export
        const { downloadVersionWithJsPdf } = await import("@/api/generateSamplePdf");
        downloadVersionWithJsPdf(version, fileName, resume?.title);
        toast.success("PDF exported successfully", fileName);
      } catch (fallbackErr) {
        toast.error("Download failed", fallbackErr.message);
      }
    } finally {
      setIsDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3 rounded-2xl" />
        <Skeleton className="h-[600px] rounded-3xl" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={FileText}
        title="Couldn't load resume"
        description={error.message}
        action={
          <Button variant="outline" onClick={() => nav("/resumes")}>
            Back to resumes
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Export — ${resume?.title || "Resume"}`}
        description="Preview a clean ATS-friendly document and download the ready-to-send PDF."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => nav(`/resumes/${id}`)}>
              <ArrowLeft size={14} /> Back to resume
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="flex-wrap gap-4">
          <div>
            <CardTitle className="text-base">Version & Export</CardTitle>
            <CardDescription className="mt-1">
              Select which version to preview and download
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <VersionSwitcher
              versions={versions}
              activeId={activeVersionId}
              onChange={setActiveVersionId}
            />

            {/* View Mode Toggle */}
            <div className="inline-flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] p-1 rounded-full text-xs">
              <button
                type="button"
                onClick={() => setViewMode("paper")}
                className={`h-7 px-3 rounded-full font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "paper"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-card"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <Eye size={13} /> Document View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("pdf")}
                className={`h-7 px-3 rounded-full font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "pdf"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-card"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <FileCode size={13} /> PDF Viewer
              </button>
            </div>

            {/* Guaranteed Direct Download Action */}
            <Button
              variant="accent"
              size="md"
              disabled={isDownloading || !version}
              onClick={handleDownload}
            >
              {isDownloading ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" /> Preparing PDF…
                </>
              ) : (
                <>
                  <Download size={14} className="mr-1.5" /> Download PDF
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {version?.sourceType === "rewrite" && (
          <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] pt-2">
            <Badge tone="accent">AI-improved</Badge>
            This version includes AI-optimized bullets and improvements.
          </div>
        )}
      </Card>

      {!version && fullVersion.isLoading && (
        <Skeleton className="h-[800px] rounded-3xl" />
      )}

      {fullVersion.error && !version && (
        <EmptyState
          icon={FileText}
          title="Couldn't load this version"
          description={fullVersion.error.message}
        />
      )}

      {version && viewMode === "paper" && (
        <div className="py-4">
          <PaperPreview version={version} user={user} title={resume?.title} />
        </div>
      )}

      {version && viewMode === "pdf" && (
        <Card padding="none" className="overflow-hidden">
          <PdfErrorBoundary
            fallback={
              <div className="p-8 text-center space-y-3">
                <div className="text-sm font-medium text-[var(--ink)]">
                  PDF viewer frame unavailable in this browser
                </div>
                <div className="text-xs text-[var(--ink-muted)]">
                  Use the Document View tab or click Download PDF directly.
                </div>
                <Button variant="outline" size="sm" onClick={() => setViewMode("paper")}>
                  Switch to Document View
                </Button>
              </div>
            }
          >
            <PDFViewer
              style={{
                width: "100%",
                height: "min(85vh, 1000px)",
                border: "none",
                borderRadius: 20,
              }}
              showToolbar={false}
            >
              <ResumeDocument {...docProps} />
            </PDFViewer>
          </PdfErrorBoundary>
        </Card>
      )}
    </div>
  );
}

function PaperPreview({ version, user, title }) {
  const p = version?.parsedSections || {};
  const b = p.basics || {};
  const displayName = b.name?.trim() || user?.name || "Your Name";
  const displayEmail = b.email?.trim() || user?.email || "";

  return (
    <div className="bg-white text-[#111418] max-w-[800px] mx-auto p-8 sm:p-14 rounded-2xl shadow-xl border border-[var(--border)] font-sans leading-relaxed text-sm">
      {/* Header */}
      <div className="border-b border-[#E5E5DF] pb-5 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111418]">{displayName}</h1>
        {b.title && <div className="text-sm sm:text-base text-[#2F4A3A] font-medium mt-1">{b.title}</div>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5C6470] mt-2.5">
          {b.location && <span>{b.location}</span>}
          {displayEmail && (
            <a href={`mailto:${displayEmail}`} className="text-[#2F4A3A] hover:underline">
              {displayEmail}
            </a>
          )}
          {b.phone && <span>{b.phone}</span>}
          {(Array.isArray(b.links) ? b.links : []).map((l, i) => {
            const url = typeof l === "string" ? l : l.url;
            const label = typeof l === "string" ? l : l.label || l.url;
            return url ? (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-[#2F4A3A] hover:underline"
              >
                {label}
              </a>
            ) : null;
          })}
        </div>
      </div>

      {/* Summary */}
      {p.summary && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider font-bold text-[#2F4A3A] border-b border-[#E5E5DF] pb-1 mb-2">
            Professional Summary
          </div>
          <p className="text-[#22262E] text-xs sm:text-sm leading-relaxed">{p.summary}</p>
        </div>
      )}

      {/* Experience */}
      {p.experience?.length > 0 && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider font-bold text-[#2F4A3A] border-b border-[#E5E5DF] pb-1 mb-3">
            Experience
          </div>
          <div className="space-y-4">
            {p.experience.map((exp, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline flex-wrap">
                  <div className="font-bold text-xs sm:text-sm text-[#111418]">{exp.role || "Role"}</div>
                  <div className="text-[11px] text-[#5C6470]">{exp.period}</div>
                </div>
                {(exp.company || exp.location) && (
                  <div className="text-xs text-[#2F4A3A] font-semibold mb-1.5">
                    {exp.company}
                    {exp.company && exp.location ? " · " : ""}
                    {exp.location}
                  </div>
                )}
                <ul className="list-disc list-outside pl-4 space-y-1 text-xs text-[#333842]">
                  {(Array.isArray(exp.bullets) ? exp.bullets : []).map((bullet, j) => {
                    const text =
                      typeof bullet === "string"
                        ? bullet
                        : bullet?.rewritten || bullet?.text || String(bullet || "");
                    return text.trim() ? <li key={j}>{text}</li> : null;
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {p.projects?.length > 0 && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider font-bold text-[#2F4A3A] border-b border-[#E5E5DF] pb-1 mb-3">
            Projects
          </div>
          <div className="space-y-3">
            {p.projects.map((proj, i) => (
              <div key={i}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-xs sm:text-sm text-[#111418]">
                    {proj.name || proj.title || "Project"}
                  </span>
                  {proj.tech?.length && (
                    <span className="text-[11px] text-[#2F4A3A]">
                      {Array.isArray(proj.tech) ? proj.tech.join(" · ") : proj.tech}
                    </span>
                  )}
                </div>
                {proj.description && (
                  <div className="text-xs text-[#333842] mt-0.5">{proj.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {p.education?.length > 0 && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider font-bold text-[#2F4A3A] border-b border-[#E5E5DF] pb-1 mb-2">
            Education
          </div>
          <div className="space-y-2">
            {p.education.map((edu, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline flex-wrap">
                  <span className="font-bold text-xs sm:text-sm text-[#111418]">{edu.degree}</span>
                  <span className="text-[11px] text-[#5C6470]">{edu.period}</span>
                </div>
                <div className="text-[11px] text-[#5C6470]">
                  {edu.school}
                  {edu.school && edu.location ? ` · ${edu.location}` : edu.location}
                </div>
                {edu.details && (
                  <div className="text-[11px] text-[#5C6470]">{edu.details}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {p.skills?.length > 0 && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider font-bold text-[#2F4A3A] border-b border-[#E5E5DF] pb-1 mb-2">
            Technical Skills
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.skills.map((s, i) => {
              const skillName = typeof s === "string" ? s : s?.name || "";
              return skillName ? (
                <span
                  key={i}
                  className="text-[11px] bg-[#E6EFE8] text-[#2F4A3A] px-2.5 py-0.5 rounded-full font-medium"
                >
                  {skillName}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Certifications */}
      {p.certifications?.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-[#2F4A3A] border-b border-[#E5E5DF] pb-1 mb-2">
            Certifications
          </div>
          <div className="space-y-1">
            {p.certifications.map((c, i) => (
              <div key={i} className="text-xs text-[#333842]">
                <span className="font-medium text-[#111418]">
                  {typeof c === "string" ? c : c.name}
                </span>
                {c.issuer && <span className="text-[#5C6470]"> · {c.issuer}</span>}
                {c.year && <span className="text-[#5C6470]"> ({c.year})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!p.summary && !p.experience?.length && !p.projects?.length && !p.education?.length && !p.skills?.length && (
        <div className="py-12 text-center text-xs text-[#5C6470] italic">
          No structured sections found in this version. Run an AI analysis on the resume page to populate this export template.
        </div>
      )}
    </div>
  );
}
