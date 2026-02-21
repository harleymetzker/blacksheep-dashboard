import React, { useEffect, useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import {
  listMeetingLeads,
  listMetaAds,
  listOpsCustomers,
  listOpsCustomerRenewals,
  listDailyFunnel,
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
  if (!Number.isFinite(target) || target === 0) return <Pill>—</Pill>;
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  return <Pill>{`${sign}${d.toFixed(1)}%`}</Pill>;
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

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

// Normaliza status antigo -> novo (pra não quebrar histórico)
function normalizeStatus(s: any): "marcou" | "reuniao_realizada" | "no_show" | "venda" | "outro" {
  const v = String(s || "").trim();
  if (v === "venda") return "venda";
  if (v === "no_show") return "no_show";
  if (v === "reuniao_realizada") return "reuniao_realizada";

  // legado:
  if (v === "realizou") return "reuniao_realizada";
  if (v === "proposta") return "reuniao_realizada";
  if (v === "marcou") return "marcou";

  return "outro";
}

export default function MetaGlobalPage() {
  const year = 2026;

  // seletor do MÊS (só afeta indicadores do mês)
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12

  // YTD independe do seletor (vai até hoje)
  const ytdEnd = useMemo(() => {
    const t = todayISO();
    const end = `${year}-12-31`;
    return t <= end ? t : end;
  }, [year]);

  const ytdMonthIndex = useMemo(() => {
    const d = new Date(ytdEnd);
    return d.getMonth() + 1; // 1..12
  }, [ytdEnd]);

  const monthStart = useMemo(() => startOfMonthISO(year, month), [year, month]);
  const monthEnd = useMemo(() => endOfMonthISO(year, month), [year, month]);

  const yearStart = `${year}-01-01`;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaMonthRows, setMetaMonthRows] = useState<any[]>([]);
  const [metaYTDRows, setMetaYTDRows] = useState<any[]>([]);

  const [leadsHarleyAll, setLeadsHarleyAll] = useState<any[]>([]);
  const [leadsGioAll, setLeadsGioAll] = useState<any[]>([]);

  const [dailyMonthHarley, setDailyMonthHarley] = useState<any[]>([]);
  const [dailyMonthGio, setDailyMonthGio] = useState<any[]>([]);
  const [dailyYTDHarley, setDailyYTDHarley] = useState<any[]>([]);
  const [dailyYTDGio, setDailyYTDGio] = useState<any[]>([]);

  const [customers, setCustomers] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // busca ampla e filtra no front por lead_date/deal_date (igual LeadsPage)
      const queryEnd = ytdEnd >= todayISO() ? ytdEnd : todayISO();

      const [
        metaM,
        metaY,
        mhAll,
        mgAll,
        dmH,
        dmG,
        dyH,
        dyG,
        cs,
        rn,
      ] = await Promise.all([
        listMetaAds(monthStart, monthEnd),
        listMetaAds(yearStart, ytdEnd),

        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),

        // reuniões marcadas (fonte: daily_funnel)
        listDailyFunnel("harley", monthStart, monthEnd),
        listDailyFunnel("giovanni", monthStart, monthEnd),
        listDailyFunnel("harley", yearStart, ytdEnd),
        listDailyFunnel("giovanni", yearStart, ytdEnd),

        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setMetaMonthRows(metaM ?? []);
      setMetaYTDRows(metaY ?? []);

      setLeadsHarleyAll(mhAll ?? []);
      setLeadsGioAll(mgAll ?? []);

      setDailyMonthHarley(dmH ?? []);
      setDailyMonthGio(dmG ?? []);
      setDailyYTDHarley(dyH ?? []);
      setDailyYTDGio(dyG ?? []);

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
  }, [monthStart, monthEnd, ytdEnd]);

  // ----- SALES (por deal_date) -----
  const salesMonth = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])];
    return all.filter((r: any) => normalizeStatus(r.status) === "venda" && inRange(dealDate(r), monthStart, monthEnd));
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesYTD = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])];
    return all.filter((r: any) => normalizeStatus(r.status) === "venda" && inRange(dealDate(r), yearStart, ytdEnd));
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

  const monthSalesCount = useMemo(() => salesMonth.length, [salesMonth]);
  const ytdSalesCount = useMemo(() => salesYTD.length, [salesYTD]);

  const monthSalesValue = useMemo(() => salesMonth.reduce((acc, r) => acc + dealValue(r), 0), [salesMonth]);
  const soldValueYTD = useMemo(() => salesYTD.reduce((acc, r) => acc + dealValue(r), 0), [salesYTD]);

  const companiesYTD = useMemo(() => ytdSalesCount, [ytdSalesCount]);

  // ----- MEETINGS BOOKED (fonte: daily_funnel.reuniao) -----
  const meetingsBookedMonth = useMemo(() => {
    const h = sum((dailyMonthHarley ?? []).map((r: any) => Number(r.reuniao || 0)));
    const g = sum((dailyMonthGio ?? []).map((r: any) => Number(r.reuniao || 0)));
    return h + g;
  }, [dailyMonthHarley, dailyMonthGio]);

  const meetingsBookedYTD = useMemo(() => {
    const h = sum((dailyYTDHarley ?? []).map((r: any) => Number(r.reuniao || 0)));
    const g = sum((dailyYTDGio ?? []).map((r: any) => Number(r.reuniao || 0)));
    return h + g;
  }, [dailyYTDHarley, dailyYTDGio]);

  // ----- MEETINGS REALIZED + SHOW-RATE (fonte: meeting_leads.status, por lead_date) -----
  const monthLeadsByLeadDate = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])];
    return all.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd));
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const ytdLeadsByLeadDate = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])];
    return all.filter((r: any) => inRange(leadDateFallback(r), yearStart, ytdEnd));
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

  const meetingsRealizedMonth = useMemo(() => {
    // realizada = reuniao_realizada + venda
    return monthLeadsByLeadDate.filter((r: any) => {
      const s = normalizeStatus(r.status);
      return s === "reuniao_realizada" || s === "venda";
    }).length;
  }, [monthLeadsByLeadDate]);

  const meetingsRealizedYTD = useMemo(() => {
    return ytdLeadsByLeadDate.filter((r: any) => {
      const s = normalizeStatus(r.status);
      return s === "reuniao_realizada" || s === "venda";
    }).length;
  }, [ytdLeadsByLeadDate]);

  const showRateMonthPct = useMemo(() => {
    const realized = monthLeadsByLeadDate.filter((r: any) => {
      const s = normalizeStatus(r.status);
      return s === "reuniao_realizada" || s === "venda";
    }).length;

    const noShow = monthLeadsByLeadDate.filter((r: any) => normalizeStatus(r.status) === "no_show").length;

    const denom = realized + noShow;
    return denom > 0 ? safeDiv(realized * 100, denom) : 0;
  }, [monthLeadsByLeadDate]);

  const showRateYTDPct = useMemo(() => {
    const realized = ytdLeadsByLeadDate.filter((r: any) => {
      const s = normalizeStatus(r.status);
      return s === "reuniao_realizada" || s === "venda";
    }).length;

    const noShow = ytdLeadsByLeadDate.filter((r: any) => normalizeStatus(r.status) === "no_show").length;

    const denom = realized + noShow;
    return denom > 0 ? safeDiv(realized * 100, denom) : 0;
  }, [ytdLeadsByLeadDate]);

  // ----- RENEWALS PCT (mês e YTD) -----
  const renewalsMonthPct = useMemo(() => {
    const dueCustomers = (customers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), monthStart, monthEnd));
    const dueIds = new Set(dueCustomers.map((c: any) => String(c.id)));

    const renewedIds = new Set<string>();
    for (const r of renewals ?? []) {
      const payDate = iso10((r as any).renewal_date);
      if (!inRange(payDate, monthStart, monthEnd)) continue;
      const cid = String((r as any).customer_id ?? "");
      if (cid && dueIds.has(cid)) renewedIds.add(cid);
    }

    return dueIds.size > 0 ? safeDiv(renewedIds.size * 100, dueIds.size) : 0;
  }, [customers, renewals, monthStart, monthEnd]);

  const renewalsYTDPct = useMemo(() => {
    const dueCustomers = (customers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), yearStart, ytdEnd));
    const dueIds = new Set(dueCustomers.map((c: any) => String(c.id)));

    const renewedIds = new Set<string>();
    for (const r of renewals ?? []) {
      const payDate = iso10((r as any).renewal_date);
      if (!inRange(payDate, yearStart, ytdEnd)) continue;
      const cid = String((r as any).customer_id ?? "");
      if (cid && dueIds.has(cid)) renewedIds.add(cid);
    }

    return dueIds.size > 0 ? safeDiv(renewedIds.size * 100, dueIds.size) : 0;
  }, [customers, renewals, yearStart, ytdEnd]);

  // ----- ADS SPEND (mês e YTD) -----
  const spendByProfileMonth = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaMonthRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaMonthRows]);

  const spendByProfileYTD = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaYTDRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaYTDRows]);

  const salesByProfileMonth = useMemo(() => {
    const out: Record<Profile, any[]> = { harley: [], giovanni: [] };
    out.harley = (leadsHarleyAll ?? []).filter(
      (r: any) => normalizeStatus(r.status) === "venda" && inRange(dealDate(r), monthStart, monthEnd)
    );
    out.giovanni = (leadsGioAll ?? []).filter(
      (r: any) => normalizeStatus(r.status) === "venda" && inRange(dealDate(r), monthStart, monthEnd)
    );
    return out;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesByProfileYTD = useMemo(() => {
    const out: Record<Profile, any[]> = { harley: [], giovanni: [] };
    out.harley = (leadsHarleyAll ?? []).filter(
      (r: any) => normalizeStatus(r.status) === "venda" && inRange(dealDate(r), yearStart, ytdEnd)
    );
    out.giovanni = (leadsGioAll ?? []).filter(
      (r: any) => normalizeStatus(r.status) === "venda" && inRange(dealDate(r), yearStart, ytdEnd)
    );
    return out;
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

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

  // ----- Goals: mês e YTD proporcional -----
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  // YTD proporcional ao mês atual (até hoje)
  const ytdGoalRevenue = useMemo(() => monthGoalRevenue * ytdMonthIndex, [monthGoalRevenue, ytdMonthIndex]);
  const ytdGoalSales = useMemo(() => monthGoalSales * ytdMonthIndex, [monthGoalSales, ytdMonthIndex]);
  const ytdGoalMeetingsBooked = useMemo(
    () => GOALS_2026.meetingsBookedMonthly * ytdMonthIndex,
    [ytdMonthIndex]
  );
  const ytdGoalMeetingsRealized = useMemo(
    () => GOALS_2026.meetingsBookedMonthly * (GOALS_2026.showRatePct / 100) * ytdMonthIndex,
    [ytdMonthIndex]
  );

  // ----- Progress annual (barra do topo continua anual) -----
  const progressRevenuePct = useMemo(() => safeDiv(soldValueYTD * 100, GOALS_2026.revenueAnnual), [soldValueYTD]);
  const progressCompaniesPct = useMemo(() => safeDiv(companiesYTD * 100, GOALS_2026.companiesAnnual), [companiesYTD]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Meta Global</div>
          <div className="text-sm text-slate-400">Metas do ano + desempenho do mês e YTD (dados reais).</div>
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

      {/* ✅ PRIMEIRO: Indicadores YTD */}
      <Card title="Indicadores YTD" subtitle={`Período: ${yearStart} → ${ytdEnd} (meta proporcional ao mês ${String(ytdMonthIndex).padStart(2, "0")})`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {/* Vendas YTD: qtd + valor */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4 lg:col-span-2">
            <div className="text-xs text-slate-400">Vendas YTD</div>
            <div className="mt-1 flex items-end justify-between gap-4">
              <div className="text-2xl font-semibold">{ytdSalesCount}</div>
              <div className="text-sm text-slate-200">{brl(soldValueYTD)}</div>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalSales)}</span> vendas ·{" "}
              <span className="text-slate-200">{brl(ytdGoalRevenue)}</span>
            </div>
            <div className="mt-2">{deltaPill(ytdSalesCount, ytdGoalSales)}</div>
          </div>

          {/* Reuniões marcadas YTD (daily_funnel) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas YTD</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsBookedYTD}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta YTD: <span className="text-slate-200">{ytdGoalMeetingsBooked}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsBookedYTD, ytdGoalMeetingsBooked)}</div>
          </div>

          {/* Reuniões realizadas YTD (status lead) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões realizadas YTD</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsRealizedYTD}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsRealized)}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsRealizedYTD, ytdGoalMeetingsRealized)}</div>
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

          {/* % Renovações YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">% Renovações YTD</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(renewalsYTDPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(renewalsYTDPct, GOALS_2026.renewalsPct)}</div>
          </div>

          {/* Custo por venda YTD (perfil) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4 lg:col-span-2">
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

      {/* ✅ DEPOIS: Indicadores do mês */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {/* Vendas do mês: qtd + valor */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4 lg:col-span-2">
            <div className="text-xs text-slate-400">Vendas do mês</div>
            <div className="mt-1 flex items-end justify-between gap-4">
              <div className="text-2xl font-semibold">{monthSalesCount}</div>
              <div className="text-sm text-slate-200">{brl(monthSalesValue)}</div>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSales)}</span> vendas ·{" "}
              <span className="text-slate-200">{brl(monthGoalRevenue)}</span>
            </div>
            <div className="mt-2">{deltaPill(monthSalesCount, monthGoalSales)}</div>
          </div>

          {/* Reuniões marcadas (daily_funnel) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsBookedMonth}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.meetingsBookedMonthly}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsBookedMonth, GOALS_2026.meetingsBookedMonthly)}</div>
          </div>

          {/* Reuniões realizadas (status lead) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões realizadas</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsRealizedMonth}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta:{" "}
              <span className="text-slate-200">
                {Math.round(GOALS_2026.meetingsBookedMonthly * (GOALS_2026.showRatePct / 100))}
              </span>
            </div>
            <div className="mt-2">
              {deltaPill(
                meetingsRealizedMonth,
                GOALS_2026.meetingsBookedMonthly * (GOALS_2026.showRatePct / 100)
              )}
            </div>
          </div>

          {/* Show-rate */}
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

          {/* Custo por venda (perfil) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4 lg:col-span-2">
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
    </div>
  );
}
