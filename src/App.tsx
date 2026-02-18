import React from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { Container } from "./components/ui";
import OverviewPage from "./pages/OverviewPage";
import LeadsPage from "./pages/LeadsPage";
import SalesPage from "./pages/SalesPage";
import FinancePage from "./pages/FinancePage";
import OpsPage from "./pages/OpsPage";

function Nav() {
  const linkBase = "rounded-full px-4 py-2 text-sm font-medium transition";
  const inactive = "text-slate-300 hover:bg-slate-900/60";
  const active = "bg-white text-slate-950";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NavLink to="/" end className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Visão geral</NavLink>
      <NavLink to="/leads" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Leads</NavLink>
      <NavLink to="/vendas" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Vendas</NavLink>
      <NavLink to="/financeiro" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Financeiro</NavLink>
      <NavLink to="/operacao" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Operação</NavLink>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Container>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">Black Sheep — Dashboard</div>
            <div className="text-sm text-slate-400">Central para não se perder entre ferramentas</div>
          </div>
          <Nav />
        </div>

        <div className="mt-6">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/vendas" element={<SalesPage />} />
            <Route path="/financeiro" element={<FinancePage />} />
            <Route path="/operacao" element={<OpsPage />} />
          </Routes>
        </div>
      </Container>
    </BrowserRouter>
  );
}
