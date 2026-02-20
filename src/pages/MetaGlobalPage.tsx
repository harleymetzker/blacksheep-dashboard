import React, { useEffect, useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import {
  listMeetingLeads,
  listMetaAds,
  listOpsCustomers,
  listOpsCustomerRenewals,
} from "../lib/db";
import { Profile } from "../lib/utils";

// ====== CONFIG FIXA (2026) ======
const GOALS_2026 = {
  revenueAnnual: 1_000_000, // R$ 1 mi
  companiesAnnual: 125, // 125 empresas
  costPerSale: 1_000, // R$ 1.000
  showRatePct: 60, // 60%
  meetingsBookedMonthly: 25, // 25 reuniões / mês
  renewalsPct: 70, // 70%
};

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
function pctFmt(n: number) {
  return `${clampPct(n).toFixed(1)}%`;
}

function iso10(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}
function inRange(dayISO: string, start: string, end: string) {
  return !!dayISO && dayISO >= start && dayISO <= end;
}

function leadDateFallback(row: any) {
  return iso10(row?.lead_date) || iso10(row?.created_at) || todayISO();
}
function dealDate(row: any) {
  return iso10(row?.deal_date);
}
function dealValue(row: any) {
  const n = Number(row?.deal_value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function startOfMonthISO(year: number, month: number) {
  const d = new Date(year, month - 1, 1);
  return d.toISOString().slice(0, 10);
}
function endOfMonthISO(year: number, month: number) {
  const d = new Date(year, month, 0);
  return d.toISOString().slice(0, 10);
}

function deltaPct(real: number, target: number) {
  return safeDiv((real - target) * 100, target);
}
function deltaPill(real: number, target: number, mode: "higher_better" | "lower_better") {
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  const text = `${sign}${d.toFixed(1)}%`;

  // Você pode colorir diferente depois. Por enquanto, pill neutro (igual seu pattern).
  return <Pill>{text}</Pill>;
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

// Barra simples
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

export default function MetaGlobalPage() {
  const year = 2026;
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaRows, setMetaRows] = useState<any[]>([]);
  const [leadsHarleyAll, setLeadsHarleyAll] = useState<any[]>([]);
  const [leadsGioAll, setLeadsGioAll] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);

  const monthStart = useMemo(() => startOfMonthISO(year, month), [year, month]);
  const monthEnd = useMemo(() => endOfMonthISO(year, month), [year, month]);

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // Busca ampla de leads (por created_at) e filtra por lead_date/deal_date aqui no front
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [meta, mhAll, mgAll, cs, rn] = await Promise.all([
        listMetaAds(monthStart, monthEnd),
        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),
        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setMetaRows(meta ?? []);
      setLeadsHarleyAll(mhAll ?? []);
      setLeadsGioAll(mgAll ?? []);
      setCustomers(cs ?? []);
      setRenewals(rn ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd]);

  // ----- SALES (por deal_date) -----
  const salesByProfileMonth = useMemo(() => {
    const out: Record<Profile, any[]> = { harley: [], giovanni: [] };

    const pick = (rows: any[], p: Profile) => {
      return (rows ?? []).filter((r: any) => {
        if (String(r.status) !== "venda") return false;
        const d = dealDate(r);
        return inRange(d, monthStart, monthEnd);
      });
    };

    out.harley = pick(leadsHarleyAll, "harley");
    out.giovanni = pick(leadsGioAll, "giovanni");
    return out;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesByProfileYTD = useMemo(() => {
    const out: Record<Profile, any[]> = { harley: [], giovanni: [] };

    const pick = (rows: any[]) => {
      return (rows ?? []).filter((r: any) => {
        if (String(r.status) !== "venda") return false;
        const d = dealDate(r);
        return inRange(d, yearStart, yearEnd);
      });
    };

    out.harley = pick(leadsHarleyAll);
    out.giovanni = pick(leadsGioAll);
    return out;
  }, [leadsHarleyAll, leadsGioAll]);

  const soldValueYTD = useMemo(() => {
    const all = [...salesByProfileYTD.harley, ...salesByProfileYTD.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileYTD]);

  const companiesYTD = useMemo(() => {
    // 1 venda = 1 empresa (definição tua)
    return salesByProfileYTD.harley.length + salesByProfileYTD.giovanni.length;
  }, [salesByProfileYTD]);

  // ----- MONTH: meetings booked + show-rate (por lead_date) -----
  const meetingsBookedMonth = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])];
    // reunião marcada = lead_date dentro do mês (independente do status)
    return all.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd)).length;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const showRateMonthPct = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), monthStart, monthEnd)
    );

    const realizou = all.filter((r: any) => String(r.status) === "realizou").length;
    const noShow = all.filter((r: any) => String(r.status) === "no_show").length;

    // show-rate = realizou / (realizou + no_show)
    const denom = realizou + noShow;
    return denom > 0 ? safeDiv(realizou * 100, denom) : 0;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  // ----- MONTH: renewals pct -----
  const renewalsMonthPct = useMemo(() => {
    // Base (due) = clientes com renewal_date (vencimento) dentro do mês
    const dueCustomers = (customers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), monthStart, monthEnd));
    const dueIds = new Set(dueCustomers.map((c: any) => String(c.id)));

    // Renovou no mês = existe registro em ops_customer_renewals com renewal_date (pagamento) dentro do mês
    const renewedIds = new Set<string>();
    for (const r of renewals ?? []) {
      const payDate = iso10((r as any).renewal_date);
      if (!inRange(payDate, monthStart, monthEnd)) continue;
      const cid = String((r as any).customer_id ?? "");
      if (cid && dueIds.has(cid)) renewedIds.add(cid);
    }

    return dueIds.size > 0 ? safeDiv(renewedIds.size * 100, dueIds.size) : 0;
  }, [customers, renewals, monthStart, monthEnd]);

  // ----- Ads spend month by profile -----
  const spendByProfileMonth = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaRows]);

  const costPerSaleHarley = useMemo(() => {
    const spend = spendByProfileMonth.harley;
    const sales = salesByProfileMonth.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileMonth, salesByProfileMonth]);

  const costPerSaleGio = useMemo(() => {
    const spend = spendByProfileMonth.giovanni;
    const sales = salesByProfileMonth.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileMonth, salesByProfileMonth]);

  // ----- Month goals (default inteligente) -----
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  // ----- Progress annual -----
  const progressRevenuePct = useMemo(
    () => safeDiv(soldValueYTD * 100, GOALS_2026.revenueAnnual),
    [soldValueYTD]
  );
  const progressCompaniesPct = useMemo(
    () => safeDiv(companiesYTD * 100, GOALS_2026.companiesAnnual),
    [companiesYTD]
  );

  // Month sales total (sum profiles)
  const monthSalesTotal = useMemo(() => {
    return salesByProfileMonth.harley.length + salesByProfileMonth.giovanni.length;
  }, [salesByProfileMonth]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Meta Global</div>
          <div className="text-sm text-slate-400">Metas do ano + desempenho do mês (dados reais).</div>
        </div>

        <div className="flex items-center gap-2">
          {loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}

          <div className="ml-2 text-sm text-slate-400">Mês</div>
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

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {/* Topo: 2 cards lado a lado */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Meta anual — Faturamento"
          subtitle={`Meta 2026: ${brl(GOALS_2026.revenueAnnual)}`}
          right={<Pill>YTD</Pill>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Stat label="Real (acumulado)" value={brl(soldValueYTD)} hint={`Meta do mês: ${brl(monthGoalRevenue)}`} />
            <Stat label="Progresso anual" value={pctFmt(progressRevenuePct)} hint="baseado nas vendas (deal_date)" />
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
            <Stat label="Real (acumulado)" value={String(companiesYTD)} hint={`Meta do mês: ${Math.round(monthGoalSales)} vendas`} />
            <Stat label="Progresso anual" value={pctFmt(progressCompaniesPct)} hint="1 venda = 1 empresa" />
          </div>

          <div className="mt-4">
            <ProgressBar valuePct={progressCompaniesPct} />
          </div>
        </Card>
      </div>

      {/* Indicadores do mês */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {/* Vendas do mês (soma) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Vendas do mês</div>
            <div className="mt-1 text-2xl font-semibold">{monthSalesTotal}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSales)}</span>
            </div>
            <div className="mt-2">{deltaPill(monthSalesTotal, Math.round(monthGoalSales), "higher_better")}</div>
          </div>

          {/* Reuniões marcadas (soma) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsBookedMonth}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.meetingsBookedMonthly}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsBookedMonth, GOALS_2026.meetingsBookedMonthly, "higher_better")}</div>
          </div>

          {/* Show-rate */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Show-rate</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(showRateMonthPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
            </div>
            <div className="mt-2">{deltaPill(showRateMonthPct, GOALS_2026.showRatePct, "higher_better")}</div>
          </div>

          {/* % Renovações */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">% Renovações</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(renewalsMonthPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(renewalsMonthPct, GOALS_2026.renewalsPct, "higher_better")}</div>
          </div>

          {/* Custo por venda (separado por perfil) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Custo por venda</div>
            <div className="mt-1 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Harley</div>
              <div className="text-sm font-semibold">{brl(costPerSaleHarley)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Giovanni</div>
              <div className="text-sm font-semibold">{brl(costPerSaleGio)}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {deltaPill(costPerSaleHarley, GOALS_2026.costPerSale, "lower_better")}
              {deltaPill(costPerSaleGio, GOALS_2026.costPerSale, "lower_better")}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
