import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Demo Data / Verified Data mode (build plan, Prompt 7).
 *
 * Everything the platform currently loads is demonstration data. Switching to
 * "Verified" does not silently swap in real figures — no verified source is
 * connected yet. It filters the interface down to what would survive that
 * connection, and states plainly what is missing, so nobody can mistake a
 * demonstration value for an official Chennai measurement.
 */

const DataModeContext = createContext(null);

export const MODES = {
  demo: {
    key: "demo",
    label: "Demo data",
    short: "Demo",
    description:
      "Showing seeded demonstration datasets. Values are illustrative and must be validated before real-world use.",
  },
  verified: {
    key: "verified",
    label: "Verified only",
    short: "Verified",
    description:
      "Showing only values from a verified or source-backed dataset. Demonstration values are hidden rather than substituted.",
  },
};

const STORAGE_KEY = "nirman.dataMode";

export function DataModeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "verified" ? "verified" : "demo";
    } catch {
      return "demo";
    }
  });

  const update = useCallback((next) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* a blocked storage API must not break the toggle */
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode: update,
      isVerifiedOnly: mode === "verified",
      config: MODES[mode],
      /** True when a record should be visible in the current mode. */
      accepts: (record) => {
        if (mode !== "verified") return true;
        if (!record) return false;
        if (record.is_demo_data === true) return false;
        return ["verified", "source", "pending_verification"].includes(
          record.verification_status ?? "verified"
        );
      },
    }),
    [mode, update]
  );

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode() {
  const ctx = useContext(DataModeContext);
  if (!ctx) throw new Error("useDataMode must be used inside a DataModeProvider");
  return ctx;
}

/** Segmented control for the header. */
export function DataModeToggle() {
  const { mode, setMode } = useDataMode();
  return (
    <div
      role="group"
      aria-label="Data mode"
      className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px]"
    >
      {Object.values(MODES).map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => setMode(m.key)}
          aria-pressed={mode === m.key}
          title={m.description}
          className={`rounded px-2 py-1 font-medium transition ${
            mode === m.key ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {m.short}
        </button>
      ))}
    </div>
  );
}

/**
 * Banner shown on pages whose content is entirely demonstration data while
 * the user has asked for verified data only.
 */
export function VerifiedOnlyNotice({ dataset = "This dataset" }) {
  const { isVerifiedOnly } = useDataMode();
  if (!isVerifiedOnly) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
      <b>Verified-only mode.</b> {dataset} is demonstration data — requires validation before
      real-world use — so its values are hidden here rather than substituted with an estimate.
      Connect an authoritative provider (GCC, CMDA, OpenStreetMap, ISRO Bhuvan, IMD or Census) on the
      Data &amp; lineage page to populate this view with source-backed figures.
    </div>
  );
}
