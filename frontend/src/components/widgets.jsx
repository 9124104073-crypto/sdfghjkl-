import { useEffect, useState } from "react";
import { C, body, heading, toneForScore } from "../theme";
import { AnimatedNumber, usePrefersReducedMotion } from "./motion";

/* ------------------------------------------------------------------ */
/* Status pill                                                         */
/* ------------------------------------------------------------------ */
const PILL_TONES = {
  green: { bg: C.greenSoft, fg: C.green, dot: C.green },
  amber: { bg: C.amberSoft, fg: "#92600A", dot: C.amber },
  red: { bg: C.redSoft, fg: C.red, dot: C.red },
  teal: { bg: C.tealSoft, fg: C.teal, dot: C.teal },
  slate: { bg: "#F1F5F4", fg: C.slateSoft, dot: C.slateFaint },
};

export function StatusPill({ tone = "green", children, dot = true }) {
  const t = PILL_TONES[tone] || PILL_TONES.slate;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
      style={{ background: t.bg, color: t.fg, ...body }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />}
      {children}
    </span>
  );
}

/** Maps NIRMAN's vocabulary onto a pill tone. */
const VALUE_TONE = {
  Recommended: "green",
  "Highly Recommended": "green",
  Approve: "green",
  Consider: "teal",
  "Further Assessment Required": "amber",
  "Conditionally Recommended": "amber",
  "Not Recommended": "red",
  "High Priority": "red",
  Low: "green",
  "Very Low": "green",
  Medium: "amber",
  Moderate: "amber",
  High: "amber",
  "Very High": "red",
  NORMAL: "green",
  WARNING: "amber",
  CRITICAL: "red",
  verified: "green",
  demonstration: "amber",
  pending_verification: "slate",
  unverified: "slate",
};

export function Tag({ value }) {
  if (value === null || value === undefined) return <span style={{ color: C.slateFaint }}>—</span>;
  return (
    <StatusPill tone={VALUE_TONE[value] || "slate"} dot={false}>
      {value}
    </StatusPill>
  );
}

/* ------------------------------------------------------------------ */
/* Score ring                                                          */
/* ------------------------------------------------------------------ */
/**
 * Circular gauge for a 0-100 score.
 *
 * The arc animates from zero on mount so the value reads as measured rather
 * than asserted, and the colour comes from the shared tier scale so a ring,
 * a chip and a map marker never disagree about what "good" looks like.
 */
export function ScoreRing({ score, size = 84, label, tone }) {
  const reduced = usePrefersReducedMotion();
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const colour = tone || toneForScore(score);
  const [pct, setPct] = useState(reduced ? score : 0);

  useEffect(() => {
    if (reduced) {
      setPct(score);
      return undefined;
    }
    const t = setTimeout(() => setPct(score), 60);
    return () => clearTimeout(t);
  }, [score, reduced]);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={C.border} strokeWidth="7" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (Math.max(0, Math.min(100, pct)) / 100) * circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: reduced ? "none" : "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)" }}
        />
        <text
          x="50%"
          y="52%"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ ...heading, fontWeight: 700, fontSize: size * 0.26, fill: C.navy }}
        >
          {Number(score).toFixed(score % 1 === 0 ? 0 : 1)}
        </text>
      </svg>
      {label && (
        <span className="text-[11px]" style={{ color: C.slateFaint, ...body }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */
export function KPICard({ label, value, delta, deltaTone = "green", icon: Icon, index = 0, sub }) {
  const numeric = typeof value === "number" ? value : null;
  return (
    <div
      className="stat-tile nir-interactive nir-spotlight nir-reveal flex flex-col gap-3 rounded-md p-4"
      style={{ background: C.card, border: `1px solid ${C.border}`, animationDelay: `${index * 55}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-tight" style={{ color: C.slateSoft, ...body }}>
          {label}
        </span>
        {Icon && <Icon size={16} strokeWidth={1.75} style={{ color: C.teal }} />}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold" style={{ color: C.navy, ...heading }}>
          {numeric !== null ? <AnimatedNumber value={numeric} /> : value}
        </span>
        {delta && <StatusPill tone={deltaTone}>{delta}</StatusPill>}
      </div>
      {sub && (
        <span className="-mt-1 text-[11px]" style={{ color: C.slateFaint, ...body }}>
          {sub}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bars, cards, headers                                                */
/* ------------------------------------------------------------------ */
export function Bar1D({ value, max = 100, tone }) {
  const colour = tone || toneForScore((value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-sm" style={{ background: C.border }}>
      <div
        className="bar-grow h-full rounded-sm"
        style={{
          width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`,
          background: colour,
          transition: "width 700ms cubic-bezier(.22,1,.36,1)",
        }}
      />
    </div>
  );
}

export function Panel({ children, className = "", style = {}, index = 0, interactive = false }) {
  return (
    <div
      className={`nir-reveal nir-spotlight rounded-md ${interactive ? "nir-interactive" : ""} ${className}`}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        animationDelay: `${index * 60}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-1 text-xs font-medium" style={{ color: C.teal, ...body }}>
            {eyebrow}
          </div>
        )}
        <h2 className="text-xl font-semibold" style={{ color: C.navy, ...heading }}>
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-sm" style={{ color: C.slateSoft, ...body }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function SliderRow({ label, value, min, max, step = 1, unit, onChange, format, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs" style={{ color: C.slate, ...body }}>
        <span>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: C.navy }}>
          {format ? format(value) : `${value}${unit || ""}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: C.teal, height: 4 }}
      />
      {hint && (
        <span className="text-[11px]" style={{ color: C.slateFaint, ...body }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/** Typing indicator for the Copilot. */
export function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-md px-4 py-2.5" style={{ background: C.tealSoft }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: C.teal, animation: `nir-bounce 1s ${i * 0.15}s infinite` }}
        />
      ))}
    </div>
  );
}
