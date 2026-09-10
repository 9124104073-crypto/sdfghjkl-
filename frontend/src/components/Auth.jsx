import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

const AuthContext = createContext(null);
const STORAGE_KEY = "nirman-account";

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (account) localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    else localStorage.removeItem(STORAGE_KEY);
  }, [account]);

  const value = useMemo(
    () => ({
      account,
      role: account?.role || null,
      isAdmin: account?.role === "admin",
      signIn: (nextAccount) => setAccount(nextAccount),
      signOut: () => setAccount(null),
    }),
    [account]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within AuthProvider");
  return auth;
}

export function RequireAuth({ children, adminOnly = false }) {
  const { account, isAdmin } = useAuth();
  const location = useLocation();
  if (!account) return <Navigate to="/login" replace state={{ from: location }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}
