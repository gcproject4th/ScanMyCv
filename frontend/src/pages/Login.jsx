import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Mail, Lock } from "lucide-react";
import {
  AuthShell,
  AuthField,
  AuthPrimaryButton,
  AuthErrorBanner,
} from "@/components/auth/AuthShell";
import AILogo from "@/components/layout/AILogo";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Checkbox } from "@/components/ui/Checkbox";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/UIContext";
import { formatAuthError } from "@/api/auth";

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("error");
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem("scanmycv_remember_choice") === "true";
    } catch {
      return false;
    }
  });
  const [form, setForm] = useState(() => {
    let savedEmail = "";
    try {
      savedEmail = localStorage.getItem("scanmycv_remembered_email") || "";
    } catch {
      /* ignore */
    }
    return { email: savedEmail, password: "" };
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const displayError = err || oauthError || "";

  const handleLogin = async () => {
    setErr("");
    if (!form.email.trim() || !form.password) {
      const msg = "Please enter both your email and password.";
      setErr(msg);
      toast.error("Sign in failed", msg);
      return;
    }

    setLoading(true);
    try {
      await login({ ...form, rememberMe });
      try {
        if (rememberMe) {
          localStorage.setItem("scanmycv_remembered_email", form.email.trim());
          localStorage.setItem("scanmycv_remember_choice", "true");
        } else {
          localStorage.removeItem("scanmycv_remembered_email");
          localStorage.removeItem("scanmycv_remember_choice");
        }
      } catch {
        /* storage access handling */
      }
      nav("/dashboard");
    } catch (e) {
      const msg = formatAuthError(e, "Wrong password or email. Please try again.");
      setErr(msg);
      toast.error("Sign in failed", msg);
      setLoading(false); // Only reset loading on failure; navigation handles unmount on success
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    handleLogin();
  };

  return (
    <AuthShell
      headline={
        <>
          Sharpen your resume,
          <br />
          <em style={{ fontStyle: "italic" }}>with intelligence.</em>
        </>
      }
      subhead="Score against ATS, fix weak bullets, and ship a stronger version of yourself in minutes."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-12">
          <Link to="/" title="ScanMyCV Home" className="inline-block cursor-pointer">
            <AILogo size={48} />
          </Link>
        </div>

        <h1 className="font-display text-[34px] font-semibold tracking-tight text-[var(--ink)] leading-[1.05]">
          Welcome back
        </h1>
        <p className="text-[var(--ink-muted)] mt-2 text-[15px] mb-8">
          Sign in to keep sharpening your resume.
        </p>

        <OAuthButtons />

        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(v) => {
              if (err) setErr("");
              setForm((prev) => ({ ...prev, email: v }));
            }}
            placeholder="you@example.com"
            icon={Mail}
          />

          <AuthField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(v) => {
              if (err) setErr("");
              setForm((prev) => ({ ...prev, password: v }));
            }}
            placeholder="••••••••"
            icon={Lock}
            extra={
              <button
                type="button"
                className="text-xs text-[var(--accent-strong)] font-semibold hover:underline cursor-pointer"
              >
                Forgot?
              </button>
            }
          />

          <div className="flex items-center justify-between pt-0.5">
            <Checkbox
              checked={rememberMe}
              onChange={setRememberMe}
              label="Remember me for 30 days"
            />
          </div>

          <AuthErrorBanner>{displayError}</AuthErrorBanner>

          <div className="pt-1">
            <AuthPrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in <ArrowRight size={15} />
                </>
              )}
            </AuthPrimaryButton>
          </div>
        </form>

        <div className="text-sm text-[var(--ink-muted)] text-center mt-8">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-[var(--accent-strong)] font-semibold hover:underline"
          >
            Create one
          </Link>
        </div>
      </motion.div>
    </AuthShell>
  );
}
