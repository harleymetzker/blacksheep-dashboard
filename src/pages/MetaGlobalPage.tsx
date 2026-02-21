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
  if (!Number.isFinite(target) || target === 0) return NaN;
  return safeDiv((real - target) * 100, target);
}

function deltaPill(real: number, target: number) {
  const d = deltaPct(real, target);
  if (!Number.isFinite(d)) return <Pill>—</Pill>;
  const sign = d >= 0 ? "+" : "";
  return <Pill>{`${sign}${d.toFixed(1)}%`}</Pill>;
}

function daysInYear(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function dayOfYear(year: number, iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const start = new Date(Date.UTC(year, 0, 1));
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1; // 1..365/366
}

// Barra simples (só pros cards do topo)
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

  const [metaMonthRows, setMetaMonthRows] = useState<any[]>([]);
  const [metaYTDRows, setMetaYTDRows] = useState<any[]>([]);
  const [leadsHarleyAll, setLeadsHarleyAll] = useState<any[]>([]);
  const [leadsGioAll, setLeadsGioAll] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);

  const monthStart = useMemo(() => startOfMonthISO(year, month), [year, month]);
  const monthEnd = useMemo(() => endOfMonthISO(year, month), [year, month]);

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const ytdEnd = useMemo(() => {
    const t = todayISO();
    if (t < yearStart) return yearStart;
    if (t > yearEnd) return yearEnd;
    return t;
  }, [yearStart, yearEnd]);

  const ytdDays = useMemo(() => dayOfYear(year, ytdEnd), [year, ytdEnd]);
  const ytdRatio = useMemo(() => safeDiv(ytdDays, daysInYear(year)), [year, ytdDays]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [metaMonth, metaYTD, mhAll, mgAll, cs, rn] = await Promise.all([
        listMetaAds(monthStart, monthEnd),
        listMetaAds(yearStart, ytdEnd),
        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),
        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setMetaMonthRows(metaMonth ?? []);
      setMetaYTDRows(metaYTD ?? []);
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
  }, [monthStart, monthEnd, ytdEnd]);

  // ====== SALES (por deal_date) ======
  const salesByProfileMonth = useMemo(() => {
    const pick = (rows: any[]) =>
      (rows ?? []).filter((r: any) => String(r.status) === "venda" && inRange(dealDate(r), monthStart, monthEnd));

    return {
      harley: pick(leadsHarleyAll),
      giovanni: pick(leadsGioAll),
    } as Record<Profile, any[]>;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesByProfileYTD = useMemo(() => {
    const pick = (rows: any[]) =>
      (rows ?? []).filter((r: any) => String(r.status) === "venda" && inRange(dealDate(r), yearStart, ytdEnd));

    return {
      harley: pick(leadsHarleyAll),
      giovanni: pick(leadsGioAll),
    } as Record<Profile, any[]>;
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

  const monthSalesQty = useMemo(
    () => salesByProfileMonth.harley.length + salesByProfileMonth.giovanni.length,
    [salesByProfileMonth]
  );

  const monthSalesValue = useMemo(() => {
    const all = [...salesByProfileMonth.harley, ...salesByProfileMonth.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileMonth]);

  const soldValueYTD = useMemo(() => {
    const all = [...salesByProfileYTD.harley, ...salesByProfileYTD.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileYTD]);

  const companiesYTD = useMemo(() => salesByProfileYTD.harley.length + salesByProfileYTD.giovanni.length, [salesByProfileYTD]);

  // ====== MEETINGS (por lead_date) ======
  // Status válidos agora: "reuniao_realizada" | "no_show" | "venda"
  // (venda implica que a reunião foi realizada)
  const allLeads = useMemo(() => [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])], [leadsHarleyAll, leadsGioAll]);

  const meetingsBookedMonth = useMemo(() => {
    return allLeads.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd)).length;
  }, [allLeads, monthStart, monthEnd]);

  const meetingsBookedYTD = useMemo(() => {
    return allLeads.filter((r: any) => inRange(leadDateFallback(r), yearStart, ytdEnd)).length;
  }, [allLeads, yearStart, ytdEnd]);

  const meetingsHeldMonth = useMemo(() => {
    const rows = allLeads.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd));
    return rows.filter((r: any) => {
      const s = String(r.status);
      return s === "reuniao_realizada" || s === "venda";
    }).length;
  }, [allLeads, monthStart, monthEnd]);

  const meetingsHeldYTD = useMemo(() => {
    const rows = allLeads.filter((r: any) => inRange(leadDateFallback(r), yearStart, ytdEnd));
    return rows.filter((r: any) => {
      const s = String(r.status);
      return s === "reuniao_realizada" || s === "venda";
    }).length;
  }, [allLeads, yearStart, ytdEnd]);

  const noShowMonth = useMemo(() => {
    const rows = allLeads.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd));
    return rows.filter((r: any) => String(r.status) === "no_show").length;
  }, [allLeads, monthStart, monthEnd]);

  const noShowYTD = useMemo(() => {
    const rows = allLeads.filter((r: any) => inRange(leadDateFallback(r), yearStart, ytdEnd));
    return rows.filter((r: any) => String(r.status) === "no_show").length;
  }, [allLeads, yearStart, ytdEnd]);

  const showRateMonthPct = useMemo(() => {
    const denom = meetingsHeldMonth + noShowMonth;
    return denom > 0 ? safeDiv(meetingsHeldMonth * 100, denom) : 0;
  }, [meetingsHeldMonth, noShowMonth]);

  const showRateYTDPct = useMemo(() => {
    const denom = meetingsHeldYTD + noShowYTD;
    return denom > 0 ? safeDiv(meetingsHeldYTD * 100, denom) : 0;
  }, [meetingsHeldYTD, noShowYTD]);

  // ====== RENEWALS ======
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

  // ====== ADS SPEND ======
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

  const costPerSaleMonthHarley = useMemo(() => {
    const spend = spendByProfileMonth.harley;
    const sales = salesByProfileMonth.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileMonth, salesByProfileMonth]);

  const costPerSaleMonthGio = useMemo(() => {
    const spend = spendByProfileMonth.giovanni;
    const sales = salesByProfileMonth.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileMonth, salesByProfileMonth]);

  const costPerSaleMonthTotal = useMemo(() => {
    const spend = spendByProfileMonth.harley + spendByProfileMonth.giovanni;
    return monthSalesQty > 0 ? safeDiv(spend, monthSalesQty) : 0;
  }, [spendByProfileMonth, monthSalesQty]);

  const costPerSaleYTDHarley = useMemo(() => {
    const spend = spendByProfileYTD.harley;
    const sales = salesByProfileYTD.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileYTD, salesByProfileYTD]);

  const costPerSaleYTDGio = useMemo(() => {
    const spend = spendByProfileYTD.giovanni;
    const sales = salesByProfileYTD.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileYTD, salesByProfileYTD]);

  const costPerSaleYTDTotal = useMemo(() => {
    const spend = spendByProfileYTD.harley + spendByProfileYTD.giovanni;
    const sales = companiesYTD;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileYTD, companiesYTD]);

  // ====== METAS ======
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSalesQty = useMemo(() => GOALS_2026.companiesAnnual / 12, []);
  const monthGoalMeetingsBooked = GOALS_2026.meetingsBookedMonthly;
  const monthGoalMeetingsHeld = useMemo(
    () => Math.round((GOALS_2026.meetingsBookedMonthly * GOALS_2026.showRatePct) / 100),
    []
  );

  // YTD proporcional ao ano, até hoje
  const ytdGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual * ytdRatio, [ytdRatio]);
  const ytdGoalSalesQty = useMemo(() => GOALS_2026.companiesAnnual * ytdRatio, [ytdRatio]);
  const ytdGoalMeetingsBooked = useMemo(() => GOALS_2026.meetingsBookedMonthly * 12 * ytdRatio, [ytdRatio]);
  const ytdGoalMeetingsHeld = useMemo(
    () => (GOALS_2026.meetingsBookedMonthly * 12 * (GOALS_2026.showRatePct / 100)) * ytdRatio,
    [ytdRatio]
  );

  // ====== PROGRESSO ANUAL (cards topo) ======
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
            <Stat
              label="Real (acumulado)"
              value={brl(soldValueYTD)}
              hint={`Meta YTD (proporcional): ${brl(ytdGoalRevenue)}`}
            />
            <Stat label="Progresso anual" value={pctFmt(progressRevenuePct)} hint="" />
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
              hint={`Meta YTD (proporcional): ${Math.round(ytdGoalSalesQty)} vendas`}
            />
            <Stat label="Progresso anual" value={pctFmt(progressCompaniesPct)} hint="" />
          </div>

          <div className="mt-4">
            <ProgressBar valuePct={progressCompaniesPct} />
          </div>
        </Card>
      </div>

      {/* ===================== INDICADORES YTD (primeiro) ===================== */}
      <Card
        title="Indicadores YTD"
        subtitle={`Período: ${yearStart} → ${ytdEnd} (meta proporcional ao ano, até hoje)`}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Linha 1 */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Vendas YTD</div>
              </div>
              <Pill>YTD</Pill>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Vendas (qtd)</div>
                <div className="mt-1 text-3xl font-semibold">{companiesYTD}</div>
                <div className="mt-2 text-sm text-slate-400">
                  Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalSalesQty)}</span>
                </div>
                <div className="mt-2">{deltaPill(companiesYTD, Math.round(ytdGoalSalesQty))}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Vendas (R$)</div>
                <div className="mt-1 text-3xl font-semibold">{brl(soldValueYTD)}</div>
                <div className="mt-2 text-sm text-slate-400">
                  Meta YTD: <span className="text-slate-200">{brl(ytdGoalRevenue)}</span>
                </div>
                <div className="mt-2">{deltaPill(soldValueYTD, ytdGoalRevenue)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">Reuniões marcadas YTD</div>
            <div className="mt-2 text-3xl font-semibold">{meetingsBookedYTD}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsBooked)}</span>
            </div>
            <div className="mt-3">{deltaPill(meetingsBookedYTD, ytdGoalMeetingsBooked)}</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">Show-rate YTD</div>
            <div className="mt-2 text-3xl font-semibold">{pctFmt(showRateYTDPct)}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
            </div>
            <div className="mt-3">{deltaPill(showRateYTDPct, GOALS_2026.showRatePct)}</div>
          </div>

          {/* Linha 2 */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Custo por venda YTD</div>
              </div>
              <Pill>YTD</Pill>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Custo por venda (total)</div>
                <div className="mt-1 text-3xl font-semibold">{brl(costPerSaleYTDTotal)}</div>
                <div className="mt-2 text-sm text-slate-400">
                  Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
                </div>
                <div className="mt-2">{deltaPill(costPerSaleYTDTotal, GOALS_2026.costPerSale)}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Por perfil</div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Harley</span>
                  <span className="font-semibold">{brl(costPerSaleYTDHarley)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Giovanni</span>
                  <span className="font-semibold">{brl(costPerSaleYTDGio)}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {deltaPill(costPerSaleYTDHarley, GOALS_2026.costPerSale)}
                  {deltaPill(costPerSaleYTDGio, GOALS_2026.costPerSale)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">Reuniões realizadas YTD</div>
            <div className="mt-2 text-3xl font-semibold">{meetingsHeldYTD}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsHeld)}</span>
            </div>
            <div className="mt-3">{deltaPill(meetingsHeldYTD, ytdGoalMeetingsHeld)}</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">% Renovações YTD</div>
            <div className="mt-2 text-3xl font-semibold">{pctFmt(renewalsYTDPct)}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-3">{deltaPill(renewalsYTDPct, GOALS_2026.renewalsPct)}</div>
          </div>
        </div>
      </Card>

      {/* ===================== INDICADORES DO MÊS (depois) ===================== */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Linha 1 */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Vendas do mês</div>
              </div>
              <Pill>Mês</Pill>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Vendas (qtd)</div>
                <div className="mt-1 text-3xl font-semibold">{monthSalesQty}</div>
                <div className="mt-2 text-sm text-slate-400">
                  Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSalesQty)}</span>
                </div>
                <div className="mt-2">{deltaPill(monthSalesQty, Math.round(monthGoalSalesQty))}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Vendas (R$)</div>
                <div className="mt-1 text-3xl font-semibold">{brl(monthSalesValue)}</div>
                <div className="mt-2 text-sm text-slate-400">
                  Meta do mês: <span className="text-slate-200">{brl(monthGoalRevenue)}</span>
                </div>
                <div className="mt-2">{deltaPill(monthSalesValue, monthGoalRevenue)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">Reuniões marcadas</div>
            <div className="mt-2 text-3xl font-semibold">{meetingsBookedMonth}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{monthGoalMeetingsBooked}</span>
            </div>
            <div className="mt-3">{deltaPill(meetingsBookedMonth, monthGoalMeetingsBooked)}</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">Reuniões realizadas</div>
            <div className="mt-2 text-3xl font-semibold">{meetingsHeldMonth}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{monthGoalMeetingsHeld}</span>
            </div>
            <div className="mt-3">{deltaPill(meetingsHeldMonth, monthGoalMeetingsHeld)}</div>
          </div>

          {/* Linha 2 */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Custo por venda (mês)</div>
              </div>
              <Pill>Mês</Pill>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Custo por venda (total)</div>
                <div className="mt-1 text-3xl font-semibold">{brl(costPerSaleMonthTotal)}</div>
                <div className="mt-2 text-sm text-slate-400">
                  Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
                </div>
                <div className="mt-2">{deltaPill(costPerSaleMonthTotal, GOALS_2026.costPerSale)}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Por perfil</div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Harley</span>
                  <span className="font-semibold">{brl(costPerSaleMonthHarley)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Giovanni</span>
                  <span className="font-semibold">{brl(costPerSaleMonthGio)}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {deltaPill(costPerSaleMonthHarley, GOALS_2026.costPerSale)}
                  {deltaPill(costPerSaleMonthGio, GOALS_2026.costPerSale)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">Show-rate</div>
            <div className="mt-2 text-3xl font-semibold">{pctFmt(showRateMonthPct)}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
            </div>
            <div className="mt-3">{deltaPill(showRateMonthPct, GOALS_2026.showRatePct)}</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-6">
            <div className="text-sm text-slate-300">% Renovações</div>
            <div className="mt-2 text-3xl font-semibold">{pctFmt(renewalsMonthPct)}</div>
            <div className="mt-3 text-sm text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-3">{deltaPill(renewalsMonthPct, GOALS_2026.renewalsPct)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
