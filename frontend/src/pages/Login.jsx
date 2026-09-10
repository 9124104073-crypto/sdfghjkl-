import { Building2, ShieldCheck, ArrowRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../components/Auth";
import { C, heading } from "../theme";

const ROLES = [
  {
    key: "client",
    title: "Client demo",
    detail: "Explore sites, compare options and ask the planning Copilot.",
    icon: Building2,
  },
  {
    key: "admin",
    title: "Administrator demo",
    detail: "Includes data sources, knowledge records and operational tools.",
    icon: ShieldCheck,
  },
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const destination = location.state?.from?.pathname || "/dashboard";

  function enter(role) {
    signIn(role);
    navigate(destination, { replace: true });
  }

  return (
    <main className="min-h-screen px-5 py-10 sm:flex sm:items-center sm:justify-center" style={{ background: C.bg }}>
      <section className="w-full max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-md" style={{ background: C.navy }}>
            <span className="text-lg font-extrabold" style={{ color: C.lime, ...heading }}>N</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: C.teal }}>NIRMAN AI</p>
          <h1 className="mt-3 text-3xl font-semibold" style={{ color: C.navy, ...heading }}>Choose a demo workspace</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed" style={{ color: C.slateSoft }}>
            No password is needed for this demonstration. You can switch roles any time from the navigation menu.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.map(({ key, title, detail, icon: Icon }) => (
            <button key={key} type="button" onClick={() => enter(key)} className="group min-h-52 rounded-md border p-6 text-left transition hover:-translate-y-0.5 hover:border-brand-500" style={{ background: C.card, borderColor: C.border }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: C.tealSoft, color: C.teal }}><Icon size={20} /></div>
              <h2 className="mt-8 text-lg font-semibold" style={{ color: C.navy, ...heading }}>{title}</h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: C.slateSoft }}>{detail}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold" style={{ color: C.teal }}>Enter workspace <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
