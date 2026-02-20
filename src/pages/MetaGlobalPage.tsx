import MetaGlobalPage from "./pages/MetaGlobalPage";

// ...

<nav className="flex gap-2">
  <NavItem to="/meta-global">Meta Global</NavItem>
  <NavItem to="/">Visão geral</NavItem>
  <NavItem to="/leads">Leads</NavItem>
  <NavItem to="/sales">Vendas</NavItem>
  <NavItem to="/finance">Financeiro</NavItem>
  <NavItem to="/ops">Operação</NavItem>
</nav>

// ...

<Routes>
  <Route path="/meta-global" element={<MetaGlobalPage />} />
  <Route path="/" element={<OverviewPage />} />
  <Route path="/leads" element={<LeadsPage />} />
  <Route path="/sales" element={<SalesPage />} />
  <Route path="/finance" element={<FinancePage />} />
  <Route path="/ops" element={<OpsPage />} />
</Routes>
