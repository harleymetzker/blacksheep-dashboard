import React, { useEffect, useMemo, useState } from "react";
import { Card, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import { listMeetingLeads, listMetaAds, listOpsCustomers, listOpsCustomerRenewals } from "../lib/db";
import { Profile } from "../lib/utils";

// ====== CONFIG FIXA (2026) ======
const GOALS_2026 = {
  revenueAnnual: 1_000_000, // R$ 1 mi
  companiesAnnual: 125, // 125 empresas (1 venda = 1 empresa)
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
function deltaPillMaybe(real: number, target: number, enabled: boolean) {
  if (!enabled || !Number.isFinite(real) || !Number.isFinite(target) || target === 0) return <Pill>—</Pill>;
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  return <Pill>{`${sign}${d.toFixed(1)}%`}</Pill>;
}

function daysInYear(year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  return Math.round((+end - +start) / 86400000);
}
function dayOfYearIndex(iso: string) {
  // retorna 1..366 (aprox)
  const d = new Date(iso + "T00:00:00");
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((+d - +start) / 86400000) + 1;
}

function SmallMetric(props: {
  title: string;
  value: React.ReactNode;
  metaLine: React.ReactNode;
  delta: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
      <div className="text-xs text-slate-400">{props.title}</div>
      <div className="mt-1 text-3xl font-semibold">{props.value}</div>
      <div className="mt-2 text-xs text-slate-400">{props.metaLine}</div>
      <div className="mt-2">{props.delta}</div>
    </div>
  );
}

function BigMetricShell(props: { title: string; tag: "YTD" | "Mês"; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/20">
      <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-slate-800/70">
        <div>
          <div className="text-base font-semibold">{props.title}</div>
          {props.subtitle ? <div className="text-sm text-slate-400 mt-1">{props.subtitle}</div> : null}
        </div>
        <Pill>{props.tag}</Pill>
      </div>
      <div className="px-6 py-5">{props.children}</div>
    </div>
  );
}

export default function MetaGlobalPage() {
  const year = 2026;
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaMonthRows, setMetaMonthRows] = useState<any[]>([]);
  const [metaYtdRows, setMetaYtdRows] = useState<any[]>([]);
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
    return t <= yearEnd ? t : yearEnd;
  }, [yearEnd]);

  const ytdFactor = useMemo(() => {
    const total = daysInYear(year);
    const elapsed = Math.min(dayOfYearIndex(ytdEnd), total);
    return safeDiv(elapsed, total); // 0..1
  }, [year, ytdEnd]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // p/ leads: busca ampla e filtra no front (por lead_date e deal_date)
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [metaM, metaY, mhAll, mgAll, cs, rn] = await Promise.all([
        listMetaAds(monthStart, monthEnd),
        listMetaAds(yearStart, ytdEnd),
        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),
        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setMetaMonthRows(metaM ?? []);
      setMetaYtdRows(metaY ?? []);
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

  // ====== STATUS (novo padrão)
  // status válidos: "reuniao_realizada", "no_show", "venda"
  // (mantive compatibilidade silenciosa com "realizou" caso exista dado antigo perdido)
  const isMeetingDone = (s: any) => String(s) === "reuniao_realizada" || String(s) === "realizou";
  const isNoShow = (s: any) => String(s) === "no_show";
  const isSale = (s: any) => String(s) === "venda";

  const allLeads = useMemo(() => [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])], [leadsHarleyAll, leadsGioAll]);

  // ====== SALES (deal_date)
  const salesMonth = useMemo(
    () => allLeads.filter((r: any) => isSale(r.status) && inRange(dealDate(r), monthStart, monthEnd)),
    [allLeads, monthStart, monthEnd]
  );
  const salesYTD = useMemo(
    () => allLeads.filter((r: any) => isSale(r.status) && inRange(dealDate(r), yearStart, ytdEnd)),
    [allLeads, yearStart, ytdEnd]
  );

  const salesCountMonth = salesMonth.length;
  const salesCountYTD = salesYTD.length;

  const salesValueMonth = useMemo(() => salesMonth.reduce((acc, r) => acc + dealValue(r), 0), [salesMonth]);
  const salesValueYTD = useMemo(() => salesYTD.reduce((acc, r) => acc + dealValue(r), 0), [salesYTD]);

  // ====== MEETINGS (lead_date)
  const leadsInMonth = useMemo(
    () => allLeads.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd)),
    [allLeads, monthStart, monthEnd]
  );
  const leadsInYTD = useMemo(
    () => allLeads.filter((r: any) => inRange(leadDateFallback(r), yearStart, ytdEnd)),
    [allLeads, yearStart, ytdEnd]
  );

  const meetingsBookedMonth = leadsInMonth.length;
  const meetingsBookedYTD = leadsInYTD.length;

  const meetingsDoneMonth = useMemo(() => leadsInMonth.filter((r: any) => isMeetingDone(r.status)).length, [leadsInMonth]);
  const meetingsDoneYTD = useMemo(() => leadsInYTD.filter((r: any) => isMeetingDone(r.status)).length, [leadsInYTD]);

  // ====== SHOW-RATE
  const showRateMonthPct = useMemo(() => {
    const done = leadsInMonth.filter((r: any) => isMeetingDone(r.status)).length;
    const ns = leadsInMonth.filter((r: any) => isNoShow(r.status)).length;
    const denom = done + ns;
    return denom > 0 ? safeDiv(done * 100, denom) : 0;
  }, [leadsInMonth]);

  const showRateYTDPct = useMemo(() => {
    const done = leadsInYTD.filter((r: any) => isMeetingDone(r.status)).length;
    const ns = leadsInYTD.filter((r: any) => isNoShow(r.status)).length;
    const denom = done + ns;
    return denom > 0 ? safeDiv(done * 100, denom) : 0;
  }, [leadsInYTD]);

  // ====== RENEWALS
  const renewalsMonth = useMemo(() => {
    const dueCustomers = (customers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), monthStart, monthEnd));
    const dueIds = new Set(dueCustomers.map((c: any) => String(c.id)));

    const renewedIds = new Set<string>();
    for (const r of renewals ?? []) {
      const payDate = iso10((r as any).renewal_date);
      if (!inRange(payDate, monthStart, monthEnd)) continue;
      const cid = String((r as any).customer_id ?? "");
      if (cid && dueIds.has(cid)) renewedIds.add(cid);
    }

    return {
      due: dueIds.size,
      renewed: renewedIds.size,
      pct: dueIds.size > 0 ? safeDiv(renewedIds.size * 100, dueIds.size) : 0,
      enabled: dueIds.size > 0,
    };
  }, [customers, renewals, monthStart, monthEnd]);

  const renewalsYTD = useMemo(() => {
    const dueCustomers = (customers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), yearStart, ytdEnd));
    const dueIds = new Set(dueCustomers.map((c: any) => String(c.id)));

    const renewedIds = new Set<string>();
    for (const r of renewals ?? []) {
      const payDate = iso10((r as any).renewal_date);
      if (!inRange(payDate, yearStart, ytdEnd)) continue;
      const cid = String((r as any).customer_id ?? "");
      if (cid && dueIds.has(cid)) renewedIds.add(cid);
    }

    return {
      due: dueIds.size,
      renewed: renewedIds.size,
      pct: dueIds.size > 0 ? safeDiv(renewedIds.size * 100, dueIds.size) : 0,
      enabled: dueIds.size > 0,
    };
  }, [customers, renewals, yearStart, ytdEnd]);

  // ====== META ADS SPEND (mês / ytd)
  const spendMonthByProfile = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaMonthRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaMonthRows]);

  const spendYTDByProfile = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaYtdRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaYtdRows]);

  const salesMonthByProfile = useMemo(() => {
    const out: Record<Profile, any[]> = { harley: [], giovanni: [] };
    out.harley = (leadsHarleyAll ?? []).filter((r: any) => isSale(r.status) && inRange(dealDate(r), monthStart, monthEnd));
    out.giovanni = (leadsGioAll ?? []).filter((r: any) => isSale(r.status) && inRange(dealDate(r), monthStart, monthEnd));
    return out;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesYTDByProfile = useMemo(() => {
    const out: Record<Profile, any[]> = { harley: [], giovanni: [] };
    out.harley = (leadsHarleyAll ?? []).filter((r: any) => isSale(r.status) && inRange(dealDate(r), yearStart, ytdEnd));
    out.giovanni = (leadsGioAll ?? []).filter((r: any) => isSale(r.status) && inRange(dealDate(r), yearStart, ytdEnd));
    return out;
  }, [leadsHarleyAll, leadsGioAll, yearStart, ytdEnd]);

  const costPerSaleMonth = useMemo(() => {
    const spendTotal = spendMonthByProfile.harley + spendMonthByProfile.giovanni;
    return salesCountMonth > 0 ? safeDiv(spendTotal, salesCountMonth) : 0;
  }, [spendMonthByProfile, salesCountMonth]);

  const costPerSaleYTD = useMemo(() => {
    const spendTotal = spendYTDByProfile.harley + spendYTDByProfile.giovanni;
    return salesCountYTD > 0 ? safeDiv(spendTotal, salesCountYTD) : 0;
  }, [spendYTDByProfile, salesCountYTD]);

  const costPerSaleMonthHarley = useMemo(() => {
    const spend = spendMonthByProfile.harley;
    const sales = salesMonthByProfile.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendMonthByProfile, salesMonthByProfile]);

  const costPerSaleMonthGio = useMemo(() => {
    const spend = spendMonthByProfile.giovanni;
    const sales = salesMonthByProfile.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendMonthByProfile, salesMonthByProfile]);

  const costPerSaleYTDHarley = useMemo(() => {
    const spend = spendYTDByProfile.harley;
    const sales = salesYTDByProfile.harley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendYTDByProfile, salesYTDByProfile]);

  const costPerSaleYTDGio = useMemo(() => {
    const spend = spendYTDByProfile.giovanni;
    const sales = salesYTDByProfile.giovanni.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendYTDByProfile, salesYTDByProfile]);

  // ====== METAS (mês / ytd)
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  const monthGoalMeetingsBooked = GOALS_2026.meetingsBookedMonthly;
  const monthGoalMeetingsDone = Math.round((GOALS_2026.meetingsBookedMonthly * GOALS_2026.showRatePct) / 100);

  const ytdGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual * ytdFactor, [ytdFactor]);
  const ytdGoalSales = useMemo(() => GOALS_2026.companiesAnnual * ytdFactor, [ytdFactor]);

  const annualMeetingsBooked = GOALS_2026.meetingsBookedMonthly * 12;
  const ytdGoalMeetingsBooked = useMemo(() => annualMeetingsBooked * ytdFactor, [annualMeetingsBooked, ytdFactor]);
  const ytdGoalMeetingsDone = useMemo(
    () => ytdGoalMeetingsBooked * (GOALS_2026.showRatePct / 100),
    [ytdGoalMeetingsBooked]
  );

  // ====== PROGRESSO ANUAL (cards do topo)
  const progressRevenuePct = useMemo(() => safeDiv(salesValueYTD * 100, GOALS_2026.revenueAnnual), [salesValueYTD]);
  const progressCompaniesPct = useMemo(() => safeDiv(salesCountYTD * 100, GOALS_2026.companiesAnnual), [salesCountYTD]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Meta Global</div>
          <div className="text-sm text-slate-400">Metas do ano + placar YTD + zoom do mês (dados reais).</div>
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
            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Real (acumulado)</div>
              <div className="mt-1 text-2xl font-semibold">{brl(salesValueYTD)}</div>
              <div className="mt-2 text-xs text-slate-400">Meta anual: {brl(GOALS_2026.revenueAnnual)}</div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Progresso anual</div>
              <div className="mt-1 text-2xl font-semibold">{pctFmt(progressRevenuePct)}</div>
              <div className="mt-2 text-xs text-slate-400">baseado nas vendas (deal_date)</div>
            </div>
          </div>
        </Card>

        <Card
          title="Meta anual — Empresas atendidas"
          subtitle={`Meta 2026: ${GOALS_2026.companiesAnnual} empresas`}
          right={<Pill>YTD</Pill>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Real (acumulado)</div>
              <div className="mt-1 text-2xl font-semibold">{String(salesCountYTD)}</div>
              <div className="mt-2 text-xs text-slate-400">Meta anual: {GOALS_2026.companiesAnnual} empresas</div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Progresso anual</div>
              <div className="mt-1 text-2xl font-semibold">{pctFmt(progressCompaniesPct)}</div>
              <div className="mt-2 text-xs text-slate-400">1 venda = 1 empresa</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ===================== INDICADORES YTD (PRIMEIRO) ===================== */}
      <Card
        title="Indicadores YTD"
        subtitle={`Período: ${yearStart} → ${ytdEnd} (meta proporcional ao ano, até hoje)`}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* COLUNA 1: card grande (Vendas YTD) + card grande (Custo por venda YTD) */}
          <div className="space-y-4">
            <BigMetricShell title="Vendas YTD" tag="YTD" subtitle="Quantidade + valor (deal_date).">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-400">Vendas (qtd)</div>
                  <div className="mt-1 text-3xl font-semibold">{salesCountYTD}</div>
                  <div className="mt-2 text-xs text-slate-400">Meta YTD: {Math.round(ytdGoalSales)}</div>
                  <div className="mt-2">{deltaPillMaybe(salesCountYTD, Math.max(1, Math.round(ytdGoalSales)), true)}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Vendas (R$)</div>
                  <div className="mt-1 text-3xl font-semibold">{brl(salesValueYTD)}</div>
                  <div className="mt-2 text-xs text-slate-400">Meta YTD: {brl(ytdGoalRevenue)}</div>
                  <div className="mt-2">{deltaPillMaybe(salesValueYTD, ytdGoalRevenue, true)}</div>
                </div>
              </div>
            </BigMetricShell>

            <BigMetricShell title="Custo por venda YTD" tag="YTD" subtitle="Meta Ads (spend) / vendas (deal_date).">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-400">Custo por venda (total)</div>
                  <div className="mt-1 text-3xl font-semibold">{salesCountYTD > 0 ? brl(costPerSaleYTD) : "—"}</div>
                  <div className="mt-2 text-xs text-slate-400">Meta: {brl(GOALS_2026.costPerSale)}</div>
                  <div className="mt-2">{deltaPillMaybe(costPerSaleYTD, GOALS_2026.costPerSale, salesCountYTD > 0)}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Por perfil</div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300">Harley</div>
                    <div className="text-sm font-semibold">{salesYTDByProfile.harley.length > 0 ? brl(costPerSaleYTDHarley) : "—"}</div>
                  </div>
                  <div className="mt-2">{deltaPillMaybe(costPerSaleYTDHarley, GOALS_2026.costPerSale, salesYTDByProfile.harley.length > 0)}</div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300">Giovanni</div>
                    <div className="text-sm font-semibold">{salesYTDByProfile.giovanni.length > 0 ? brl(costPerSaleYTDGio) : "—"}</div>
                  </div>
                  <div className="mt-2">{deltaPillMaybe(costPerSaleYTDGio, GOALS_2026.costPerSale, salesYTDByProfile.giovanni.length > 0)}</div>
                </div>
              </div>
            </BigMetricShell>
          </div>

          {/* COLUNA 2: 2 cards pequenos (Reuniões marcadas / Reuniões realizadas) */}
          <div className="grid grid-cols-1 gap-4">
            <SmallMetric
              title="Reuniões marcadas YTD"
              value={meetingsBookedYTD}
              metaLine={
                <>
                  Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsBooked)}</span>
                </>
              }
              delta={deltaPillMaybe(meetingsBookedYTD, Math.max(1, Math.round(ytdGoalMeetingsBooked)), true)}
            />

            <SmallMetric
              title="Reuniões realizadas YTD"
              value={meetingsDoneYTD}
              metaLine={
                <>
                  Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsDone)}</span>
                </>
              }
              delta={deltaPillMaybe(meetingsDoneYTD, Math.max(1, Math.round(ytdGoalMeetingsDone)), true)}
            />
          </div>

          {/* COLUNA 3: 2 cards pequenos (Show-rate / Renovações) */}
          <div className="grid grid-cols-1 gap-4">
            <SmallMetric
              title="Show-rate YTD"
              value={pctFmt(showRateYTDPct)}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
                </>
              }
              delta={deltaPillMaybe(showRateYTDPct, GOALS_2026.showRatePct, true)}
            />

            <SmallMetric
              title="% Renovações YTD"
              value={renewalsYTD.enabled ? pctFmt(renewalsYTD.pct) : "—"}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
                  <span className="ml-2 text-slate-500">
                    (base: {renewalsYTD.due} • renovou: {renewalsYTD.renewed})
                  </span>
                </>
              }
              delta={deltaPillMaybe(renewalsYTD.pct, GOALS_2026.renewalsPct, renewalsYTD.enabled)}
            />
          </div>
        </div>
      </Card>

      {/* ===================== INDICADORES DO MÊS (DEPOIS) ===================== */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* COLUNA 1: card grande (Vendas do mês) + card grande (Custo por venda mês) */}
          <div className="space-y-4">
            <BigMetricShell title="Vendas do mês" tag="Mês" subtitle="Quantidade + valor (deal_date).">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-400">Vendas (qtd)</div>
                  <div className="mt-1 text-3xl font-semibold">{salesCountMonth}</div>
                  <div className="mt-2 text-xs text-slate-400">Meta do mês: {Math.round(monthGoalSales)}</div>
                  <div className="mt-2">{deltaPillMaybe(salesCountMonth, Math.max(1, Math.round(monthGoalSales)), true)}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Vendas (R$)</div>
                  <div className="mt-1 text-3xl font-semibold">{brl(salesValueMonth)}</div>
                  <div className="mt-2 text-xs text-slate-400">Meta do mês: {brl(monthGoalRevenue)}</div>
                  <div className="mt-2">{deltaPillMaybe(salesValueMonth, monthGoalRevenue, true)}</div>
                </div>
              </div>
            </BigMetricShell>

            <BigMetricShell title="Custo por venda (mês)" tag="Mês" subtitle="Meta Ads (spend) / vendas (deal_date).">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-400">Custo por venda (total)</div>
                  <div className="mt-1 text-3xl font-semibold">{salesCountMonth > 0 ? brl(costPerSaleMonth) : "—"}</div>
                  <div className="mt-2 text-xs text-slate-400">Meta: {brl(GOALS_2026.costPerSale)}</div>
                  <div className="mt-2">{deltaPillMaybe(costPerSaleMonth, GOALS_2026.costPerSale, salesCountMonth > 0)}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Por perfil</div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300">Harley</div>
                    <div className="text-sm font-semibold">{salesMonthByProfile.harley.length > 0 ? brl(costPerSaleMonthHarley) : "—"}</div>
                  </div>
                  <div className="mt-2">{deltaPillMaybe(costPerSaleMonthHarley, GOALS_2026.costPerSale, salesMonthByProfile.harley.length > 0)}</div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300">Giovanni</div>
                    <div className="text-sm font-semibold">{salesMonthByProfile.giovanni.length > 0 ? brl(costPerSaleMonthGio) : "—"}</div>
                  </div>
                  <div className="mt-2">{deltaPillMaybe(costPerSaleMonthGio, GOALS_2026.costPerSale, salesMonthByProfile.giovanni.length > 0)}</div>
                </div>
              </div>
            </BigMetricShell>
          </div>

          {/* COLUNA 2: 2 cards pequenos (Reuniões marcadas / Reuniões realizadas) */}
          <div className="grid grid-cols-1 gap-4">
            <SmallMetric
              title="Reuniões marcadas (mês)"
              value={meetingsBookedMonth}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{monthGoalMeetingsBooked}</span>
                </>
              }
              delta={deltaPillMaybe(meetingsBookedMonth, Math.max(1, monthGoalMeetingsBooked), true)}
            />

            <SmallMetric
              title="Reuniões realizadas (mês)"
              value={meetingsDoneMonth}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{monthGoalMeetingsDone}</span>
                </>
              }
              delta={deltaPillMaybe(meetingsDoneMonth, Math.max(1, monthGoalMeetingsDone), true)}
            />
          </div>

          {/* COLUNA 3: 2 cards pequenos (Show-rate / Renovações) */}
          <div className="grid grid-cols-1 gap-4">
            <SmallMetric
              title="Show-rate (mês)"
              value={pctFmt(showRateMonthPct)}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
                </>
              }
              delta={deltaPillMaybe(showRateMonthPct, GOALS_2026.showRatePct, true)}
            />

            <SmallMetric
              title="% Renovações (mês)"
              value={renewalsMonth.enabled ? pctFmt(renewalsMonth.pct) : "—"}
              metaLine={
                <>
                  Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
                  <span className="ml-2 text-slate-500">
                    (base: {renewalsMonth.due} • renovou: {renewalsMonth.renewed})
                  </span>
                </>
              }
              delta={deltaPillMaybe(renewalsMonth.pct, GOALS_2026.renewalsPct, renewalsMonth.enabled)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
