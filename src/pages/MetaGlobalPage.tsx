import React, { useEffect, useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import { listDailyFunnel, listMeetingLeads, listMetaAds, listOpsCustomers, listOpsCustomerRenewals } from "../lib/db";
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

// ---------------- helpers ----------------
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
function minISO(a: string, b: string) {
  return a <= b ? a : b;
}
function monthsElapsedInYear(ytdEndISO: string) {
  const m = Number(String(ytdEndISO).slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1;
}

function deltaPct(real: number, target: number) {
  return safeDiv((real - target) * 100, target);
}
function deltaPill(real: number, target: number) {
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  return <Pill>{`${sign}${d.toFixed(1)}%`}</Pill>;
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

function SmallCard(props: {
  title: string;
  value: React.ReactNode;
  metaLine?: React.ReactNode;
  pill?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
      <div className="text-xs text-slate-400">{props.title}</div>
      <div className="mt-1 text-2xl font-semibold">{props.value}</div>
      {props.metaLine ? <div className="mt-2 text-xs text-slate-400">{props.metaLine}</div> : null}
      <div className="mt-2">{props.pill ?? <Pill>—</Pill>}</div>
    </div>
  );
}

function BigSalesCard(props: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;

  qtyLabel: string;
  qtyValue: number;
  qtyTargetLabel: string;
  qtyTargetValue: number;

  valueLabel: string;
  valueValue: number;
  valueTargetLabel: string;
  valueTargetValue: number;

  progressPct: number;
  progressHint?: string;
}) {
  return (
    <Card title={props.title} subtitle={props.subtitle} right={props.right}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Stat
          label={props.qtyLabel}
          value={props.qtyValue.toLocaleString("pt-BR")}
          hint={
            <span>
              {props.qtyTargetLabel}:{" "}
              <span className="text-slate-200">{Math.round(props.qtyTargetValue).toLocaleString("pt-BR")}</span>{" "}
              {deltaPill(props.qtyValue, Math.max(1, props.qtyTargetValue))}
            </span>
          }
        />
        <Stat
          label={props.valueLabel}
          value={brl(props.valueValue)}
          hint={
            <span>
              {props.valueTargetLabel}: <span className="text-slate-200">{brl(props.valueTargetValue)}</span>{" "}
              {deltaPill(props.valueValue, Math.max(1, props.valueTargetValue))}
            </span>
          }
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs text-slate-400">{props.progressHint ?? "Progresso"}</div>
        <ProgressBar valuePct={props.progressPct} />
      </div>
    </Card>
  );
}

function BigCpsCard(props: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  metaLabel: string;

  harleyValue: number;
  gioValue: number;

  target: number;

  totalValue?: number;
}) {
  const total = props.totalValue ?? 0;

  return (
    <Card title={props.title} subtitle={props.subtitle} right={props.right}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Stat
          label={props.metaLabel}
          value={brl(total)}
          hint={
            <span>
              Meta: <span className="text-slate-200">{brl(props.target)}</span>{" "}
              {deltaPill(total, Math.max(1, props.target))}
            </span>
          }
        />
        <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
          <div className="text-xs text-slate-400">Por perfil</div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-400">Harley</div>
            <div className="text-sm font-semibold">{brl(props.harleyValue)}</div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-400">Giovanni</div>
            <div className="text-sm font-semibold">{brl(props.gioValue)}</div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {deltaPill(props.harleyValue, Math.max(1, props.target))}
            {deltaPill(props.gioValue, Math.max(1, props.target))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function MetaGlobalPage() {
  const year = 2026;
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaMonthRows, setMetaMonthRows] = useState<any[]>([]);
  const [metaYearRows, setMetaYearRows] = useState<any[]>([]);
  const [leadsHarleyAll, setLeadsHarleyAll] = useState<any[]>([]);
  const [leadsGioAll, setLeadsGioAll] = useState<any[]>([]);
  const [dailyHarleyYear, setDailyHarleyYear] = useState<any[]>([]);
  const [dailyGioYear, setDailyGioYear] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);

  const monthStart = useMemo(() => startOfMonthISO(year, month), [year, month]);
  const monthEnd = useMemo(() => endOfMonthISO(year, month), [year, month]);

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const ytdEnd = useMemo(() => minISO(todayISO(), yearEnd), [yearEnd]);
  const ytdMonths = useMemo(() => monthsElapsedInYear(ytdEnd), [ytdEnd]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // Busca ampla e filtra no front pelos campos corretos
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [
        metaMonth,
        metaYear,
        mhAll,
        mgAll,
        dhYear,
        dgYear,
        cs,
        rn,
      ] = await Promise.all([
        listMetaAds(monthStart, monthEnd),
        listMetaAds(yearStart, yearEnd),

        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),

        listDailyFunnel("harley", yearStart, yearEnd),
        listDailyFunnel("giovanni", yearStart, yearEnd),

        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setMetaMonthRows(metaMonth ?? []);
      setMetaYearRows(metaYear ?? []);
      setLeadsHarleyAll(mhAll ?? []);
      setLeadsGioAll(mgAll ?? []);
      setDailyHarleyYear(dhYear ?? []);
      setDailyGioYear(dgYear ?? []);
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

  // ---------------- SALES (por deal_date) ----------------
  const salesByProfileMonth = useMemo(() => {
    const pick = (rows: any[], start: string, end: string) =>
      (rows ?? []).filter((r: any) => String(r.status) === "venda" && inRange(dealDate(r), start, end));

    return {
      harley: pick(leadsHarleyAll, monthStart, monthEnd),
      giovanni: pick(leadsGioAll, monthStart, monthEnd),
    } as Record<Profile, any[]>;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const salesByProfileYTD = useMemo(() => {
    const pick = (rows: any[]) => (rows ?? []).filter((r: any) => String(r.status) === "venda" && inRange(dealDate(r), yearStart, ytdEnd));

    return {
      harley: pick(leadsHarleyAll),
      giovanni: pick(leadsGioAll),
    } as Record<Profile, any[]>;
  }, [leadsHarleyAll, leadsGioAll, ytdEnd]);

  const monthSalesQty = useMemo(
    () => salesByProfileMonth.harley.length + salesByProfileMonth.giovanni.length,
    [salesByProfileMonth]
  );

  const ytdSalesQty = useMemo(
    () => salesByProfileYTD.harley.length + salesByProfileYTD.giovanni.length,
    [salesByProfileYTD]
  );

  const monthSalesValue = useMemo(() => {
    const all = [...salesByProfileMonth.harley, ...salesByProfileMonth.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileMonth]);

  const ytdSalesValue = useMemo(() => {
    const all = [...salesByProfileYTD.harley, ...salesByProfileYTD.giovanni];
    return all.reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesByProfileYTD]);

  // 1 venda = 1 empresa
  const companiesYTD = ytdSalesQty;

  // ---------------- MEETINGS BOOKED (fonte: daily_funnel reuniao) ----------------
  const meetingsBookedMonth = useMemo(() => {
    const all = [...(dailyHarleyYear ?? []), ...(dailyGioYear ?? [])];
    return all
      .filter((r: any) => inRange(iso10(r.day), monthStart, monthEnd))
      .reduce((acc, r: any) => acc + Number(r.reuniao || 0), 0);
  }, [dailyHarleyYear, dailyGioYear, monthStart, monthEnd]);

  const meetingsBookedYTD = useMemo(() => {
    const all = [...(dailyHarleyYear ?? []), ...(dailyGioYear ?? [])];
    return all
      .filter((r: any) => inRange(iso10(r.day), yearStart, ytdEnd))
      .reduce((acc, r: any) => acc + Number(r.reuniao || 0), 0);
  }, [dailyHarleyYear, dailyGioYear, ytdEnd]);

  // ---------------- MEETINGS REALIZED + NO-SHOW (fonte: meeting_leads status) ----------------
  function isNoShow(status: any) {
    const s = String(status || "").toLowerCase();
    return s === "no_show" || s === "no-show" || s === "noshow";
  }
  function isRealized(status: any) {
    const s = String(status || "").toLowerCase();
    // compatibilidade com legado + o novo naming
    return s === "realizou" || s === "reuniao_realizada" || s === "reunião_realizada" || s === "reuniao realizada";
  }
  function isSale(status: any) {
    return String(status || "").toLowerCase() === "venda";
  }

  const meetingsRealizedMonth = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), monthStart, monthEnd)
    );

    // venda conta também como reunião realizada
    return all.filter((r: any) => isRealized(r.status) || isSale(r.status)).length;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const meetingsRealizedYTD = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), yearStart, ytdEnd)
    );
    return all.filter((r: any) => isRealized(r.status) || isSale(r.status)).length;
  }, [leadsHarleyAll, leadsGioAll, ytdEnd]);

  const showRateMonthPct = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), monthStart, monthEnd)
    );

    const realized = all.filter((r: any) => isRealized(r.status) || isSale(r.status)).length;
    const noShow = all.filter((r: any) => isNoShow(r.status)).length;

    const denom = realized + noShow;
    return denom > 0 ? safeDiv(realized * 100, denom) : 0;
  }, [leadsHarleyAll, leadsGioAll, monthStart, monthEnd]);

  const showRateYTDPct = useMemo(() => {
    const all = [...(leadsHarleyAll ?? []), ...(leadsGioAll ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), yearStart, ytdEnd)
    );

    const realized = all.filter((r: any) => isRealized(r.status) || isSale(r.status)).length;
    const noShow = all.filter((r: any) => isNoShow(r.status)).length;

    const denom = realized + noShow;
    return denom > 0 ? safeDiv(realized * 100, denom) : 0;
  }, [leadsHarleyAll, leadsGioAll, ytdEnd]);

  // ---------------- RENEWALS ----------------
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
  }, [customers, renewals, ytdEnd]);

  // ---------------- ADS SPEND + COST PER SALE ----------------
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
      const p = (r.profile as Profile) || "harley";
      // considera apenas até ytdEnd (evita puxar meses futuros se já existir dado)
      const sd = iso10(r.start_date);
      const ed = iso10(r.end_date);
      const inside = (sd && inRange(sd, yearStart, ytdEnd)) || (ed && inRange(ed, yearStart, ytdEnd));
      if (!inside) continue;
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaYearRows, ytdEnd]);

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

  const costPerSaleTotalMonth = useMemo(() => {
    const spend = spendByProfileMonth.harley + spendByProfileMonth.giovanni;
    return monthSalesQty > 0 ? safeDiv(spend, monthSalesQty) : 0;
  }, [spendByProfileMonth, monthSalesQty]);

  const costPerSaleTotalYTD = useMemo(() => {
    const spend = spendByProfileYTD.harley + spendByProfileYTD.giovanni;
    return ytdSalesQty > 0 ? safeDiv(spend, ytdSalesQty) : 0;
  }, [spendByProfileYTD, ytdSalesQty]);

  // ---------------- GOALS (default inteligente) ----------------
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  const ytdGoalRevenue = useMemo(() => (GOALS_2026.revenueAnnual / 12) * ytdMonths, [ytdMonths]);
  const ytdGoalSales = useMemo(() => (GOALS_2026.companiesAnnual / 12) * ytdMonths, [ytdMonths]);

  const ytdGoalMeetingsBooked = useMemo(() => GOALS_2026.meetingsBookedMonthly * ytdMonths, [ytdMonths]);
  const ytdGoalMeetingsRealized = useMemo(
    () => (GOALS_2026.meetingsBookedMonthly * (GOALS_2026.showRatePct / 100)) * ytdMonths,
    [ytdMonths]
  );

  // ---------------- PROGRESS ANUAL (cards do topo) ----------------
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
            <Stat label="Real (acumulado)" value={brl(ytdSalesValue)} hint={`Meta do mês: ${brl(monthGoalRevenue)}`} />
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

      {/* ===================== YTD PRIMEIRO (como você pediu) ===================== */}
      <Card
        title="Indicadores YTD"
        subtitle={`Período: ${yearStart} → ${ytdEnd} (meta proporcional ao mês ${String(ytdMonths).padStart(2, "0")})`}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Linha 1 */}
          <BigSalesCard
            title="Vendas YTD"
            subtitle="Quantidade + valor (deal_date)."
            right={<Pill>YTD</Pill>}
            qtyLabel="Vendas (qtd)"
            qtyValue={ytdSalesQty}
            qtyTargetLabel="Meta YTD"
            qtyTargetValue={ytdGoalSales}
            valueLabel="Vendas (R$)"
            valueValue={ytdSalesValue}
            valueTargetLabel="Meta YTD"
            valueTargetValue={ytdGoalRevenue}
            progressPct={safeDiv(ytdSalesValue * 100, GOALS_2026.revenueAnnual)}
            progressHint="Progresso do faturamento anual"
          />

          <SmallCard
            title="Reuniões marcadas YTD"
            value={meetingsBookedYTD.toLocaleString("pt-BR")}
            metaLine={
              <>
                Meta YTD: <span className="text-slate-200">{ytdGoalMeetingsBooked.toLocaleString("pt-BR")}</span>
              </>
            }
            pill={deltaPill(meetingsBookedYTD, Math.max(1, ytdGoalMeetingsBooked))}
          />

          <SmallCard
            title="Reuniões realizadas YTD"
            value={meetingsRealizedYTD.toLocaleString("pt-BR")}
            metaLine={
              <>
                Meta YTD: <span className="text-slate-200">{Math.round(ytdGoalMeetingsRealized).toLocaleString("pt-BR")}</span>
              </>
            }
            pill={deltaPill(meetingsRealizedYTD, Math.max(1, ytdGoalMeetingsRealized))}
          />

          {/* Linha 2 */}
          <BigCpsCard
            title="Custo por venda YTD"
            subtitle="Meta Ads (spend) / vendas (deal_date)."
            right={<Pill>YTD</Pill>}
            metaLabel="Custo por venda (total)"
            harleyValue={costPerSaleHarleyYTD}
            gioValue={costPerSaleGioYTD}
            target={GOALS_2026.costPerSale}
            totalValue={costPerSaleTotalYTD}
          />

          <SmallCard
            title="Show-rate YTD"
            value={pctFmt(showRateYTDPct)}
            metaLine={
              <>
                Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
              </>
            }
            pill={deltaPill(showRateYTDPct, Math.max(1, GOALS_2026.showRatePct))}
          />

          <SmallCard
            title="% Renovações YTD"
            value={pctFmt(renewalsYTDPct)}
            metaLine={
              <>
                Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
              </>
            }
            pill={deltaPill(renewalsYTDPct, Math.max(1, GOALS_2026.renewalsPct))}
          />
        </div>
      </Card>

      {/* ===================== MÊS (DEPOIS DO YTD) ===================== */}
      <Card title="Indicadores do mês" subtitle={`Período: ${monthStart} → ${monthEnd}`}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Linha 1 */}
          <BigSalesCard
            title="Vendas do mês"
            subtitle="Quantidade + valor (deal_date)."
            right={<Pill>Mês</Pill>}
            qtyLabel="Vendas (qtd)"
            qtyValue={monthSalesQty}
            qtyTargetLabel="Meta do mês"
            qtyTargetValue={monthGoalSales}
            valueLabel="Vendas (R$)"
            valueValue={monthSalesValue}
            valueTargetLabel="Meta do mês"
            valueTargetValue={monthGoalRevenue}
            progressPct={safeDiv(monthSalesValue * 100, monthGoalRevenue)}
            progressHint="Progresso da meta de faturamento do mês"
          />

          <SmallCard
            title="Reuniões marcadas"
            value={meetingsBookedMonth.toLocaleString("pt-BR")}
            metaLine={
              <>
                Meta: <span className="text-slate-200">{GOALS_2026.meetingsBookedMonthly}</span>
              </>
            }
            pill={deltaPill(meetingsBookedMonth, Math.max(1, GOALS_2026.meetingsBookedMonthly))}
          />

          <SmallCard
            title="Reuniões realizadas"
            value={meetingsRealizedMonth.toLocaleString("pt-BR")}
            metaLine={
              <>
                Meta:{" "}
                <span className="text-slate-200">
                  {Math.round(GOALS_2026.meetingsBookedMonthly * (GOALS_2026.showRatePct / 100)).toLocaleString("pt-BR")}
                </span>
              </>
            }
            pill={deltaPill(
              meetingsRealizedMonth,
              Math.max(1, GOALS_2026.meetingsBookedMonthly * (GOALS_2026.showRatePct / 100))
            )}
          />

          {/* Linha 2 */}
          <BigCpsCard
            title="Custo por venda (mês)"
            subtitle="Meta Ads (spend) / vendas (deal_date)."
            right={<Pill>Mês</Pill>}
            metaLabel="Custo por venda (total)"
            harleyValue={costPerSaleHarleyMonth}
            gioValue={costPerSaleGioMonth}
            target={GOALS_2026.costPerSale}
            totalValue={costPerSaleTotalMonth}
          />

          <SmallCard
            title="Show-rate"
            value={pctFmt(showRateMonthPct)}
            metaLine={
              <>
                Meta: <span className="text-slate-200">{GOALS_2026.showRatePct}%</span>
              </>
            }
            pill={deltaPill(showRateMonthPct, Math.max(1, GOALS_2026.showRatePct))}
          />

          <SmallCard
            title="% Renovações"
            value={pctFmt(renewalsMonthPct)}
            metaLine={
              <>
                Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
              </>
            }
            pill={deltaPill(renewalsMonthPct, Math.max(1, GOALS_2026.renewalsPct))}
          />
        </div>
      </Card>
    </div>
  );
}
