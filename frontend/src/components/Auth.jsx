import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

const AuthContext = createContext(null);
const STORAGE_KEY = "nirman-demo-role";

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    if (role) localStorage.setItem(STORAGE_KEY, role);
    else localStorage.removeItem(STORAGE_KEY);
  }, [role]);

  const value = useMemo(
    () => ({
      role,
      isAdmin: role === "admin",
      signIn: (nextRole) => setRole(nextRole),
      signOut: () => setRole(null),
    }),
    [role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within AuthProvider");
  return auth;
}

export function RequireAuth({ children, adminOnly = false }) {
  const { role, isAdmin } = useAuth();
  const location = useLocation();
  if (!role) return <Navigate to="/login" replace state={{ from: location }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}
