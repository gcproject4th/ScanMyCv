import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowRight, Sun, Moon, User } from "lucide-react";
import AILogo from "@/components/layout/AILogo";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { prefetchRoute } from "@/routes";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Dashboard", href: "#dashboard-preview" },
  { label: "Pricing", href: "#pricing" },
];

// Breathing gap beneath the collapsed floating header pill so section eyebrows & headlines sit in clear air
const HEADER_CLEARANCE_GAP = 28;
const DEFAULT_HEADER_OFFSET = 112;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeHref, setActiveHref] = useState("");
  const barRef = useRef(null);
  const navLockRef = useRef({ href: "", until: 0 });
  const { theme, toggle } = useTheme();
  const { user, loading } = useAuth(); // Auth context integrated

  useEffect(() => {
    const updateScrollState = () => {
      const y = window.scrollY;
      setScrolled(y > 8);

      // Avoid intermediate section flicker while programmatic smooth-scroll is animating
      if (Date.now() < navLockRef.current.until) {
        return;
      }

      // Scrollspy: highlight whichever landmark section sits at the reading focal line
      const focalOffset = (barRef.current?.getBoundingClientRect().bottom || 82) + 80;
      let current = "";
      for (const item of NAV_LINKS) {
        const target = document.getElementById(item.href.slice(1));
        if (!target) continue;
        if (target.getBoundingClientRect().top <= focalOffset) {
          current = item.href;
        }
      }
      setActiveHref(current);
    };

    const handleScrollEnd = () => {
      if (navLockRef.current.until) {
        navLockRef.current.until = 0;
        updateScrollState();
      }
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("scrollend", handleScrollEnd, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("scrollend", handleScrollEnd);
    };
  }, []);

  const handleAnchorClick = useCallback((e, href) => {
    const id = href.slice(1);
    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();
    setOpen(false);
    navLockRef.current = { href, until: Date.now() + 950 };
    setActiveHref(href);

    // Measure the collapsed top bar row dynamically so mobile drawer collapse never skews landing position
    const barBottom = barRef.current?.getBoundingClientRect().bottom;
    const clearance = barBottom ? Math.round(barBottom + HEADER_CLEARANCE_GAP) : DEFAULT_HEADER_OFFSET;
    const targetTop = target.getBoundingClientRect().top + window.scrollY - clearance;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });

    if (window.location.hash !== href) {
      window.history.pushState(null, "", href);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 925) setOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Preload relevant route chunks during browser idle time without wasting data on unused charts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const prefetch = () => {
          if (user) {
            prefetchRoute.dashboard?.();
          } else {
            prefetchRoute.login?.();
            prefetchRoute.register?.();
          }
        };

        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(prefetch);
        } else {
          prefetch();
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [user]);

  const isOverHero = !scrolled && !open;

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-3 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none"
    >
      <div
        className={cn(
          "max-w-[1240px] mx-auto rounded-2xl [@media(min-width:926px)]:rounded-full border transition-all duration-300 pointer-events-auto",
          scrolled || open
            ? "bg-[var(--surface)]/85 border-[var(--border)] backdrop-blur-xl shadow-card"
            : "bg-black/20 border-white/10 backdrop-blur-md"
        )}
      >
        <div ref={barRef} className="flex items-center justify-between gap-3 px-3.5 sm:px-5 py-2.5">
          {/* Left: Brand Logo */}
          <Link to="/" title="ScanMyCV Home" className="flex items-center gap-2.5 shrink-0 cursor-pointer">
            <div className="flex items-center justify-center shrink-0">
              <AILogo />
            </div>
            <span
              className={cn(
                "font-display text-sm sm:text-[15px] font-semibold tracking-tight hidden min-[380px]:inline transition-colors",
                isOverHero ? "text-white" : "text-[var(--ink)]"
              )}
            >
              ScanMyCV
            </span>
          </Link>

          {/* Center: Navigation Links (Visible > 925px) */}
          <nav aria-label="Primary navigation" className="hidden [@media(min-width:926px)]:flex items-center gap-1">
            {NAV_LINKS.map((l) => {
              const isActive = activeHref === l.href;
              return (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={(e) => handleAnchorClick(e, l.href)}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors",
                    isOverHero
                      ? isActive
                        ? "text-white bg-white/15"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                      : isActive
                        ? "text-[var(--ink)] bg-[var(--surface-2)] font-semibold shadow-[inset_0_0_0_1px_var(--border)]"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
                  )}
                >
                  {l.label}
                </a>
              );
            })}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Theme Toggle Button */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={toggle}
              className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                isOverHero
                  ? "text-white hover:bg-white/10 border border-white/15"
                  : "text-[var(--ink)] hover:bg-[var(--surface-2)] border border-[var(--border)]"
              )}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              <motion.div
                key={theme}
                initial={{ scale: 0.6, rotate: -90, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex items-center justify-center"
              >
                {theme === "light" ? (
                  <Moon size={16} className={isOverHero ? "text-white" : "text-[var(--ink)]"} />
                ) : (
                  <Sun size={16} className={isOverHero ? "text-white" : "text-[var(--ink)]"} />
                )}
              </motion.div>
            </motion.button>

            {/* Auth Conditional UI */}
            {!loading && user ? (
              <Link
                to="/dashboard"
                onMouseEnter={() => prefetchRoute.dashboard?.()}
                className={cn(
                  "inline-flex items-center gap-2 h-9 px-3 rounded-full text-xs sm:text-[13px] font-medium transition-colors shrink-0",
                  isOverHero
                    ? "bg-white/12 border border-white/15 text-white hover:bg-white/20"
                    : "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--border)]/40"
                )}
              >
                <div className="h-6 w-6 rounded-full overflow-hidden bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center text-xs font-semibold shrink-0">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    user.name?.[0]?.toUpperCase() || <User size={14} />
                  )}
                </div>
                <span className="hidden sm:inline font-medium max-w-[120px] truncate">{user.name?.split(" ")[0]}</span>
              </Link>
            ) : (
              <>
                {/* Sign In Link */}
                <Link
                  to="/login"
                  onMouseEnter={() => prefetchRoute.login?.()}
                  className={cn(
                    "hidden sm:inline-flex items-center justify-center h-9 px-4 rounded-full text-[13px] font-medium transition-colors",
                    isOverHero
                      ? "text-white hover:bg-white/10"
                      : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                  )}
                >
                  Sign in
                </Link>

                {/* Get Started Button */}
                <Link
                  to="/register"
                  onMouseEnter={() => prefetchRoute.register?.()}
                  className={cn(
                    "group inline-flex items-center justify-center gap-1.5 h-9 px-3.5 sm:px-4 rounded-full text-xs sm:text-[13px] font-semibold active:scale-[0.98] transition-all shrink-0",
                    isOverHero
                      ? "bg-white text-zinc-900 hover:bg-white/90 shadow-md"
                      : "bg-[var(--ink)] text-[var(--bg)] hover:opacity-90 shadow-sm"
                  )}
                >
                  <span>Get started</span>
                  <ArrowRight
                    size={13}
                    className="group-hover:translate-x-0.5 transition-transform shrink-0"
                  />
                </Link>
              </>
            )}

            {/* Mobile Drawer Trigger (Visible <= 925px) */}
            <button
              onClick={() => setOpen((o) => !o)}
              className={cn(
                "[@media(min-width:926px)]:hidden h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer",
                isOverHero
                  ? "text-white hover:bg-white/10"
                  : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
              )}
              aria-label="Toggle menu"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu (Visible <= 925px) */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="[@media(min-width:926px)]:hidden border-t border-[var(--border)] px-4 py-3 space-y-1 overflow-hidden"
            >
              {NAV_LINKS.map((l) => {
                const isActive = activeHref === l.href;
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={(e) => handleAnchorClick(e, l.href)}
                    aria-current={isActive ? "location" : undefined}
                    className={cn(
                      "block px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[var(--surface-2)] text-[var(--ink)] font-semibold"
                        : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                    )}
                  >
                    {l.label}
                  </a>
                );
              })}

              <div className="pt-2 mt-2 border-t border-[var(--border)]/60">
                {!loading && user ? (
                  <Link
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full overflow-hidden bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center text-xs font-bold shrink-0">
                      {user?.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        user.name?.[0]?.toUpperCase() || <User size={16} />
                      )}
                    </div>
                    <span>{user.name}</span>
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 rounded-xl text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors sm:hidden"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}