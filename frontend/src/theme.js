/**
 * Design tokens.
 *
 * A deep navy shell with a teal working colour and a lime accent used only
 * where something must be acted on. Semantic colours (good / warn / bad) are
 * kept separate from the accent so severity never competes with branding.
 */
export const C = {
  navy: "#0B1F33",
  navy2: "#122B45",
  navy3: "#1B3A57",
  teal: "#0F766E",
  tealSoft: "#E6F2F0",
  lime: "#A3E635",
  bg: "#F6F8F5",
  card: "#FFFFFF",
  slate: "#334155",
  slateSoft: "#64748B",
  slateFaint: "#94A3B8",
  border: "#E3E8E3",
  red: "#DC2626",
  redSoft: "#FDECEC",
  amber: "#F59E0B",
  amberSoft: "#FEF6E7",
  green: "#16A34A",
  greenSoft: "#EAF7EE",
};

export const heading = { fontFamily: "'Manrope', ui-sans-serif, system-ui, sans-serif" };
export const body = { fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" };

/** Suitability tier -> colour, shared by rings, chips and map markers. */
export function toneForScore(score) {
  if (score >= 83) return C.green;
  if (score >= 75) return C.teal;
  if (score >= 70) return C.amber;
  return C.red;
}

/** Risk level -> colour. */
export const RISK_TONE = {
  "Very Low": C.green,
  Low: C.green,
  Moderate: C.amber,
  Medium: C.amber,
  High: "#F97316",
  "Very High": C.red,
};
