import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Gauge,
  MapPinned,
  MessageSquareText,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { C, body, heading } from "../theme";
import { Panel } from "../components/widgets";
import { AnimatedNumber } from "../components/motion";
import { useApi } from "../components/ui";

const STAGES = [
  { name: "Data", detail: "Twelve registered datasets with full provenance" },
  { name: "Analyse", detail: "Nine-factor MCDA over 40 candidate localities" },
  { name: "Simulate", detail: "Re-weight priorities and watch the ranking move" },
  { name: "Decide", detail: "Costed, risk-rated, scheme-matched, DPR-ready" },
];

const MODULES = [
  { name: "GIS AI", icon: MapPinned, desc: "Catchments, coverage gaps and nearest-neighbour analysis in a projected CRS." },
  { name: "Risk AI", icon: ShieldAlert, desc: "Flood, terrain, accessibility and construction-delay classification." },
  { name: "Demand AI", icon: TrendingUp, desc: "Population growth to 2045, read against flood exposure." },
  { name: "Cost AI", icon: Wallet, desc: "Planning-level estimates with explicit ranges and phase programmes." },
  { name: "Explainable AI", icon: Gauge, desc: "Exact weighted attribution, or SHAP over the model surrogate." },
  { name: "NIRMAN Copilot", icon: MessageSquareText, desc: "Answers built strictly from engine output, with sources attached." },
];

const WHY = [
  "Every number carries its source and verification status",
  "Deterministic scoring — no model in the decision path",
  "Weights are yours to set; the backend re-ranks live",
  "Risk and cost stated as planning-level, never as approval",
  "Refuses to answer rather than inventing a figure",
  "Demonstration data is labelled as such, everywhere",
];

/**
 * Landing page.
 *
 * Opens on the live portfolio numbers rather than stock copy — the figures
 * come from the running API, so the first thing a visitor sees is the system
 * actually working.
 */
export default function Landing() {
  const navigate = useNavigate();
  const { data } = useApi(() => api.dashboard(), []);
  const m = data?.metrics;

  return (
    <div style={{ background: C.bg, ...body }} className="min-h-screen w-full">
      {/* Hero */}
      <section className="landing-hero relative overflow-hidden" style={{ background: C.navy }}>
        <div className="landing-grid" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-6 lg:px-10">
          <nav className="mb-20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white" style={heading}><span className="flex h-7 w-7 items-center justify-center rounded-sm" style={{ background: C.lime, color: C.navy }}>N</span> NIRMAN AI</div>
            <button type="button" onClick={() => navigate("/login")} className="text-xs font-semibold text-white/75 transition hover:text-white">Sign in</button>
          </nav>
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}
          >
            <CircleDot size={12} style={{ color: C.lime }} /> Infrastructure decision intelligence · Chennai
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.06] text-white sm:text-6xl" style={heading}>
            Make the next infrastructure decision easier to trust.
          </h1>
          <p className="mt-6 max-w-xl text-lg" style={{ color: "rgba(255,255,255,0.65)" }}>
            Move from a place on the map to a defensible plan: see the context, compare options, understand the trade-offs, and act with confidence.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="btn-press nir-interactive flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold"
              style={{ background: C.lime, color: C.navy }}
            >
              Start planning <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/recommendation")}
              className="nir-interactive rounded-md border px-5 py-3 text-sm font-medium"
              style={{ borderColor: "rgba(255,255,255,0.25)", color: "#fff" }}
            >
              See a site scored
            </button>
          </div>

          {m && (
            <div className="mt-14 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-5 border-t pt-6 sm:grid-cols-4" style={{ borderColor: "rgba(255,255,255,.16)" }}>
              {[
                ["Sites assessed", m.sites_assessed, null],
                ["Projects", m.projects, null],
                ["Indicative outlay", m.total_budget_cr, "₹ crore"],
                ["High-risk localities", m.high_risk_areas, null],
              ].map(([label, value, unit], i) => (
                <div key={label} className="nir-reveal" style={{ animationDelay: `${420 + i * 70}ms` }}>
                  <div className="text-3xl font-semibold text-white" style={heading}>
                    <AnimatedNumber value={value} />
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {label}
                    {unit ? ` · ${unit}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pipeline */}
      <section className="mx-auto max-w-6xl px-6 py-20 lg:px-10">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl" style={{ color: C.navy, ...heading }}>
            From data to decisions
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm" style={{ color: C.slateSoft }}>
            Four stages, each one auditable — you can see what fed it and what it produced.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {STAGES.map((s, i) => (
            <Panel key={s.name} className="p-5 text-center" index={i} interactive>
              <div
                className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold"
                style={{ background: C.tealSoft, color: C.teal, ...heading }}
              >
                {i + 1}
              </div>
              <div className="text-sm font-semibold" style={{ color: C.navy, ...heading }}>
                {s.name}
              </div>
              <div className="mt-1.5 text-[11px] leading-snug" style={{ color: C.slateSoft }}>
                {s.detail}
              </div>
            </Panel>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="py-20" style={{ background: C.card, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto max-w-6xl px-6 lg:px-10">
          <h2 className="mb-10 text-2xl font-semibold sm:text-3xl" style={{ color: C.navy, ...heading }}>
            Intelligence modules
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((mod, i) => (
              <Panel key={mod.name} className="p-5" index={i} interactive>
                <mod.icon size={20} strokeWidth={1.75} style={{ color: C.teal }} />
                <div className="mt-3 text-sm font-semibold" style={{ color: C.navy, ...heading }}>
                  {mod.name}
                </div>
                <div className="mt-1 text-sm leading-snug" style={{ color: C.slateSoft }}>
                  {mod.desc}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-6 py-20 lg:px-10">
        <h2 className="mb-10 text-2xl font-semibold sm:text-3xl" style={{ color: C.navy, ...heading }}>
          What makes it trustworthy
        </h2>
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {WHY.map((w, i) => (
            <div key={w} className="nir-reveal flex items-start gap-3" style={{ animationDelay: `${i * 50}ms` }}>
              <CheckCircle2 size={17} style={{ color: C.teal, flex: "none", marginTop: 1 }} />
              <span className="text-sm" style={{ color: C.slate }}>{w}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center" style={{ background: C.navy }}>
        <h2 className="mx-auto max-w-xl text-2xl font-semibold text-white sm:text-3xl" style={heading}>
          Build smarter. Build safer. Build for the future.
        </h2>
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="btn-press nir-interactive mt-8 rounded-md px-6 py-3 text-sm font-semibold"
          style={{ background: C.lime, color: C.navy }}
        >
          Enter dashboard
        </button>
        <p className="mx-auto mt-10 max-w-2xl px-6 text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
          NIRMAN AI is a decision-support prototype. Demonstration datasets and AI-generated estimates
          require validation against authoritative data, engineering assessment and statutory approvals
          before real-world use.
        </p>
      </section>
    </div>
  );
}
