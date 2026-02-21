import React, { useEffect, useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import {
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

function daysBetweenInclusive(startISO: string, endISO: string) {
  const a = new Date(startISO + "T00:00:00");
  const b = new Date(endISO + "T00:00:00");
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(days, 1);
}

function deltaPct(real: number, target: number) {
  return safeDiv((real - target) * 100, target);
}
function deltaPill(real: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return <Pill>—</Pill>;
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  return <Pill>{`${sign}${d.toFixed(1)}%`}</Pill>;
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

// status helpers (suporta legado pra não “quebrar” base antiga)
function isNoShow(status: string) {
  return status === "no_show" || status === "no-show" || status === "noShow";
}
function isSale(status: string) {
  return status === "venda";
}
function isRealized(status: string) {
  // novo: "reuniao_realizada" (se existir), legado: "realizou"
  // regra: venda conta como realizada também
  return status === "reuniao_realizada" || status === "realizou" || status === "realizada" || status === "venda";
}

export default function MetaGlobalPage() {
  const year = 2026;
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaMonthRows, setMetaMonthRows] = useState<any[]>([]);
  const [metaYtdRows, setMetaYtdRows] = useState<any[]>([]);
  const [dailyHarleyMonth, setDailyHarleyMonth] = useState<any[]>([]);
  const [dailyGioMonth, setDailyGioMonth] = useState<any[]>([]);
  const [dailyHarleyYtd, setDailyHarleyYtd] = useState<any[]>([]);
  const [dailyGioYtd, setDailyGioYtd] = useState<any[]>([]);
  const [leadsHarleyAll, setLeadsHarleyAll] = useState<any[]>([]);
  const [leadsGioAll, setLeadsGioAll] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);

  const monthStart = useMemo(() => startOfMonthISO(year, month), [year, month]);
  const monthEnd = useMemo(() => endOfMonthISO(year, month), [year, month]);

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // YTD “até hoje” (se ano atual); se não, fecha no fim do ano
  const ytdEnd = useMemo(() => {
    const t = todayISO();
    if (t < yearStart) return yearStart;
    if (t > yearEnd) return yearEnd;
    return t;
  }, [yearStart, yearEnd]);

  // fração do ano decorrido (pra metas proporcionais)
  const ytdFrac = useMemo(() => {
    const total = daysBetweenInclusive(yearStart, yearEnd);
    const done = daysBetweenInclusive(yearStart, ytdEnd);
    return safeDiv(done, total);
  }, [yearStart, yearEnd, ytdEnd]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // Busca ampla de leads (por created_at) e filtra por lead_date/deal_date aqui no front
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [
        metaMonth,
        metaYtd,
        dhMonth,
        dgMonth,
        dhYtd,
        dgYtd,
        mhAll,
        mgAll,
        cs,
        rn,
      ] = await Promise.all([
        listMetaAds(monthStart, monthEnd),
        listMetaAds(yearStart, ytdEnd),

        listDailyFunnel("harley", monthStart, monthEnd),
        listDailyFunnel("giovanni", monthStart, monthEnd),
        listDailyFunnel("harley", yearStart, ytdEnd),
        listDailyFunnel("giovanni", yearStart, ytdEnd),

        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),

        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setMetaMonthRows(metaMonth ?? []);
      setMetaYtdRows(metaYtd ?? []);
      setDailyHarleyMonth(dhMonth ?? []);
      setDailyGioMonth(dgMonth ?? []);
      setDailyHarleyYtd(dhYtd ?? []);
      setDailyGioYtd(dgYtd ?? []);
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

  // ---------- SALES (por deal_date) ----------
  const salesByProfileMonth = useMemo(() => {
    const pick = (rows: any[], p: Profile) =>
      (rows ?? []).filter((r: any) => {
        if (!isSale(String(r.status))) return false;
        const d = dealDate(r);
        return inRange(d, monthStart, monthEnd);
      });

    return {
      harley: pick(leadsHarleyAll, "harley"),
      giovanni: pick(leadsGioAll, "giovanni"),
    } as Record<Profile, any[]>;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesByProfileYtd = useMemo(() => {
    const pick = (rows: any[]) =>
      (rows ?? []).filter((r: any) => {
        if (!isSale(String(r.status))) return false;
        const d = dealDate(r);
        return inRange(d, yearStart, ytdEnd);
      });

    return {
      harley: pick(leadsHarleyAll),
      giovanni: pick(leadsGioAll),
    } as Record<Profile, any[]>;
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

  const monthSalesQty = useMemo(
    () => salesByProfileMonth.harley.length + salesByProfileMonth.giovanni.length,
    [salesByProfileMonth]
  );
  const ytdSalesQty = useMemo(
    () => salesByProfileYtd.harley.length + salesByProfileYtd.giovanni.length,
    [salesByProfileYtd]
  );

  const monthSalesValue = useMemo(() => {
    const all = [...salesByProfileMonth.harley, ...salesByProfileMonth.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileMonth]);

  const ytdSalesValue = useMemo(() => {
    const all = [...salesByProfileYtd.harley, ...salesByProfileYtd.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileYtd]);

  // ---------- EMPRESAS (definição: 1 venda = 1 empresa) ----------
  const companiesYTD = ytdSalesQty;

  // ---------- MEETINGS BOOKED (fonte: daily_funnel.reuniao) ----------
  const meetingsBookedMonth = useMemo(() => {
    const h = sum((dailyHarleyMonth ?? []).map((r: any) => Number(r.reuniao || 0)));
    const g = sum((dailyGioMonth ?? []).map((r: any) => Number(r.reuniao || 0)));
    return h + g;
  }, [dailyHarleyMonth, dailyGioMonth]);

  const meetingsBookedYTD = useMemo(() => {
    const h = sum((dailyHarleyYtd ?? []).map((r: any) => Number(r.reuniao || 0)));
    const g = sum((dailyGioYtd ?? []).map((r: any) => Number(r.reuniao || 0)));
    return h + g;
  }, [dailyHarleyYtd, dailyGioYtd]);

  // ---------- MEETINGS REALIZED / SHOW-RATE (fonte: meeting_leads.status) ----------
  // regra: venda conta como realizada
  const leadsInMonth = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])];
    return all.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd));
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const leadsInYtd = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])];
    return all.filter((r: any) => inRange(leadDateFallback(r), yearStart, ytdEnd));
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

  const meetingsRealizedMonth = useMemo(() => {
    return leadsInMonth.filter((r: any) => isRealized(String(r.status))).length;
  }, [leadsInMonth]);

  const meetingsRealizedYTD = useMemo(() => {
    return leadsInYtd.filter((r: any) => isRealized(String(r.status))).length;
  }, [leadsInYtd]);

  const showRateMonthPct = useMemo(() => {
    const realized = leadsInMonth.filter((r: any) => isRealized(String(r.status))).length;
    const noShow = leadsInMonth.filter((r: any) => isNoShow(String(r.status))).length;
    const denom = realized + noShow;
    return denom > 0 ? safeDiv(realized * 100, denom) : 0;
  }, [leadsInMonth]);

  const showRateYtdPct = useMemo(() => {
    const realized = leadsInYtd.filter((r: any) => isRealized(String(r.status))).length;
    const noShow = leadsInYtd.filter((r: any) => isNoShow(String(r.status))).length;
    const denom = realized + noShow;
    return denom > 0 ? safeDiv(realized * 100, denom) : 0;
  }, [leadsInYtd]);

  // ---------- RENEWALS (month / YTD) ----------
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

  const renewalsYtdPct = useMemo(() => {
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

  // ---------- ADS SPEND (month / YTD) ----------
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
    for (const r of metaYtdRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaYtdRows]);

  const costPerSaleMonthTotal = useMemo(() => {
    const spendTotal = spendByProfileMonth.harley + spendByProfileMonth.giovanni;
    return monthSalesQty > 0 ? safeDiv(spendTotal, monthSalesQty) : 0;
  }, [spendByProfileMonth, monthSalesQty]);

  const costPerSaleYtdTotal = useMemo(() => {
    const spendTotal = spendByProfileYTD.harley + spendByProfileYTD.giovanni;
    return ytdSalesQty > 0 ? safeDiv(spendTotal, ytdSalesQty) : 0;
  }, [spendByProfileYTD, ytdSalesQty]);

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

  const costPerSaleYtdHarley = useMemo(() => {
    const spend = spendByProfileYTD.harley;
    const sales = salesByProfileYtd.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileYTD, salesByProfileYtd]);

  const costPerSaleYtdGio = useMemo(() => {
    const spend = spendByProfileYTD.giovanni;
    const sales = salesByProfileYtd.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfileYTD, salesByProfileYtd]);

  // ---------- GOALS ----------
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSalesQty = useMemo(() => GOALS_2026.companiesAnnual / 12, []);
  const monthGoalMeetingsBooked = GOALS_2026.meetingsBookedMonthly;
  const monthGoalMeetingsRealized = useMemo(
    () => Math.round((GOALS_2026.meetingsBookedMonthly * GOALS_2026.showRatePct) / 100),
    []
  );

  const ytdGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual * ytdFrac, [ytdFrac]);
  const ytdGoalSalesQty = useMemo(() => GOALS_2026.companiesAnnual * ytdFrac, [ytdFrac]);
  const ytdGoalMeetingsBooked = useMemo(() => GOALS_2026.meetingsBookedMonthly * 12 * ytdFrac, [ytdFrac]);
  const ytdGoalMeetingsRealized = useMemo(
    () => (GOALS_2026.meetingsBookedMonthly * 12 * ytdFrac * GOALS_2026.showRatePct) / 100,
    [ytdFrac]
  );

  // ---------- Top progress (annual) ----------
  const progressRevenuePct = useMemo(
    () => safeDiv(ytdSalesValue * 100, GOALS_2026.revenueAnnual),
    [ytdSalesValue]
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
          <div className="text-sm text-slate-400">Metas do ano + desempenho (dados reais).</div>
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
              value={brl(ytdSalesValue)}
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

      {/* =========================
          INDICADORES YTD (1º)
         ========================= */}
      <Card title="Indicadores YTD" subtitle={`Período: ${yearStart} → ${ytdEnd} (meta proporcional ao ano, até hoje)`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* BIG: Vendas YTD */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Vendas YTD</div>
                <div className="text-xs text-slate-400">Quantidade + valor</div>
              </div>
              <Pill>YTD</Pill>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Vendas (qtd)</div>
                <div className="mt-1 text-2xl font-semibold">{ytdSalesQty}</div>
                <div className="mt-2 text-xs text-slate-400">
                  Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalSalesQty)}</span>
                </div>
                <div className="mt-2">{deltaPill(ytdSalesQty, ytdGoalSalesQty)}</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Vendas (R$)</div>
                <div className="mt-1 text-2xl font-semibold">{brl(ytdSalesValue)}</div>
                <div className="mt-2 text-xs text-slate-400">
                  Meta YTD: <span className="text-slate-200">{brl(ytdGoalRevenue)}</span>
                </div>
                <div className="mt-2">{deltaPill(ytdSalesValue, ytdGoalRevenue)}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs text-slate-400">Progresso do faturamento anual</div>
              <ProgressBar valuePct={progressRevenuePct} />
            </div>
          </div>

          {/* small: Reuniões marcadas YTD (daily_funnel.reuniao) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">Reuniões marcadas YTD</div>
            <div className="mt-1 text-3xl font-semibold">{meetingsBookedYTD}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsBooked)}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsBookedYTD, ytdGoalMeetingsBooked)}</div>
          </div>

          {/* small: Show-rate YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">Show-rate YTD</div>
            <div className="mt-1 text-3xl font-semibold">{pctFmt(showRateYtdPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
            </div>
            <div className="mt-2">{deltaPill(showRateYtdPct, GOALS_2026.showRatePct)}</div>
          </div>

          {/* BIG: Custo por venda YTD */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Custo por venda YTD</div>
                <div className="text-xs text-slate-400">Meta Ads / vendas</div>
              </div>
              <Pill>YTD</Pill>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Custo por venda (total)</div>
                <div className="mt-1 text-2xl font-semibold">{brl(costPerSaleYtdTotal)}</div>
                <div className="mt-2 text-xs text-slate-400">
                  Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
                </div>
                <div className="mt-2">{deltaPill(costPerSaleYtdTotal, GOALS_2026.costPerSale)}</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Por perfil</div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">Harley</div>
                  <div className="text-sm font-semibold">{brl(costPerSaleYtdHarley)}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">Giovanni</div>
                  <div className="text-sm font-semibold">{brl(costPerSaleYtdGio)}</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {deltaPill(costPerSaleYtdHarley, GOALS_2026.costPerSale)}
                  {deltaPill(costPerSaleYtdGio, GOALS_2026.costPerSale)}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs text-slate-400">Custo vs meta (quanto menor, melhor)</div>
              {/* “progresso” invertido: se custo <= meta, 100%. Se acima, cai. */}
              <ProgressBar valuePct={GOALS_2026.costPerSale > 0 ? safeDiv(GOALS_2026.costPerSale * 100, costPerSaleYtdTotal || 1) : 0} />
            </div>
          </div>

          {/* small: Reuniões realizadas YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">Reuniões realizadas YTD</div>
            <div className="mt-1 text-3xl font-semibold">{meetingsRealizedYTD}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsRealized)}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsRealizedYTD, ytdGoalMeetingsRealized)}</div>
          </div>

          {/* small: % Renovações YTD */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">% Renovações YTD</div>
            <div className="mt-1 text-3xl font-semibold">{pctFmt(renewalsYtdPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(renewalsYtdPct, GOALS_2026.renewalsPct)}</div>
          </div>
        </div>
      </Card>

      {/* =========================
          INDICADORES DO MÊS (2º)
         ========================= */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* BIG: Vendas do mês */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Vendas do mês</div>
                <div className="text-xs text-slate-400">Quantidade + valor</div>
              </div>
              <Pill>Mês</Pill>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Vendas (qtd)</div>
                <div className="mt-1 text-2xl font-semibold">{monthSalesQty}</div>
                <div className="mt-2 text-xs text-slate-400">
                  Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSalesQty)}</span>
                </div>
                <div className="mt-2">{deltaPill(monthSalesQty, monthGoalSalesQty)}</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Vendas (R$)</div>
                <div className="mt-1 text-2xl font-semibold">{brl(monthSalesValue)}</div>
                <div className="mt-2 text-xs text-slate-400">
                  Meta do mês: <span className="text-slate-200">{brl(monthGoalRevenue)}</span>
                </div>
                <div className="mt-2">{deltaPill(monthSalesValue, monthGoalRevenue)}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs text-slate-400">Progresso da meta de faturamento do mês</div>
              <ProgressBar valuePct={safeDiv(monthSalesValue * 100, monthGoalRevenue)} />
            </div>
          </div>

          {/* small: Reuniões marcadas (daily_funnel.reuniao) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">Reuniões marcadas</div>
            <div className="mt-1 text-3xl font-semibold">{meetingsBookedMonth}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{monthGoalMeetingsBooked}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsBookedMonth, monthGoalMeetingsBooked)}</div>
          </div>

          {/* small: Reuniões realizadas (status) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">Reuniões realizadas</div>
            <div className="mt-1 text-3xl font-semibold">{meetingsRealizedMonth}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{monthGoalMeetingsRealized}</span>
            </div>
            <div className="mt-2">{deltaPill(meetingsRealizedMonth, monthGoalMeetingsRealized)}</div>
          </div>

          {/* BIG: Custo por venda (mês) */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Custo por venda (mês)</div>
                <div className="text-xs text-slate-400">Meta Ads / vendas</div>
              </div>
              <Pill>Mês</Pill>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Custo por venda (total)</div>
                <div className="mt-1 text-2xl font-semibold">{brl(costPerSaleMonthTotal)}</div>
                <div className="mt-2 text-xs text-slate-400">
                  Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
                </div>
                <div className="mt-2">{deltaPill(costPerSaleMonthTotal, GOALS_2026.costPerSale)}</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
                <div className="text-xs text-slate-400">Por perfil</div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">Harley</div>
                  <div className="text-sm font-semibold">{brl(costPerSaleMonthHarley)}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">Giovanni</div>
                  <div className="text-sm font-semibold">{brl(costPerSaleMonthGio)}</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {deltaPill(costPerSaleMonthHarley, GOALS_2026.costPerSale)}
                  {deltaPill(costPerSaleMonthGio, GOALS_2026.costPerSale)}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs text-slate-400">Custo vs meta (quanto menor, melhor)</div>
              <ProgressBar
                valuePct={
                  GOALS_2026.costPerSale > 0
                    ? safeDiv(GOALS_2026.costPerSale * 100, costPerSaleMonthTotal || 1)
                    : 0
                }
              />
            </div>
          </div>

          {/* small: Show-rate */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">Show-rate</div>
            <div className="mt-1 text-3xl font-semibold">{pctFmt(showRateMonthPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
            </div>
            <div className="mt-2">{deltaPill(showRateMonthPct, GOALS_2026.showRatePct)}</div>
          </div>

          {/* small: % Renovações */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-6 py-5">
            <div className="text-xs text-slate-400">% Renovações</div>
            <div className="mt-1 text-3xl font-semibold">{pctFmt(renewalsMonthPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(renewalsMonthPct, GOALS_2026.renewalsPct)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
