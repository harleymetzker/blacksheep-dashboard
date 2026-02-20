import React, { useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv } from "../lib/utils";

// ====== CONFIG FIXA (2026) ======
const GOALS_2026 = {
  revenueAnnual: 2_000_000, // R$ 2 mi
  companiesAnnual: 250, // 250 empresas
  renewalsPct: 60, // 60%
  costPerSale: 800, // R$ 800
};

// util: clamp 0..100
function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function pctFmt(n: number) {
  return `${clampPct(n).toFixed(1)}%`;
}

// Barra simples (sem depender de componente externo)
function ProgressBar({ valuePct }: { valuePct: number }) {
  const v = clampPct(valuePct);
  return (
    <div className="w-full">
      <div className="h-3 w-full rounded-full border border-slate-800 bg-slate-950/30 overflow-hidden">
        <div className="h-3 bg-slate-200/70" style={{ width: `${v}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>Progresso</span>
        <span>{pctFmt(v)}</span>
      </div>
    </div>
  );
}

// helper de desvio vs meta
function deltaPct(real: number, target: number) {
  return safeDiv((real - target) * 100, target);
}

function deltaLabel(real: number, target: number, mode: "higher_better" | "lower_better") {
  const d = deltaPct(real, target);
  const ok = mode === "higher_better" ? real >= target : real <= target;

  // exemplo: +12.3% acima / -8.1% abaixo
  const sign = d >= 0 ? "+" : "";
  const text = `${sign}${d.toFixed(1)}%`;

  return ok ? (
    <Pill>{text}</Pill>
  ) : (
    <Pill>{text}</Pill>
  );
}

export default function MetaGlobalPage() {
  // Seletor de mês (sem ano por enquanto)
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12

  // ====== DEMO: dados reais (mock) ======
  // No próximo passo, a gente troca isso por dados puxados do DB (Sales/Leads/Ops)
  const real = useMemo(() => {
    // MOCKS: coloca qualquer coisa só pra visualizar a página no ar
    const soldValueYTD = 418_500; // faturamento acumulado no ano (demo)
    const companiesYTD = 62; // vendas acumuladas no ano (demo)

    // métricas do mês (somadas Harley+Giovanni) — demo
    const monthSales = 16;
    const monthMeetingsBooked = 74;
    const monthShowRatePct = 61.0; // %
    const monthRenewalsPct = 57.0; // %
    const monthCostPerSaleHarley = 820;
    const monthCostPerSaleGio = 740;

    return {
      soldValueYTD,
      companiesYTD,
      monthSales,
      monthMeetingsBooked,
      monthShowRatePct,
      monthRenewalsPct,
      monthCostPerSaleHarley,
      monthCostPerSaleGio,
    };
  }, [month]);

  // ====== DEFAULT INTELIGENTE: meta mensal baseada na meta anual ======
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  // ====== PROGRESSO ANUAL ======
  const progressRevenuePct = useMemo(() => safeDiv(real.soldValueYTD * 100, GOALS_2026.revenueAnnual), [real.soldValueYTD]);
  const progressCompaniesPct = useMemo(() => safeDiv(real.companiesYTD * 100, GOALS_2026.companiesAnnual), [real.companiesYTD]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Meta Global</div>
          <div className="text-sm text-slate-400">Clareza do time: metas do ano e desempenho do mês.</div>
        </div>

        {/* Seletor simples de mês */}
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-400">Mês</div>
          <select
            className="rounded-2xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-sm text-slate-200"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }).map((_, i) => {
              const m = i + 1;
              return (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Topo: 2 cards lado a lado (igual vibe da página de vendas) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Meta anual — Faturamento"
          subtitle={`Meta 2026: ${brl(GOALS_2026.revenueAnnual)}`}
          right={<Pill>YTD</Pill>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Stat label="Real (acumulado)" value={brl(real.soldValueYTD)} hint={`Meta do mês: ${brl(monthGoalRevenue)}`} />
            <Stat label="Progresso anual" value={pctFmt(progressRevenuePct)} hint="baseado nas vendas realizadas" />
          </div>

          <div className="mt-4">
            <ProgressBar valuePct={progressRevenuePct} />
          </div>
        </Card>

        <Card
          title="Meta anual — Empresas atendidas"
          subtitle={`Meta 2026: ${GOALS_2026.companiesAnnual} empresas`}
          right={<Pill>YTD</Pill>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Stat label="Real (acumulado)" value={String(real.companiesYTD)} hint={`Meta do mês: ${Math.round(monthGoalSales)} vendas`} />
            <Stat label="Progresso anual" value={pctFmt(progressCompaniesPct)} hint="1 venda = 1 empresa" />
          </div>

          <div className="mt-4">
            <ProgressBar valuePct={progressCompaniesPct} />
          </div>
        </Card>
      </div>

      {/* Cards do mês (somatórios + custos separados por perfil) */}
      <Card title="Indicadores do mês" subtitle="Reais puxados das vendas/leads. Metas por default inteligente e metas fixas.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {/* Vendas do mês (soma dos perfis) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Vendas do mês</div>
            <div className="mt-1 text-2xl font-semibold">{real.monthSales}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSales)}</span>
            </div>
            <div className="mt-2">{deltaLabel(real.monthSales, Math.round(monthGoalSales), "higher_better")}</div>
          </div>

          {/* Reuniões marcadas (soma) — ainda sem meta fixa */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas</div>
            <div className="mt-1 text-2xl font-semibold">{real.monthMeetingsBooked}</div>
            <div className="mt-2 text-xs text-slate-400">Meta: (definir depois)</div>
            <div className="mt-2"><Pill>—</Pill></div>
          </div>

          {/* Show-rate (soma / % do mês) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Show-rate</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(real.monthShowRatePct)}</div>
            <div className="mt-2 text-xs text-slate-400">Meta: (definir depois)</div>
            <div className="mt-2"><Pill>—</Pill></div>
          </div>

          {/* % Renovações */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">% Renovações</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(real.monthRenewalsPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaLabel(real.monthRenewalsPct, GOALS_2026.renewalsPct, "higher_better")}</div>
          </div>

          {/* Custo por venda (separado por perfil) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Custo por venda</div>
            <div className="mt-1 text-sm text-slate-400">Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span></div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Harley</div>
              <div className="text-sm font-semibold">{brl(real.monthCostPerSaleHarley)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Giovanni</div>
              <div className="text-sm font-semibold">{brl(real.monthCostPerSaleGio)}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {deltaLabel(real.monthCostPerSaleHarley, GOALS_2026.costPerSale, "lower_better")}
              {deltaLabel(real.monthCostPerSaleGio, GOALS_2026.costPerSale, "lower_better")}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
