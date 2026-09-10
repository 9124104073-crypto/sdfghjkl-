import { ArrowLeft, ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { describeError } from "../api/client";
import { useAuth } from "../components/Auth";
import { C, heading } from "../theme";

const ROLES = [
  { key: "client", title: "Client demo", detail: "Explore sites, compare options and ask the planning Copilot.", icon: Building2 },
  { key: "admin", title: "Administrator demo", detail: "Includes data sources, knowledge records and operational tools.", icon: ShieldCheck },
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [mode, setMode] = useState("sign-in");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const destination = location.state?.from?.pathname || "/dashboard";

  function enter(role) {
    signIn({ name: role === "admin" ? "Administrator" : "Demo client", email: "demo@nirman.ai", role });
    navigate(destination, { replace: true });
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = mode === "register" ? await api.register(form) : await api.login(form);
      signIn(response.user);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page" style={{ background: C.bg }}>
      <section className="auth-shell">
        <Link to="/" className="auth-back" style={{ color: C.teal }}><ArrowLeft size={14} /> Back to welcome</Link>
        <div className="auth-card" style={{ background: C.card, borderColor: C.border }}>
          <div className="auth-aside" style={{ background: C.navy }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-md" style={{ background: C.lime }}><span className="text-lg font-extrabold" style={{ color: C.navy, ...heading }}>N</span></div>
            <p className="auth-kicker" style={{ color: C.lime }}>NIRMAN AI</p>
            <h1 className="auth-title text-white" style={heading}>A clearer path from data to decisions.</h1>
            <p className="auth-copy" style={{ color: "rgba(255,255,255,.65)" }}>Use your account to return to planning work, or enter a demo workspace in one step.</p>
            <div className="auth-demo-list">
              {ROLES.map(({ key, title, detail, icon: Icon }) => (
                <button key={key} type="button" onClick={() => enter(key)} className="w-full rounded-md border p-3 text-left transition hover:border-white/60" style={{ borderColor: "rgba(255,255,255,.14)", color: "#fff" }}>
                  <span className="flex items-center gap-2 text-xs font-semibold"><Icon size={15} style={{ color: C.lime }} /> {title}</span>
                  <span className="mt-1 block pl-6 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,.55)" }}>{detail}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="auth-form-area">
            <div className="auth-tabs" style={{ borderColor: C.border }}>
              {[['sign-in', 'Sign in'], ['register', 'Create account']].map(([key, label]) => (
                <button key={key} type="button" onClick={() => { setMode(key); setError(""); }} className="border-b-2 pb-3 text-sm font-semibold" style={{ borderColor: mode === key ? C.teal : "transparent", color: mode === key ? C.navy : C.slateSoft }}>{label}</button>
              ))}
            </div>
            <h2 className="auth-form-title" style={{ color: C.navy, ...heading }}>{mode === "register" ? "Create your client account" : "Welcome back"}</h2>
            <p className="auth-form-copy" style={{ color: C.slateSoft }}>{mode === "register" ? "Your account opens the client planning workspace." : "Sign in with the email you registered."}</p>
            <form className="auth-form" onSubmit={submit}>
              {mode === "register" && <Field label="Name" value={form.name} onChange={(name) => setForm((old) => ({ ...old, name }))} placeholder="Your name" />}
              <Field label="Email address" type="email" value={form.email} onChange={(email) => setForm((old) => ({ ...old, email }))} placeholder="you@example.com" />
              <Field label="Password" type="password" value={form.password} onChange={(password) => setForm((old) => ({ ...old, password }))} placeholder="At least 8 characters" />
              {error && <p className="rounded-md px-3 py-2 text-xs" style={{ color: C.red, background: C.redSoft }}>{error}</p>}
              <button type="submit" disabled={busy} className="btn-press flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50" style={{ background: C.teal, color: "#fff" }}>{busy ? "Please wait" : mode === "register" ? "Create account" : "Sign in"} <ArrowRight size={15} /></button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return <label className="block text-xs font-semibold" style={{ color: C.slate }}><span>{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" style={{ borderColor: C.border, color: C.navy }} /></label>;
}
