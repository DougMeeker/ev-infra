import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SiteDetails from "./pages/SiteDetails";
import CatalogManager from "./pages/CatalogManager";
import SiteImporter from "./pages/SiteImporter";
import ProjectsManager from "./pages/ProjectsManager";
// Consolidate status into ProjectsManager; keep legacy /status routes via redirect
import { useEffect } from "react";
import Header from "./components/Header";
import Chargers from "./pages/Chargers";
import VehiclesManager from "./pages/VehiclesManager";
import VehicleDetails from './pages/VehicleDetails';
import SitesManager from './pages/SitesManager';
import FilesPage from './pages/Files';
import DepartmentsManager from './pages/DepartmentsManager';
import PriorityDashboard from './pages/PriorityDashboard';
import Settings from './pages/Settings';
import { RequireAuth } from './AuthProvider';

function App() {
  return (
    <Router>
      <RequireAuth>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/site/:id" element={<SiteDetails />} />
        <Route path="/catalog" element={<CatalogManager />} />
        <Route path="/sites/import" element={<SiteImporter />} />
        {/* Project Manager routes */}
        <Route path="/project" element={<ProjectsManager />} />
        <Route path="/project/:projectId" element={<ProjectsManager />} />
        {/* Legacy status routes redirect to ProjectsManager with optional siteId */}
        <Route path="/status" element={<StatusRedirect />} />
        <Route path="/status/:projectId" element={<StatusRedirect />} />
        <Route path="/status/:projectId/:siteId" element={<StatusRedirect />} />
        <Route path="/chargers" element={<Chargers />} />
        <Route path="/vehicles" element={<VehiclesManager />} />
        <Route path="/vehicle/:id" element={<VehicleDetails />} />
        <Route path="/sites/manage" element={<SitesManager />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/departments" element={<DepartmentsManager />} />
        <Route path="/priorities" element={<PriorityDashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      </RequireAuth>
    </Router>
  );
}

export default App;

// Local component to handle legacy status route redirects
function StatusRedirect() {
  const navigate = require("react-router-dom").useNavigate();
  const params = require("react-router-dom").useParams();
  useEffect(() => {
    const projectId = params.projectId;
    const siteId = params.siteId;
    if (projectId) {
      const target = siteId
        ? `/project/${projectId}?siteId=${encodeURIComponent(siteId)}`
        : `/project/${projectId}`;
      navigate(target, { replace: true });
    } else {
      navigate(`/project`, { replace: true });
    }
  }, [navigate, params.projectId, params.siteId]);
  return null;
}
