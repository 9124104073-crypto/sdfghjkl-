import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PageTransition } from "./motion";
import api from "../api/client";
import { DataModeToggle } from "./DataMode";
import { useApi } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/map", label: "Infrastructure Map" },
  { to: "/explorer", label: "Infrastructure Explorer" },
  { to: "/recommendation", label: "Site Recommendation" },
  { to: "/priority", label: "Priority Ranking" },
  { to: "/risk", label: "Risk & Climate" },
  { to: "/demand", label: "Demand Analysis" },
  { to: "/what-if", label: "What-If Simulator" },
  { to: "/cost", label: "Cost & Construction" },
  { to: "/schemes", label: "Government Schemes" },
  { to: "/dpr", label: "AI DPR" },
  { to: "/copilot", label: "NIRMAN Copilot" },
  { to: "/iot", label: "IoT Monitoring" },
  { to: "/knowledge", label: "Knowledge Base" },
  { to: "/data", label: "Data & Lineage" },
];

const DISCLAIMER =
  "NIRMAN AI is a decision-support prototype. Demonstration datasets and AI-generated estimates require validation against authoritative data, engineering assessment and statutory approvals before real-world use.";

export default function Layout() {
  const location = useLocation();
  const { data: health } = useApi(() => api.health(), []);
  const offline = health && health.status !== "ok";

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              N
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">NIRMAN AI</p>
              <p className="text-[11px] leading-tight text-slate-500">
                Public infrastructure decision support &middot; Chennai
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 text-[11px]">
            <DataModeToggle />
            {health?.demo_mode && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                Demo mode
              </span>
            )}
            {health && (
              <span
                className={`rounded-full px-2.5 py-1 font-medium ring-1 ring-inset ${
                  offline
                    ? "bg-rose-50 text-rose-800 ring-rose-200"
                    : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                }`}
              >
                {offline ? "Backend degraded" : `API v${health.version}`}
              </span>
            )}
            {health && (
              <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 sm:inline">
                Copilot: {health.ai_provider}
              </span>
            )}
          </div>
        </div>

        <nav className="mx-auto max-w-[1400px] overflow-x-auto px-5">
          <ul className="flex gap-1 pb-2">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `nir-row block whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "bg-brand-700 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6">
        <PageTransition routeKey={location.pathname}>
          <Outlet />
        </PageTransition>
      </main>

      <footer className="mx-auto max-w-[1400px] px-5 pb-8">
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          {DISCLAIMER}
        </p>
      </footer>
    </div>
  );
}
