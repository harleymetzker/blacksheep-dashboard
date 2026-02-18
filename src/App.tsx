import { NavLink, Route, Routes } from "react-router-dom";
import OverviewPage from "./pages/OverviewPage";
import LeadsPage from "./pages/LeadsPage";
import SalesPage from "./pages/SalesPage";
import FinancePage from "./pages/FinancePage";
import OpsPage from "./pages/OpsPage";
import { useTheme } from "./context/ThemeContext";

function NavItem({ to, children }: any) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-4 py-2 rounded-xl text-sm transition ${
          isActive
            ? "bg-white/90 text-slate-900 dark:bg-slate-800/80 dark:text-slate-100"
            : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-800/50"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b border-slate-200/70 dark:border-slate-800/70">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Black Sheep — Dashboard</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Central para não se perder entre ferramentas
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex gap-2">
              <NavItem to="/">Visão geral</NavItem>
              <NavItem to="/leads">Leads</NavItem>
              <NavItem to="/sales">Vendas</NavItem>
              <NavItem to="/finance">Financeiro</NavItem>
              <NavItem to="/ops">Operação</NavItem>
            </nav>

            <button
              onClick={toggleTheme}
              className="rounded-xl border border-slate-300 bg-white/80 px-3 py-1 text-sm transition hover:bg-white
                         dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-900/70"
            >
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/ops" element={<OpsPage />} />
        </Routes>
      </main>
    </div>
  );
}
