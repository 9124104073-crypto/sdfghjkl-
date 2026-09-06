import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Copilot from "./pages/Copilot";
import Cost from "./pages/Cost";
import Dashboard from "./pages/Dashboard";
import DataLineage from "./pages/DataLineage";
import Dpr from "./pages/Dpr";
import Iot from "./pages/Iot";
import MapPage from "./pages/MapPage";
import Priority from "./pages/Priority";
import Recommendation from "./pages/Recommendation";
import Risk from "./pages/Risk";
import Schemes from "./pages/Schemes";
import WhatIf from "./pages/WhatIf";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="map" element={<MapPage />} />
          <Route path="recommendation" element={<Recommendation />} />
          <Route path="priority" element={<Priority />} />
          <Route path="risk" element={<Risk />} />
          <Route path="what-if" element={<WhatIf />} />
          <Route path="cost" element={<Cost />} />
          <Route path="schemes" element={<Schemes />} />
          <Route path="dpr" element={<Dpr />} />
          <Route path="copilot" element={<Copilot />} />
          <Route path="iot" element={<Iot />} />
          <Route path="data" element={<DataLineage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
