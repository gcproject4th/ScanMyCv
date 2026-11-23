import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, Wand2, ShieldCheck, Cpu } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const ANALYSIS_STEPS = [
  {
    title: "Extracting resume layout & bullet hierarchy...",
    detail: "Parsing section boundaries, headings, and experience chronology",
    minTime: 0,
  },
  {
    title: "Auditing ATS keyword density against benchmarks...",
    detail: "Cross-referencing industry skill taxonomies and job market roles",
    minTime: 2200,
  },
  {
    title: "Scoring impact metrics and quantifying weak phrasing...",
    detail: "Evaluating action verbs, measurable outcomes, and passive voice",
    minTime: 5200,
  },
  {
    title: "Synthesizing ATS scorecard & targeted recommendations...",
    detail: "Assembling breakdown metrics, strengths, and AI bullet upgrades",
    minTime: 8200,
  },
];

const REWRITE_STEPS = [
  {
    title: "Diffing selected bullet rewrites against baseline...",
    detail: "Isolating weak phrases and aligning action verb replacements",
    minTime: 0,
  },
  {
    title: "Injecting quantified impact into experience nodes...",
    detail: "Patching structured JSON representation of your resume",
    minTime: 1800,
  },
  {
    title: "Minting new resume version and recalculating ATS delta...",
    detail: "Updating version tree and storing clean audit history",
    minTime: 3600,
  },
];

export function AIProgressStepper({ mode = "analyze", title, subtitle, className }) {
  const steps = mode === "rewrite" ? REWRITE_STEPS : ANALYSIS_STEPS;
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = now - startTime;
      setElapsed(diff);

      // Determine step based on elapsed time
      for (let i = steps.length - 1; i >= 0; i--) {
        if (diff >= steps[i].minTime) {
          setCurrentStep(i);
          break;
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [steps]);

  // Compute smooth progress percentage (caps at 95% while waiting for network resolution)
  const maxTime = steps[steps.length - 1].minTime + 3000;
  const rawPercent = Math.min(Math.round((elapsed / maxTime) * 92), 94);
  const progressPercent = Math.max(8, rawPercent);

  return (
    <div className={cn("space-y-6 animate-in fade-in duration-300", className)}>
      <Card className="p-6 sm:p-9 border-[var(--accent)]/30 bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] shadow-card">
        <div className="max-w-xl mx-auto space-y-6">
          {/* Header & Icon */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-[var(--accent)]/20 animate-ping opacity-40" />
              <div className="relative w-13 h-13 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center border border-[var(--accent)]/30 shadow-sm">
                {mode === "rewrite" ? (
                  <Wand2 size={24} className="animate-spin text-[var(--accent)]" />
                ) : (
                  <Sparkles size={24} className="animate-spin text-[var(--accent)]" />
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-[var(--ink)]">
                  {title || (mode === "rewrite" ? "Synthesizing New Version..." : "Analyzing Resume with AI...")}
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-[var(--accent-soft)] text-[var(--accent-strong)] border border-[var(--accent)]/25">
                  <Cpu size={11} /> {(elapsed / 1000).toFixed(1)}s
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--ink-muted)] mt-1 leading-relaxed">
                {subtitle ||
                  (mode === "rewrite"
                    ? "Applying quantified rewrites and incrementing version history."
                    : "Benchmarking against 2026 enterprise ATS parsers and generating tailored fixes.")}
              </p>
            </div>
          </div>

          {/* Smooth Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-mono text-[var(--ink-muted)]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-[var(--accent)]" />
                Step {currentStep + 1} of {steps.length}
              </span>
              <span className="font-semibold text-[var(--ink)]">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--border)] overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] via-[var(--accent-strong)] to-[var(--accent)] transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stepper Checklist */}
          <div className="space-y-2 pt-1">
            {steps.map((step, idx) => {
              const isDone = currentStep > idx;
              const isCurrent = currentStep === idx;
              return (
                <div
                  key={step.title}
                  className={cn(
                    "flex items-start gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all duration-300",
                    isDone
                      ? "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)]"
                      : isCurrent
                      ? "bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--ink)] shadow-sm"
                      : "opacity-40 border-transparent text-[var(--ink-muted)]"
                  )}
                >
                  <div className="shrink-0 mt-0.5 flex items-center justify-center w-5 h-5">
                    {isDone ? (
                      <CheckCircle2 size={16} className="text-[var(--success)]" />
                    ) : isCurrent ? (
                      <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[var(--border)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-xs sm:text-sm font-medium leading-tight",
                        isCurrent ? "text-[var(--ink)] font-semibold" : "text-[var(--ink-muted)]"
                      )}
                    >
                      {step.title}
                    </div>
                    {isCurrent && (
                      <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 leading-snug">
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center">
            <span className="text-[11px] text-[var(--ink-muted)] opacity-75">
              Tip: ScanMyCv audits against Taleo, Greenhouse, and Workday ATS specifications.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
