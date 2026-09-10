import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Compass,
  Cpu,
  Database,
  House,
  LogOut,
  FileStack,
  FolderClock,
  GitCompare,
  Gauge,
  LayoutGrid,
  MapPinned,
  Menu,
  MessageSquareText,
  Radio,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "./Auth";
import api from "../api/client";
import { C, body, heading } from "../theme";
import { PageTransition } from "./motion";
import { StatusPill } from "./widgets";
import { useApi } from "./ui";
import { FloatingActions, ToastProvider, useToast } from "./uikit";

const NAV_GROUPS = [
  {
    group: "Overview",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutGrid },
      { to: "/map", label: "GIS Workspace", icon: MapPinned },
      { to: "/explorer", label: "Explorer", icon: Compass },
    ],
  },
  {
    group: "Siting",
    items: [
      { to: "/recommendation", label: "Site Analysis", icon: GitCompare },
      { to: "/priority", label: "Priority", icon: Gauge },
      { to: "/what-if", label: "What-If", icon: Sliders },
    ],
  },
  {
    group: "Delivery",
    items: [
      { to: "/risk", label: "Risk", icon: ShieldAlert },
      { to: "/demand", label: "Demand", icon: TrendingUp },
      { to: "/cost", label: "Cost", icon: Wallet },
      { to: "/schemes", label: "Schemes", icon: FileStack },
      { to: "/dpr", label: "AI DPR", icon: FileStack },
    ],
  },
  {
    group: "Operations",
    items: [
      { to: "/copilot", label: "Copilot", icon: MessageSquareText },
      { to: "/iot", label: "IoT Monitoring", icon: Radio },
      { to: "/knowledge", label: "Knowledge", icon: Search },
      { to: "/data", label: "Data Sources", icon: Database },
      { to: "/reports", label: "Reports", icon: FolderClock },
    ],
  },
];

const TITLES = {
  "/dashboard": "Infrastructure Intelligence",
  "/map": "GIS Workspace",
  "/explorer": "Infrastructure Explorer",
  "/recommendation": "Site Analysis",
  "/priority": "Priority Ranking",
  "/what-if": "What-If Simulator",
  "/risk": "Risk Intelligence",
  "/demand": "Demand Intelligence",
  "/cost": "Cost Analysis",
  "/schemes": "Government Schemes",
  "/dpr": "AI DPR Generator",
  "/copilot": "NIRMAN Copilot",
  "/iot": "IoT Monitoring",
  "/knowledge": "Knowledge Base",
  "/data": "Data Intelligence Hub",
  "/reports": "Planning Reports",
  "/settings": "Settings",
};

function Sidebar({ open, setOpen }) {
  const navigate = useNavigate();
  const { role, isAdmin, signOut } = useAuth();
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => isAdmin || !["/iot", "/reports", "/knowledge", "/data"].includes(item.to)
    ),
  })).filter((group) => group.items.length > 0);

  function leaveWorkspace() {
    signOut();
    navigate("/", { replace: true });
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(11,31,51,0.5)" }}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col justify-between overflow-y-auto transition-transform duration-200 lg:sticky lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: C.navy }}
      >
        <div>
          <div className="flex items-center justify-between px-5 py-5">
            <NavLink to="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-sm" style={{ background: C.lime }}>
                <span style={{ ...heading, fontWeight: 800, fontSize: 13, color: C.navy }}>N</span>
              </div>
              <span className="text-sm font-semibold tracking-tight text-white" style={heading}>
                NIRMAN AI
              </span>
            </NavLink>
            <button type="button" className="text-white/70 lg:hidden" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <nav className="mt-1 flex flex-col gap-4 px-3 pb-4">
            {groups.map((g) => (
              <div key={g.group} className="flex flex-col gap-0.5">
                <div
                  className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em]"
                  style={{ color: "rgba(255,255,255,0.32)" }}
                >
                  {g.group}
                </div>
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="nir-row flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors"
                    style={({ isActive }) => ({
                      background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.62)",
                      borderLeft: `2px solid ${isActive ? C.lime : "transparent"}`,
                      ...body,
                    })}
                  >
                    <item.icon size={16} strokeWidth={1.75} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-0.5 px-3 pb-5">
          <NavLink to="/" onClick={() => setOpen(false)} className="nir-row flex items-center gap-3 rounded-md px-3 py-2.5 text-sm" style={{ color: "rgba(255,255,255,0.62)", ...body }}>
            <House size={16} strokeWidth={1.75} /> Back to welcome
          </NavLink>
          {isAdmin && (
          <NavLink
            to="/settings"
            onClick={() => setOpen(false)}
            className="nir-row flex items-center gap-3 rounded-md px-3 py-2.5 text-sm"
            style={({ isActive }) => ({
              color: isActive ? "#fff" : "rgba(255,255,255,0.62)",
              background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
              ...body,
            })}
          >
            <SettingsIcon size={16} strokeWidth={1.75} /> Settings
          </NavLink>
          )}
          <div className="mt-1 flex items-center gap-2.5 rounded-md px-3 py-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: C.teal, color: "#fff", ...heading }}
            >
              {role === "admin" ? "A" : "C"}
            </div>
            <div className="leading-tight">
              <div className="text-xs font-medium text-white" style={body}>{isAdmin ? "Administrator" : "Client workspace"}</div>
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>Demo access</div>
            </div>
          </div>
          <button type="button" onClick={leaveWorkspace} className="nir-row mt-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm" style={{ color: "rgba(255,255,255,0.62)", ...body }}>
            <LogOut size={16} strokeWidth={1.75} /> Log out
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ title, setOpen, health }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const degraded = health && health.status !== "ok";

  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 py-3.5 lg:px-8"
      style={{ background: "rgba(246,248,245,0.82)", backdropFilter: "saturate(1.6) blur(16px)", borderBottom: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-3">
        <button type="button" className="lg:hidden" onClick={() => setOpen(true)} style={{ color: C.navy }}>
          <Menu size={20} />
        </button>
        <span className="hidden text-sm font-semibold sm:block" style={{ color: C.navy, ...heading }}>
          {title}
        </span>
      </div>

      <form
        className="mx-4 hidden flex-1 items-center md:flex"
        style={{ maxWidth: focused ? "34rem" : "24rem", transition: "max-width 320ms var(--ease-out)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/copilot?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <div
          className="nir-search flex w-full items-center gap-2 rounded-md px-3 py-2"
          style={{ background: C.card, border: `1px solid ${focused ? C.teal : C.border}` }}
        >
          <Search size={14} style={{ color: focused ? C.teal : C.slateFaint, transition: "color 200ms" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask NIRMAN anything…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: C.slate, ...body }}
          />
          {q.trim() && (
            <span className="nir-msg rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: C.tealSoft, color: C.teal }}>
              Enter
            </span>
          )}
        </div>
      </form>

      <div className="flex items-center gap-3">
        <StatusPill tone={degraded ? "red" : "green"}>
          {degraded ? "Backend degraded" : "AI systems online"}
        </StatusPill>
        <Bell size={17} style={{ color: C.slateSoft }} />
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: C.navy, color: "#fff", ...heading }}
        >
          {role === "admin" ? "A" : "C"}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { data: health } = useApi(() => api.health(), []);

  // Close the drawer on navigation so a route change never leaves it hanging.
  useEffect(() => setOpen(false), [location.pathname]);

  const title = TITLES[location.pathname] || "NIRMAN AI";

  return (
    <ToastProvider>
    <div className="flex min-h-screen" style={{ background: C.bg, ...body }}>
      <Sidebar open={open} setOpen={setOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} setOpen={setOpen} health={health} />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-5 lg:px-8">
          <PageTransition routeKey={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>
        <footer className="px-4 pb-8 lg:px-8">
          <p className="rounded-md px-4 py-3 text-[11px] leading-relaxed" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.slateSoft }}>
            NIRMAN AI is a decision-support prototype. Demonstration datasets and AI-generated
            estimates require validation against authoritative data, engineering assessment and
            statutory approvals before real-world use.
          </p>
        </footer>
      </div>

      <QuickActions />
    </div>
    </ToastProvider>
  );
}

/**
 * Quick actions.
 *
 * Lives inside the provider so it can raise a toast, and reaches the
 * destinations a planner jumps to most often without going via the sidebar.
 */
function QuickActions() {
  const navigate = useNavigate();
  const notify = useToast();

  return (
    <FloatingActions
      actions={[
        {
          label: "Ask the Copilot",
          icon: MessageSquareText,
          onSelect: () => navigate("/copilot"),
        },
        {
          label: "Re-weight and re-rank",
          icon: Sliders,
          onSelect: () => navigate("/what-if"),
        },
        {
          label: "Generate a DPR",
          icon: FileStack,
          onSelect: () => navigate("/dpr"),
        },
        {
          label: "Check engine status",
          icon: Cpu,
          onSelect: async () => {
            try {
              const health = await api.health();
              const ok = health?.status === "ok" || health?.status === "healthy";
              notify({
                tone: ok ? "success" : "warn",
                title: ok ? "All engines responding" : "Backend degraded",
                detail: `Reported status: ${health?.status ?? "unknown"}.`,
              });
            } catch {
              notify({
                tone: "error",
                title: "Could not reach the backend",
                detail: "The API did not respond. Engine output on screen may be stale.",
              });
            }
          },
        },
      ]}
    />
  );
}
