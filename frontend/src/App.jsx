import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider, RequireAuth } from "./components/Auth";
import { DataModeProvider } from "./components/DataMode";
import Copilot from "./pages/Copilot";
import Cost from "./pages/Cost";
import Dashboard from "./pages/Dashboard";
import DataLineage from "./pages/DataLineage";
import Demand from "./pages/Demand";
import Dpr from "./pages/Dpr";
import Explorer from "./pages/Explorer";
import Iot from "./pages/Iot";
import Knowledge from "./pages/Knowledge";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import MapPage from "./pages/MapPage";
import Priority from "./pages/Priority";
import Recommendation from "./pages/Recommendation";
import Reports from "./pages/Reports";
import Risk from "./pages/Risk";
import Schemes from "./pages/Schemes";
import Settings from "./pages/Settings";
import WhatIf from "./pages/WhatIf";

export default function App() {
  return (
    <DataModeProvider>
      <AuthProvider>
      <Router>
        <Routes>
          {/* The landing page sits outside the app shell: no sidebar. */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="map" element={<MapPage />} />
            <Route path="explorer" element={<Explorer />} />
            <Route path="recommendation" element={<Recommendation />} />
            <Route path="priority" element={<Priority />} />
            <Route path="risk" element={<Risk />} />
            <Route path="demand" element={<Demand />} />
            <Route path="what-if" element={<WhatIf />} />
            <Route path="cost" element={<Cost />} />
            <Route path="schemes" element={<Schemes />} />
            <Route path="dpr" element={<Dpr />} />
            <Route path="copilot" element={<Copilot />} />
            <Route path="iot" element={<Iot />} />
            <Route path="knowledge" element={<RequireAuth adminOnly><Knowledge /></RequireAuth>} />
            <Route path="data" element={<RequireAuth adminOnly><DataLineage /></RequireAuth>} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<RequireAuth adminOnly><Settings /></RequireAuth>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      </AuthProvider>
    </DataModeProvider>
  );
}
