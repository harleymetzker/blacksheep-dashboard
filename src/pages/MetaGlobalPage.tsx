// src/pages/MetaGlobalPage.tsx
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

function daysInYear(year: number) {
  const a = new Date(year, 0, 1);
  const b = new Date(year + 1, 0, 1);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function dayOfYear(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1; // 1..365/366
}

function deltaPct(real: number, target: number) {
  return safeDiv((real - target) * 100, target);
}
function DeltaPill({
  real,
  target,
  disabled,
}: {
  real: number;
  target: number;
  disabled?: boolean;
}) {
  if (disabled || !Number.isFinite(target) || target === 0) return <Pill>—</Pill>;
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  return <Pill>{`${sign}${d.toFixed(1)}%`}</Pill>;
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

// Barra simples
function ProgressBar({ valuePct, label }: { valuePct: number; label?: string }) {
  const v = clampPct(valuePct);
  return (
    <div className="w-full">
      {label ? <div className="mb-2 text-xs text-slate-400">{label}</div> : null}
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

// status helpers (aceita legado + novo)
function isSaleStatus(s: any) {
  return String(s) === "venda";
}
function isNoShowStatus(s: any) {
  return String(s) === "no_show";
}
function isRealizedStatus(s: any) {
  const v = String(s);
  return v === "realizou" || v === "reuniao_realizada";
}
// reunião realizada (para show-rate) inclui venda
function isShowStatus(s: any) {
  return isRealizedStatus(s) || isSaleStatus(s);
}

function MetricSmallCard(props: {
  title: string;
  value: React.ReactNode;
  metaLine?: React.ReactNode;
  delta?: React.ReactNode;
  rightTag?: React.ReactNode;
}) {
  const { title, value, metaLine, delta, rightTag } = props;
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-slate-400">{title}</div>
        {rightTag ? rightTag : null}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-2 text-xs text-slate-400">{metaLine ?? <span>&nbsp;</span>}</div>
      <div className="mt-2">{delta ?? <Pill>—</Pill>}</div>
    </div>
  );
}

function MetricBigCard(props: {
  title: string;
  tag: string; // "Mês" | "YTD"
  subtitle?: string;
  leftLabel: string;
  leftValue: React.ReactNode;
  leftMeta?: React.ReactNode;
  leftDelta?: React.ReactNode;
  rightLabel: string;
  rightValue: React.ReactNode;
  rightMeta?: React.ReactNode;
  rightDelta?: React.ReactNode;
  progressLabel: string;
  progressPct: number;
}) {
  const {
    title,
    tag,
    subtitle,
    leftLabel,
    leftValue,
    leftMeta,
    leftDelta,
    rightLabel,
    rightValue,
    rightMeta,
    rightDelta,
    progressLabel,
    progressPct,
  } = props;

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-400">{subtitle}</div> : null}
        </div>
        <Pill>{tag}</Pill>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-4 py-4">
          <div className="text-xs text-slate-400">{leftLabel}</div>
          <div className="mt-1 text-2xl font-semibold">{leftValue}</div>
          <div className="mt-2 text-xs text-slate-400">{leftMeta ?? <span>&nbsp;</span>}</div>
          <div className="mt-2">{leftDelta ?? <Pill>—</Pill>}</div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-4 py-4">
          <div className="text-xs text-slate-400">{rightLabel}</div>
          <div className="mt-1 text-2xl font-semibold">{rightValue}</div>
          <div className="mt-2 text-xs text-slate-400">{rightMeta ?? <span>&nbsp;</span>}</div>
          <div className="mt-2">{rightDelta ?? <Pill>—</Pill>}</div>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar valuePct={progressPct} label={progressLabel} />
      </div>
    </div>
  );
}

export default function MetaGlobalPage() {
  const year = 2026;
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [leadsHarleyAll, setLeadsHarleyAll] = useState<any[]>([]);
  const [leadsGioAll, setLeadsGioAll] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);

  const [metaMonthRows, setMetaMonthRows] = useState<any[]>([]);
  const [metaYearRows, setMetaYearRows] = useState<any[]>([]);

  const [dailyHarleyYear, setDailyHarleyYear] = useState<any[]>([]);
  const [dailyGioYear, setDailyGioYear] = useState<any[]>([]);

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

  const ytdDays = useMemo(() => {
    const total = daysInYear(year);
    const elapsed = dayOfYear(ytdEnd);
    return { elapsed, total, frac: safeDiv(elapsed, total) };
  }, [year, ytdEnd]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [mhAll, mgAll, cs, rn, metaM, metaY, dhY, dgY] = await Promise.all([
        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),
        listOpsCustomers(),
        listOpsCustomerRenewals(),
        listMetaAds(monthStart, monthEnd),
        listMetaAds(yearStart, yearEnd),
        listDailyFunnel("harley", yearStart, yearEnd),
        listDailyFunnel("giovanni", yearStart, yearEnd),
      ]);

      setLeadsHarleyAll(mhAll ?? []);
      setLeadsGioAll(mgAll ?? []);
      setCustomers(cs ?? []);
      setRenewals(rn ?? []);
      setMetaMonthRows(metaM ?? []);
      setMetaYearRows(metaY ?? []);
      setDailyHarleyYear(dhY ?? []);
      setDailyGioYear(dgY ?? []);
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

  // ---------------- SALES (deal_date) ----------------
  const salesByProfileMonth = useMemo(() => {
    const pick = (rows: any[]) =>
      (rows ?? []).filter((r: any) => isSaleStatus(r.status) && inRange(dealDate(r), monthStart, monthEnd));

    return {
      harley: pick(leadsHarleyAll),
      giovanni: pick(leadsGioAll),
    } as Record<Profile, any[]>;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesByProfileYTD = useMemo(() => {
    const pick = (rows: any[]) =>
      (rows ?? []).filter((r: any) => isSaleStatus(r.status) && inRange(dealDate(r), yearStart, ytdEnd));

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

  const ytdSalesQty = useMemo(
    () => salesByProfileYTD.harley.length + salesByProfileYTD.giovanni.length,
    [salesByProfileYTD]
  );

  const ytdSalesValue = useMemo(() => {
    const all = [...salesByProfileYTD.harley, ...salesByProfileYTD.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileYTD]);

  // 1 venda = 1 empresa
  const companiesYTD = useMemo(() => ytdSalesQty, [ytdSalesQty]);

  // ---------------- DAILY FUNNEL (source of meetings booked/realized) ----------------
  // “Reuniões marcadas” = soma daily_funnel.reuniao (ambos perfis)
  // “Reuniões realizadas” = soma daily_funnel.proposta (ambos perfis)
  const dailyAllYear = useMemo(() => [...(dailyHarleyYear ?? []), ...(dailyGioYear ?? [])], [dailyHarleyYear, dailyGioYear]);

  const meetingsBookedMonth = useMemo(() => {
    return dailyAllYear
      .filter((r: any) => inRange(iso10(r.day), monthStart, monthEnd))
      .reduce((acc: number, r: any) => acc + Number(r.reuniao || 0), 0);
  }, [dailyAllYear, monthStart, monthEnd]);

  const meetingsRealizedMonth = useMemo(() => {
    return dailyAllYear
      .filter((r: any) => inRange(iso10(r.day), monthStart, monthEnd))
      .reduce((acc: number, r: any) => acc + Number(r.proposta || 0), 0);
  }, [dailyAllYear, monthStart, monthEnd]);

  const meetingsBookedYTD = useMemo(() => {
    return dailyAllYear
      .filter((r: any) => inRange(iso10(r.day), yearStart, ytdEnd))
      .reduce((acc: number, r: any) => acc + Number(r.reuniao || 0), 0);
  }, [dailyAllYear, yearStart, ytdEnd]);

  const meetingsRealizedYTD = useMemo(() => {
    return dailyAllYear
      .filter((r: any) => inRange(iso10(r.day), yearStart, ytdEnd))
      .reduce((acc: number, r: any) => acc + Number(r.proposta || 0), 0);
  }, [dailyAllYear, yearStart, ytdEnd]);

  // ---------------- SHOW-RATE (by meeting_leads statuses) ----------------
  // show-rate = (realizou + venda) / (realizou + venda + no_show)
  const showRateMonthPct = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), monthStart, monthEnd)
    );

    const show = all.filter((r: any) => isShowStatus(r.status)).length;
    const noShow = all.filter((r: any) => isNoShowStatus(r.status)).length;
    const denom = show + noShow;

    return denom > 0 ? safeDiv(show * 100, denom) : NaN;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const showRateYTDPct = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), yearStart, ytdEnd)
    );

    const show = all.filter((r: any) => isShowStatus(r.status)).length;
    const noShow = all.filter((r: any) => isNoShowStatus(r.status)).length;
    const denom = show + noShow;

    return denom > 0 ? safeDiv(show * 100, denom) : NaN;
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

  // ---------------- RENEWALS ----------------
  function renewalsPctForRange(start: string, end: string) {
    const dueCustomers = (customers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), start, end));
    const dueIds = new Set(dueCustomers.map((c: any) => String(c.id)));

    const renewedIds = new Set<string>();
    for (const r of renewals ?? []) {
      const payDate = iso10((r as any).renewal_date);
      if (!inRange(payDate, start, end)) continue;

      const cid = String((r as any).customer_id ?? "");
      if (cid && dueIds.has(cid)) renewedIds.add(cid);
    }

    if (dueIds.size === 0) return { pct: NaN, base: 0, renewed: 0 };
    return { pct: safeDiv(renewedIds.size * 100, dueIds.size), base: dueIds.size, renewed: renewedIds.size };
  }

  const renewalsMonth = useMemo(() => renewalsPctForRange(monthStart, monthEnd), [customers, renewals, monthStart, monthEnd]);
  const renewalsYTD = useMemo(() => renewalsPctForRange(yearStart, ytdEnd), [customers, renewals, yearStart, ytdEnd]);

  // ---------------- ADS SPEND ----------------
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
    for (const r of metaYearRows ?? []) {
      // meta_ads_entries tem start/end; aqui a lista veio do ano inteiro.
      // se quiser refinar por data depois, filtramos por start_date/end_date no DB. por ora, ok.
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaYearRows]);

  const costPerSaleMonthHarley = useMemo(() => {
    const spend = spendByProfileMonth.harley;
    const sales = salesByProfileMonth.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : NaN;
  }, [spendByProfileMonth, salesByProfileMonth]);

  const costPerSaleMonthGio = useMemo(() => {
    const spend = spendByProfileMonth.giovanni;
    const sales = salesByProfileMonth.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : NaN;
  }, [spendByProfileMonth, salesByProfileMonth]);

  const costPerSaleYTDTot = useMemo(() => {
    const spendTot = spendByProfileYTD.harley + spendByProfileYTD.giovanni;
    return ytdSalesQty > 0 ? safeDiv(spendTot, ytdSalesQty) : NaN;
  }, [spendByProfileYTD, ytdSalesQty]);

  const costPerSaleYTDHarley = useMemo(() => {
    const spend = spendByProfileYTD.harley;
    const sales = salesByProfileYTD.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : NaN;
  }, [spendByProfileYTD, salesByProfileYTD]);

  const costPerSaleYTDGio = useMemo(() => {
    const spend = spendByProfileYTD.giovanni;
    const sales = salesByProfileYTD.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : NaN;
  }, [spendByProfileYTD, salesByProfileYTD]);

  const costPerSaleMonthTot = useMemo(() => {
    const spendTot = spendByProfileMonth.harley + spendByProfileMonth.giovanni;
    return monthSalesQty > 0 ? safeDiv(spendTot, monthSalesQty) : NaN;
  }, [spendByProfileMonth, monthSalesQty]);

  // ---------------- GOALS ----------------
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);

  const monthGoalMeetingsBooked = GOALS_2026.meetingsBookedMonthly;
  const monthGoalMeetingsRealized = Math.round(GOALS_2026.meetingsBookedMonthly * (GOALS_2026.showRatePct / 100));

  const ytdGoalSales = useMemo(() => GOALS_2026.companiesAnnual * ytdDays.frac, [ytdDays.frac]);
  const ytdGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual * ytdDays.frac, [ytdDays.frac]);

  const annualMeetingsBooked = GOALS_2026.meetingsBookedMonthly * 12;
  const annualMeetingsRealized = annualMeetingsBooked * (GOALS_2026.showRatePct / 100);

  const ytdGoalMeetingsBooked = useMemo(() => annualMeetingsBooked * ytdDays.frac, [ytdDays.frac]);
  const ytdGoalMeetingsRealized = useMemo(() => annualMeetingsRealized * ytdDays.frac, [ytdDays.frac]);

  // ---------------- TOP PROGRESS ----------------
  const progressRevenuePct = useMemo(
    () => safeDiv(ytdSalesValue * 100, GOALS_2026.revenueAnnual),
    [ytdSalesValue]
  );
  const progressCompaniesPct = useMemo(
    () => safeDiv(companiesYTD * 100, GOALS_2026.companiesAnnual),
    [companiesYTD]
  );

  // ---------------- UI ----------------
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
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{err}</div>
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
              hint={`Meta YTD (proporcional): ${Math.round(ytdGoalSales)} vendas`}
            />
            <Stat label="Progresso anual" value={pctFmt(progressCompaniesPct)} hint="1 venda = 1 empresa" />
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {/* Linha 1: card grande + 2 pequenos */}
          <div className="lg:col-span-2">
            <MetricBigCard
              title="Vendas YTD"
              tag="YTD"
              subtitle="Quantidade + valor (deal_date)."
              leftLabel="Vendas (qtd)"
              leftValue={ytdSalesQty}
              leftMeta={
                <>
                  Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalSales)}</span>
                </>
              }
              leftDelta={<DeltaPill real={ytdSalesQty} target={Math.round(ytdGoalSales)} />}
              rightLabel="Vendas (R$)"
              rightValue={brl(ytdSalesValue)}
              rightMeta={
                <>
                  Meta YTD: <span className="text-slate-200">{brl(ytdGoalRevenue)}</span>
                </>
              }
              rightDelta={<DeltaPill real={ytdSalesValue} target={ytdGoalRevenue} />}
              progressLabel="Progresso do faturamento anual"
              progressPct={safeDiv(ytdSalesValue * 100, GOALS_2026.revenueAnnual)}
            />
          </div>

          <div>
            <MetricSmallCard
              title="Reuniões marcadas YTD"
              value={meetingsBookedYTD}
              metaLine={
                <>
                  Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsBooked)}</span>
                </>
              }
              delta={<DeltaPill real={meetingsBookedYTD} target={ytdGoalMeetingsBooked} />}
            />
          </div>

          <div>
            <MetricSmallCard
              title="Reuniões realizadas YTD"
              value={meetingsRealizedYTD}
              metaLine={
                <>
                  Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsRealized)}</span>
                </>
              }
              delta={<DeltaPill real={meetingsRealizedYTD} target={ytdGoalMeetingsRealized} />}
            />
          </div>

          {/* Linha 2: card grande + 2 pequenos */}
          <div className="lg:col-span-2">
            <MetricBigCard
              title="Custo por venda YTD"
              tag="YTD"
              subtitle="Meta Ads (spend) / vendas (deal_date)."
              leftLabel="Custo por venda (total)"
              leftValue={Number.isFinite(costPerSaleYTDTot) ? brl(costPerSaleYTDTot) : "—"}
              leftMeta={
                <>
                  Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
                </>
              }
              leftDelta={<DeltaPill real={Number.isFinite(costPerSaleYTDTot) ? costPerSaleYTDTot : 0} target={GOALS_2026.costPerSale} disabled={!Number.isFinite(costPerSaleYTDTot)} />}
              rightLabel="Por perfil"
              rightValue={
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">Harley</div>
                    <div className="text-sm font-semibold">
                      {Number.isFinite(costPerSaleYTDHarley) ? brl(costPerSaleYTDHarley) : "—"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">Giovanni</div>
                    <div className="text-sm font-semibold">
                      {Number.isFinite(costPerSaleYTDGio) ? brl(costPerSaleYTDGio) : "—"}
                    </div>
                  </div>
                </div>
              }
              rightMeta={
                <div className="flex flex-wrap gap-2">
                  <DeltaPill
                    real={Number.isFinite(costPerSaleYTDHarley) ? costPerSaleYTDHarley : 0}
                    target={GOALS_2026.costPerSale}
                    disabled={!Number.isFinite(costPerSaleYTDHarley)}
                  />
                  <DeltaPill
                    real={Number.isFinite(costPerSaleYTDGio) ? costPerSaleYTDGio : 0}
                    target={GOALS_2026.costPerSale}
                    disabled={!Number.isFinite(costPerSaleYTDGio)}
                  />
                </div>
              }
              rightDelta={null}
              progressLabel="Custo vs meta (quanto menor, melhor)"
              progressPct={Number.isFinite(costPerSaleYTDTot) ? safeDiv(GOALS_2026.costPerSale * 100, costPerSaleYTDTot) : 0}
            />
          </div>

          <div>
            <MetricSmallCard
              title="Show-rate YTD"
              value={Number.isFinite(showRateYTDPct) ? pctFmt(showRateYTDPct) : "—"}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
                </>
              }
              delta={
                <DeltaPill
                  real={Number.isFinite(showRateYTDPct) ? showRateYTDPct : 0}
                  target={GOALS_2026.showRatePct}
                  disabled={!Number.isFinite(showRateYTDPct)}
                />
              }
            />
          </div>

          <div>
            <MetricSmallCard
              title="% Renovações YTD"
              value={Number.isFinite(renewalsYTD.pct) ? pctFmt(renewalsYTD.pct) : "—"}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>{" "}
                  <span className="text-slate-500">
                    (base: {renewalsYTD.base} • renovou: {renewalsYTD.renewed})
                  </span>
                </>
              }
              delta={
                <DeltaPill
                  real={Number.isFinite(renewalsYTD.pct) ? renewalsYTD.pct : 0}
                  target={GOALS_2026.renewalsPct}
                  disabled={!Number.isFinite(renewalsYTD.pct)}
                />
              }
            />
          </div>
        </div>
      </Card>

      {/* ===================== INDICADORES DO MÊS (depois) ===================== */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {/* Linha 1: card grande + 2 pequenos */}
          <div className="lg:col-span-2">
            <MetricBigCard
              title="Vendas do mês"
              tag="Mês"
              subtitle="Quantidade + valor (deal_date)."
              leftLabel="Vendas (qtd)"
              leftValue={monthSalesQty}
              leftMeta={
                <>
                  Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSales)}</span>
                </>
              }
              leftDelta={<DeltaPill real={monthSalesQty} target={Math.round(monthGoalSales)} />}
              rightLabel="Vendas (R$)"
              rightValue={brl(monthSalesValue)}
              rightMeta={
                <>
                  Meta do mês: <span className="text-slate-200">{brl(monthGoalRevenue)}</span>
                </>
              }
              rightDelta={<DeltaPill real={monthSalesValue} target={monthGoalRevenue} />}
              progressLabel="Progresso da meta de faturamento do mês"
              progressPct={safeDiv(monthSalesValue * 100, monthGoalRevenue)}
            />
          </div>

          <div>
            <MetricSmallCard
              title="Reuniões marcadas"
              value={meetingsBookedMonth}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{monthGoalMeetingsBooked}</span>
                </>
              }
              delta={<DeltaPill real={meetingsBookedMonth} target={monthGoalMeetingsBooked} />}
            />
          </div>

          <div>
            <MetricSmallCard
              title="Reuniões realizadas"
              value={meetingsRealizedMonth}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{monthGoalMeetingsRealized}</span>
                </>
              }
              delta={<DeltaPill real={meetingsRealizedMonth} target={monthGoalMeetingsRealized} />}
            />
          </div>

          {/* Linha 2: card grande + 2 pequenos */}
          <div className="lg:col-span-2">
            <MetricBigCard
              title="Custo por venda (mês)"
              tag="Mês"
              subtitle="Meta Ads (spend) / vendas (deal_date)."
              leftLabel="Custo por venda (total)"
              leftValue={Number.isFinite(costPerSaleMonthTot) ? brl(costPerSaleMonthTot) : "—"}
              leftMeta={
                <>
                  Meta: <span className="text-slate-200">{brl(GOALS_2026.costPerSale)}</span>
                </>
              }
              leftDelta={
                <DeltaPill
                  real={Number.isFinite(costPerSaleMonthTot) ? costPerSaleMonthTot : 0}
                  target={GOALS_2026.costPerSale}
                  disabled={!Number.isFinite(costPerSaleMonthTot)}
                />
              }
              rightLabel="Por perfil"
              rightValue={
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">Harley</div>
                    <div className="text-sm font-semibold">
                      {Number.isFinite(costPerSaleMonthHarley) ? brl(costPerSaleMonthHarley) : "—"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">Giovanni</div>
                    <div className="text-sm font-semibold">
                      {Number.isFinite(costPerSaleMonthGio) ? brl(costPerSaleMonthGio) : "—"}
                    </div>
                  </div>
                </div>
              }
              rightMeta={
                <div className="flex flex-wrap gap-2">
                  <DeltaPill
                    real={Number.isFinite(costPerSaleMonthHarley) ? costPerSaleMonthHarley : 0}
                    target={GOALS_2026.costPerSale}
                    disabled={!Number.isFinite(costPerSaleMonthHarley)}
                  />
                  <DeltaPill
                    real={Number.isFinite(costPerSaleMonthGio) ? costPerSaleMonthGio : 0}
                    target={GOALS_2026.costPerSale}
                    disabled={!Number.isFinite(costPerSaleMonthGio)}
                  />
                </div>
              }
              rightDelta={null}
              progressLabel="Custo vs meta (quanto menor, melhor)"
              progressPct={Number.isFinite(costPerSaleMonthTot) ? safeDiv(GOALS_2026.costPerSale * 100, costPerSaleMonthTot) : 0}
            />
          </div>

          <div>
            <MetricSmallCard
              title="Show-rate"
              value={Number.isFinite(showRateMonthPct) ? pctFmt(showRateMonthPct) : "—"}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
                </>
              }
              delta={
                <DeltaPill
                  real={Number.isFinite(showRateMonthPct) ? showRateMonthPct : 0}
                  target={GOALS_2026.showRatePct}
                  disabled={!Number.isFinite(showRateMonthPct)}
                />
              }
            />
          </div>

          <div>
            <MetricSmallCard
              title="% Renovações"
              value={Number.isFinite(renewalsMonth.pct) ? pctFmt(renewalsMonth.pct) : "—"}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>{" "}
                  <span className="text-slate-500">
                    (base: {renewalsMonth.base} • renovou: {renewalsMonth.renewed})
                  </span>
                </>
              }
              delta={
                <DeltaPill
                  real={Number.isFinite(renewalsMonth.pct) ? renewalsMonth.pct : 0}
                  target={GOALS_2026.renewalsPct}
                  disabled={!Number.isFinite(renewalsMonth.pct)}
                />
              }
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
