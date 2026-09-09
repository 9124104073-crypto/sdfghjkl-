import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Plus, Sparkles, X } from "lucide-react";
import { C, body, heading } from "../theme";
import { AnimatedNumber, usePrefersReducedMotion } from "./motion";

/**
 * Animated UI elements.
 *
 * These follow the patterns in Jitter's free UI-element library — a counting
 * progress ring, a generate button, a floating action menu, an expanding
 * search bar, a notification toast — rebuilt against our own tokens and wired
 * to real state, so each animation reports something rather than decorating.
 */

/* ------------------------------------------------------------------ */
/* ProgressRing — counter with a ring that draws to the value          */
/* ------------------------------------------------------------------ */
export function ProgressRing({
  value = 0,
  max = 100,
  size = 92,
  stroke = 8,
  label,
  tone = C.teal,
  format,
}) {
  const reduced = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(reduced);

  // Draw on the next frame rather than at mount, so the dash offset has an
  // initial value to transition from — otherwise the arc simply appears.
  //
  // A hidden tab is given no animation frames at all, so the rAF alone would
  // leave every ring stuck at empty: not merely unanimated, but showing the
  // wrong value. A timer races it, since timers still fire when hidden, and
  // whichever arrives first commits the draw.
  useEffect(() => {
    if (reduced) return undefined;
    const raf = requestAnimationFrame(() => setDrawn(true));
    const timer = setTimeout(() => setDrawn(true), 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [reduced, value]);

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        <circle
          className="nir-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (drawn ? frac : 0))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums"
          style={{ fontSize: size * 0.24, fontWeight: 700, color: C.navy, ...heading }}
        >
          {format ? format(value) : <AnimatedNumber value={value} />}
        </span>
      </div>
      {label && (
        <span className="mt-2 text-center text-[11px]" style={{ color: C.slateSoft, ...body }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GenerateButton — the "generate" affordance, with a working state    */
/* ------------------------------------------------------------------ */
export function GenerateButton({
  children = "Generate",
  onClick,
  busy = false,
  disabled = false,
  icon: Icon = Sparkles,
  className = "",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`btn-press nir-sweep relative inline-flex items-center gap-2 overflow-hidden rounded-md px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
      style={{
        background: `linear-gradient(120deg, ${C.navy2}, ${C.teal})`,
        color: "#fff",
        ...body,
      }}
    >
      <Icon size={15} className={busy ? "animate-spin" : ""} strokeWidth={2} />
      <span className="relative z-10">{busy ? "Working…" : children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* FloatingActions — a menu that unfolds from a single trigger         */
/* ------------------------------------------------------------------ */
export function FloatingActions({ actions = [], label = "Quick actions" }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);

  const close = useCallback(() => {
    setClosing(true);
    // Let the exit animation finish before the items leave the tree.
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
  }, []);

  // Click-away and Escape, so the menu never traps the page.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!actions.length) return null;

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
      {open &&
        actions.map((a, i) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              close();
              a.onSelect?.();
            }}
            className={`nir-fab-item nir-interactive flex items-center gap-2 rounded-full border py-2 pl-3 pr-4 text-xs font-medium shadow-lg ${
              closing ? "is-closing" : ""
            }`}
            style={{
              background: C.card,
              borderColor: C.border,
              color: C.navy,
              // Items stagger outward from the trigger, which is what makes
              // the group read as unfolding rather than appearing at once.
              animationDelay: `${(closing ? i : actions.length - 1 - i) * 45}ms`,
              ...body,
            }}
          >
            {a.icon && <a.icon size={14} style={{ color: C.teal }} />}
            {a.label}
          </button>
        ))}

      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={label}
        aria-expanded={open}
        className="btn-press nir-interactive flex h-12 w-12 items-center justify-center rounded-full shadow-xl"
        style={{ background: C.navy, color: "#fff" }}
      >
        <Plus
          size={20}
          style={{
            transform: open ? "rotate(45deg)" : "none",
            transition: "transform 260ms cubic-bezier(0.34,1.56,0.64,1)",
          }}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts — notification stack                                         */
/* ------------------------------------------------------------------ */
const ToastContext = createContext(() => {});

/** `const notify = useToast(); notify({ title, detail, tone })` */
export function useToast() {
  return useContext(ToastContext);
}

const TONES = {
  success: { icon: CheckCircle2, colour: C.green, soft: C.greenSoft },
  warn: { icon: AlertTriangle, colour: C.amber, soft: C.amberSoft },
  error: { icon: AlertTriangle, colour: C.red, soft: C.redSoft },
  info: { icon: Info, colour: C.teal, soft: C.tealSoft },
};

export function ToastProvider({ children, life = 4200 }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 220);
  }, []);

  const notify = useCallback(
    ({ title, detail, tone = "info" }) => {
      const id = (idRef.current += 1);
      // Cap the stack: past three, older notices are pushed out rather than
      // accumulating down the screen.
      setItems((list) => [...list.slice(-2), { id, title, detail, tone }]);
      setTimeout(() => dismiss(id), life);
      return id;
    },
    [dismiss, life]
  );

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 sm:bottom-auto sm:left-auto sm:right-6 sm:top-6 sm:translate-x-0">
        {items.map((t) => {
          const tone = TONES[t.tone] || TONES.info;
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={`nir-toast pointer-events-auto relative w-[19rem] overflow-hidden rounded-lg border shadow-lg ${
                t.leaving ? "is-leaving" : ""
              }`}
              style={{ background: C.card, borderColor: C.border, ...body }}
            >
              <div className="flex items-start gap-2.5 px-3.5 py-3">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                  style={{ background: tone.soft }}
                >
                  <Icon size={13} style={{ color: tone.colour }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: C.navy, ...heading }}>
                    {t.title}
                  </p>
                  {t.detail && (
                    <p className="mt-0.5 text-[11px] leading-snug" style={{ color: C.slateSoft }}>
                      {t.detail}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded p-0.5"
                  style={{ color: C.slateFaint }}
                >
                  <X size={13} />
                </button>
              </div>
              {/* Drains for exactly the toast's lifetime, so the countdown is
                  visible rather than the notice vanishing without warning. */}
              <div
                className="nir-toast-life h-0.5"
                style={{ background: tone.colour, "--toast-life": `${life}ms` }}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
