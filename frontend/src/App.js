import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SiteDetails from "./pages/SiteDetails";
import CatalogManager from "./pages/CatalogManager";
import SiteImporter from "./pages/SiteImporter";
import ProjectsManager from "./pages/ProjectsManager";
import ProjectStatusForm from "./pages/ProjectStatusForm";
import Header from "./components/Header";
import ChargersManager from "./pages/ChargersManager";
import VehiclesManager from "./pages/VehiclesManager";
import VehicleDetails from './pages/VehicleDetails';
import SitesManager from './pages/SitesManager';

function App() {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/site/:id" element={<SiteDetails />} />
        <Route path="/catalog" element={<CatalogManager />} />
        <Route path="/sites/import" element={<SiteImporter />} />
        <Route path="/projects" element={<ProjectsManager />} />
        <Route path="/projects/:projectId/status/:siteId" element={<ProjectStatusForm />} />
        <Route path="/projects/status" element={<ProjectStatusForm />} />
        <Route path="/chargers" element={<ChargersManager />} />
        <Route path="/vehicles" element={<VehiclesManager />} />
        <Route path="/vehicle/:id" element={<VehicleDetails />} />
        <Route path="/sites/manage" element={<SitesManager />} />
      </Routes>
    </Router>
  );
}

export default App;
