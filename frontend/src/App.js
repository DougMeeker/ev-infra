import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SiteDetails from "./pages/SiteDetails";
import CatalogManager from "./pages/CatalogManager";
import Header from "./components/Header";

function App() {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/site/:id" element={<SiteDetails />} />
        <Route path="/catalog" element={<CatalogManager />} />
      </Routes>
    </Router>
  );
}

export default App;
