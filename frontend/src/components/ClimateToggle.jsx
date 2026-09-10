import { AlertTriangle, CloudRain } from "lucide-react";

export default function ClimateToggle({ active, onChange }) {
  return (
    <section
      className={`rounded-md border px-4 py-3 transition-colors ${
        active ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
      aria-label="Climate scenario controls"
    >
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-md ${active ? "bg-amber-200 text-amber-900" : "bg-sky-50 text-sky-700"}`}>
            <CloudRain size={18} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Show Climate Impact (2050)</span>
            <span className="block text-xs text-slate-500">Model projected flood exposure in the current site comparison.</span>
          </span>
        </span>
        <input
          checked={active}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
          type="checkbox"
        />
      </label>
      {active && (
        <div className="mt-3 flex items-center gap-2 border-t border-amber-200 pt-3 text-xs font-semibold text-amber-900">
          <AlertTriangle size={15} /> Future Flood Risk Active - flood safety is reduced by 30% inside the projected zone.
        </div>
      )}
    </section>
  );
}
