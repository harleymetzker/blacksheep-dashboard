import React, { useEffect, useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import {
  DailyFunnel,
  listDailyFunnel,
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
  meetingsBookedMonthly: 80, // 80 reuniões / mês
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
function deltaPill(real: number, target: number) {
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  const text = `${sign}${d.toFixed(1)}%`;
  return <Pill>{text}</Pill>;
}

function sumField(rows: any[], field: string) {
  return (rows ?? []).reduce((acc, r) => acc + Number(r?.[field] || 0), 0);
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

  // Ads (mês)
  const [metaRowsMonth, setMetaRowsMonth] = useState<any[]>([]);
  // Ads (YTD) — para custo por venda YTD correto
  const [metaRowsYTD, setMetaRowsYTD] = useState<any[]>([]);

  // Leads (amplo) — para show-rate e vendas (deal_date)
  const [leadsHarleyAll, setLeadsHarleyAll] = useState<any[]>([]);
  const [leadsGioAll, setLeadsGioAll] = useState<any[]>([]);

  // CS (renovações)
  const [customers, setCustomers] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);

  // Daily funnel (mês e YTD) — para “reuniões marcadas/realizadas” bater com os cards do Leads
  const [dailyHarleyMonth, setDailyHarleyMonth] = useState<DailyFunnel[]>([]);
  const [dailyGioMonth, setDailyGioMonth] = useState<DailyFunnel[]>([]);
  const [dailyHarleyYTD, setDailyHarleyYTD] = useState<DailyFunnel[]>([]);
  const [dailyGioYTD, setDailyGioYTD] = useState<DailyFunnel[]>([]);

  const monthStart = useMemo(() => startOfMonthISO(year, month), [year, month]);
  const monthEnd = useMemo(() => endOfMonthISO(year, month), [year, month]);

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // Busca ampla de leads e filtra por lead_date/deal_date aqui no front
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [
        metaM,
        metaY,
        mhAll,
        mgAll,
        cs,
        rn,
        dhMonth,
        dgMonth,
        dhY,
        dgY,
      ] = await Promise.all([
        listMetaAds(monthStart, monthEnd),
        listMetaAds(yearStart, yearEnd),

        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),

        listOpsCustomers(),
        listOpsCustomerRenewals(),

        listDailyFunnel("harley", monthStart, monthEnd),
        listDailyFunnel("giovanni", monthStart, monthEnd),

        listDailyFunnel("harley", yearStart, yearEnd),
        listDailyFunnel("giovanni", yearStart, yearEnd),
      ]);

      setMetaRowsMonth(metaM ?? []);
      setMetaRowsYTD(metaY ?? []);
      setLeadsHarleyAll(mhAll ?? []);
      setLeadsGioAll(mgAll ?? []);
      setCustomers(cs ?? []);
      setRenewals(rn ?? []);
      setDailyHarleyMonth(dhMonth ?? []);
      setDailyGioMonth(dgMonth ?? []);
      setDailyHarleyYTD(dhY ?? []);
      setDailyGioYTD(dgY ?? []);
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

  // ---------------- SALES (por deal_date) ----------------
  const salesByProfileMonth = useMemo(() => {
    const out: Record<Profile, any[]> = { harley: [], giovanni: [] };

    const pick = (rows: any[]) => {
      return (rows ?? []).filter((r: any) => {
        if (String(r.status) !== "venda") return false;
        const d = dealDate(r);
        return inRange(d, monthStart, monthEnd);
      });
    };

    out.harley = pick(leadsHarleyAll);
    out.giovanni = pick(leadsGioAll);
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
    // 1 venda = 1 empresa
    return salesByProfileYTD.harley.length + salesByProfileYTD.giovanni.length;
  }, [salesByProfileYTD]);

  const monthSalesTotal = useMemo(() => {
    return salesByProfileMonth.harley.length + salesByProfileMonth.giovanni.length;
  }, [salesByProfileMonth]);

  // ---------------- MEETINGS (via DAILY FUNNEL) ----------------
  // Reuniões marcadas = daily_funnel.reuniao (soma dos perfis) — bate com os cards do Leads
  const meetingsBookedMonth = useMemo(() => {
    return sumField(dailyHarleyMonth, "reuniao") + sumField(dailyGioMonth, "reuniao");
  }, [dailyHarleyMonth, dailyGioMonth]);

  // Reuniões realizadas = daily_funnel.proposta (soma dos perfis) — no Leads isso está rotulado como “Reunião realizada”
  const meetingsDoneMonth = useMemo(() => {
    return sumField(dailyHarleyMonth, "proposta") + sumField(dailyGioMonth, "proposta");
  }, [dailyHarleyMonth, dailyGioMonth]);

  const meetingsBookedYTD = useMemo(() => {
    return sumField(dailyHarleyYTD, "reuniao") + sumField(dailyGioYTD, "reuniao");
  }, [dailyHarleyYTD, dailyGioYTD]);

  const meetingsDoneYTD = useMemo(() => {
    return sumField(dailyHarleyYTD, "proposta") + sumField(dailyGioYTD, "proposta");
  }, [dailyHarleyYTD, dailyGioYTD]);

  // ---------------- SHOW-RATE (via MEETING LEADS status NOVO) ----------------
  // Status válidos agora: reuniao_realizada | no_show | venda
  function showRatePctForRange(start: string, end: string) {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), start, end)
    );

    const attended = all.filter((r: any) => {
      const s = String(r.status);
      return s === "reuniao_realizada" || s === "venda";
    }).length;

    const noShow = all.filter((r: any) => String(r.status) === "no_show").length;

    const denom = attended + noShow;
    return denom > 0 ? safeDiv(attended * 100, denom) : 0;
  }

  const showRateMonthPct = useMemo(() => {
    return showRatePctForRange(monthStart, monthEnd);
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const showRateYTDPct = useMemo(() => {
    return showRatePctForRange(yearStart, yearEnd);
  }, [leadsHarleyAll, leadsGioAll]);

  // ---------------- RENEWALS (CS) ----------------
  function renewalsPctForRange(start: string, end: string) {
    // Base (due) = clientes com renewal_date dentro do range
    const dueCustomers = (customers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), start, end));
    const dueIds = new Set(dueCustomers.map((c: any) => String(c.id)));

    // Renovou no range = existe registro em ops_customer_renewals com renewal_date dentro do range
    const renewedIds = new Set<string>();
    for (const r of renewals ?? []) {
      const payDate = iso10((r as any).renewal_date);
      if (!inRange(payDate, start, end)) continue;
      const cid = String((r as any).customer_id ?? "");
      if (cid && dueIds.has(cid)) renewedIds.add(cid);
    }

    return dueIds.size > 0 ? safeDiv(renewedIds.size * 100, dueIds.size) : 0;
  }

  const renewalsMonthPct = useMemo(() => {
    return renewalsPctForRange(monthStart, monthEnd);
  }, [customers, renewals, monthStart, monthEnd]);

  const renewalsYTDPct = useMemo(() => {
    return renewalsPctForRange(yearStart, yearEnd);
  }, [customers, renewals]);

  // ---------------- ADS SPEND + COST/SALE ----------------
  const spendByProfileMonth = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaRowsMonth ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaRowsMonth]);

  const spendByProfileYTD = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaRowsYTD ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaRowsYTD]);

  const costPerSaleHarleyMonth = useMemo(() => {
    const spend = spendByProfileMonth.harley;
    const sales = salesByProfileMonth.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileMonth, salesByProfileMonth]);

  const costPerSaleGioMonth = useMemo(() => {
    const spend = spendByProfileMonth.giovanni;
    const sales = salesByProfileMonth.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileMonth, salesByProfileMonth]);

  const costPerSaleHarleyYTD = useMemo(() => {
    const spend = spendByProfileYTD.harley;
    const sales = salesByProfileYTD.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileYTD, salesByProfileYTD]);

  const costPerSaleGioYTD = useMemo(() => {
    const spend = spendByProfileYTD.giovanni;
    const sales = salesByProfileYTD.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileYTD, salesByProfileYTD]);

  // ---------------- GOALS (default inteligente) ----------------
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  // ---------------- PROGRESS ANUAL ----------------
  const progressRevenuePct = useMemo(
    () => safeDiv(soldValueYTD * 100, GOALS_2026.revenueAnnual),
    [soldValueYTD]
  );
  const progressCompaniesPct = useMemo(
    () => safeDiv(companiesYTD * 100, GOALS_2026.companiesAnnual),
    [companiesYTD]
  );

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
            <Stat
              label="Real (acumulado)"
              value={String(companiesYTD)}
              hint={`Meta do mês: ${Math.round(monthGoalSales)} vendas`}
            />
            <Stat label="Progresso anual" value={pctFmt(progressCompaniesPct)} hint="1 venda = 1 empresa" />
          </div>

          <div className="mt-4">
            <ProgressBar valuePct={progressCompaniesPct} />
          </div>
        </Card>
      </div>

      {/* Indicadores do mês */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {/* Vendas do mês (soma) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Vendas do mês</div>
            <div className="mt-1 text-2xl font-semibold">{monthSalesTotal}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSales)}</span>
            </div>
            <div className="mt-2">{deltaPill(monthSalesTotal, Math.round(monthGoalSales))}</div>
          </div>

          {/* Reuniões marcadas (DAILY funnel) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsBookedMonth}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.meetingsBookedMonthly}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsBookedMonth, GOALS_2026.meetingsBookedMonthly)}</div>
          </div>

          {/* Reuniões realizadas (DAILY funnel) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões realizadas</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsDoneMonth}</div>
            <div className="mt-2 text-xs text-slate-400">Fonte: daily_funnel</div>
            <div className="mt-2"><Pill>—</Pill></div>
          </div>

          {/* Show-rate (status novo) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Show-rate</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(showRateMonthPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
            </div>
            <div className="mt-2">{deltaPill(showRateMonthPct, GOALS_2026.showRatePct)}</div>
          </div>

          {/* % Renovações */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">% Renovações</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(renewalsMonthPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(renewalsMonthPct, GOALS_2026.renewalsPct)}</div>
          </div>

          {/* Custo por venda (mês) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Custo por venda</div>
            <div className="mt-1 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Harley</div>
              <div className="text-sm font-semibold">{brl(costPerSaleHarleyMonth)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Giovanni</div>
              <div className="text-sm font-semibold">{brl(costPerSaleGioMonth)}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {deltaPill(costPerSaleHarleyMonth, GOALS_2026.costPerSale)}
              {deltaPill(costPerSaleGioMonth, GOALS_2026.costPerSale)}
            </div>
          </div>
        </div>
      </Card>

      {/* Indicadores YTD (acumulado anual, independente do mês selecionado) */}
      <Card title="Indicadores YTD" subtitle={`Período: ${yearStart} → ${yearEnd}`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {/* Vendas YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Vendas YTD</div>
            <div className="mt-1 text-2xl font-semibold">{companiesYTD}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta anual: <span className="text-slate-200">{GOALS_2026.companiesAnnual}</span>
            </div>
            <div className="mt-2">{deltaPill(companiesYTD, GOALS_2026.companiesAnnual)}</div>
          </div>

          {/* Reuniões marcadas YTD (daily funnel) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas YTD</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsBookedYTD}</div>
            <div className="mt-2 text-xs text-slate-400">Fonte: daily_funnel</div>
            <div className="mt-2"><Pill>—</Pill></div>
          </div>

          {/* Reuniões realizadas YTD (daily funnel) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões realizadas YTD</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsDoneYTD}</div>
            <div className="mt-2 text-xs text-slate-400">Fonte: daily_funnel</div>
            <div className="mt-2"><Pill>—</Pill></div>
          </div>

          {/* Show-rate YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Show-rate YTD</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(showRateYTDPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
            </div>
            <div className="mt-2">{deltaPill(showRateYTDPct, GOALS_2026.showRatePct)}</div>
          </div>

          {/* Renovações YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">% Renovações YTD</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(renewalsYTDPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(renewalsYTDPct, GOALS_2026.renewalsPct)}</div>
          </div>

          {/* Custo por venda YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Custo por venda YTD</div>
            <div className="mt-1 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Harley</div>
              <div className="text-sm font-semibold">{brl(costPerSaleHarleyYTD)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Giovanni</div>
              <div className="text-sm font-semibold">{brl(costPerSaleGioYTD)}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {deltaPill(costPerSaleHarleyYTD, GOALS_2026.costPerSale)}
              {deltaPill(costPerSaleGioYTD, GOALS_2026.costPerSale)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
