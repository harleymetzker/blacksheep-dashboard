import React, { useEffect, useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import { Profile } from "../lib/utils";
import { listMeetingLeads, listMetaAds, listOpsCustomers, listOpsCustomerRenewals } from "../lib/db";

// ====== CONFIG FIXA (2026) ======
const YEAR = 2026;

const GOALS_2026 = {
  revenueAnnual: 1_000_000, // R$ 1 mi
  companiesAnnual: 125, // 125 empresas
  costPerSale: 1_000, // R$ 1.000
  showRatePct: 60, // 60%
  meetingsBookedMonthly: 25, // 25 reuniões / mês
  renewalsPct: 70, // 70%
};

// util
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
function parseISODate(s?: string | null) {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthRangeISO(year: number, month1to12: number) {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
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

// desvio vs meta
function deltaPct(real: number, target: number) {
  return safeDiv((real - target) * 100, target);
}
function deltaPill(real: number, target: number) {
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  return <Pill>{`${sign}${d.toFixed(1)}%`}</Pill>;
}

function leadDateFallback(row: any) {
  return iso10(row?.lead_date) || iso10(row?.created_at) || todayISO();
}
function dealDate(row: any) {
  return iso10(row?.deal_date);
}
function inRange(dayISO: string, start: string, end: string) {
  return !!dayISO && dayISO >= start && dayISO <= end;
}

export default function MetaGlobalPage() {
  // seletor de mês (1..12). default: mês atual (mas o ano é 2026)
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);

  const { start: monthStart, end: monthEnd } = useMemo(() => monthRangeISO(YEAR, month), [month]);
  const yearStart = `${YEAR}-01-01`;
  const yearEnd = monthEnd; // YTD até o fim do mês selecionado

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [leadsHarley, setLeadsHarley] = useState<any[]>([]);
  const [leadsGio, setLeadsGio] = useState<any[]>([]);
  const [metaRows, setMetaRows] = useState<any[]>([]);
  const [opsCustomers, setOpsCustomers] = useState<any[]>([]);
  const [opsRenewals, setOpsRenewals] = useState<any[]>([]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // busca ampla de leads (criado_at), mas a gente filtra por lead_date/deal_date no front
      const queryEnd = yearEnd >= todayISO() ? yearEnd : todayISO();

      const [mh, mg, meta, cs, rn] = await Promise.all([
        listMeetingLeads("harley" as Profile, "2000-01-01", queryEnd),
        listMeetingLeads("giovanni" as Profile, "2000-01-01", queryEnd),
        listMetaAds(monthStart, monthEnd),
        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setLeadsHarley(mh ?? []);
      setLeadsGio(mg ?? []);
      setMetaRows(meta ?? []);
      setOpsCustomers(cs ?? []);
      setOpsRenewals(rn ?? []);
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

  // -------------------------
  // 1) VENDAS / FATURAMENTO (YTD e mês) — por deal_date
  // -------------------------
  function salesRowsYTD(all: any[]) {
    return (all ?? []).filter((r: any) => {
      if (String(r.status) !== "venda") return false;
      const d = dealDate(r);
      return inRange(d, yearStart, yearEnd);
    });
  }

  function salesRowsMonth(all: any[]) {
    return (all ?? []).filter((r: any) => {
      if (String(r.status) !== "venda") return false;
      const d = dealDate(r);
      return inRange(d, monthStart, monthEnd);
    });
  }

  const salesYTDHarley = useMemo(() => salesRowsYTD(leadsHarley), [leadsHarley, yearStart, yearEnd]);
  const salesYTDGio = useMemo(() => salesRowsYTD(leadsGio), [leadsGio, yearStart, yearEnd]);
  const salesMonthHarley = useMemo(() => salesRowsMonth(leadsHarley), [leadsHarley, monthStart, monthEnd]);
  const salesMonthGio = useMemo(() => salesRowsMonth(leadsGio), [leadsGio, monthStart, monthEnd]);

  const soldValueYTD = useMemo(() => {
    const sum = (rows: any[]) => rows.reduce((acc, r) => acc + safeNum(r?.deal_value ?? 0), 0);
    return sum(salesYTDHarley) + sum(salesYTDGio);
  }, [salesYTDHarley, salesYTDGio]);

  const companiesYTD = useMemo(() => (salesYTDHarley.length + salesYTDGio.length), [salesYTDHarley, salesYTDGio]);
  const monthSales = useMemo(() => (salesMonthHarley.length + salesMonthGio.length), [salesMonthHarley, salesMonthGio]);

  // -------------------------
  // 2) REUNIÕES MARCADAS (mês) — por lead_date (fallback)
  // booked = todo lead com lead_date no mês (independente do status atual)
  // -------------------------
  const monthBooked = useMemo(() => {
    const all = [...(leadsHarley ?? []), ...(leadsGio ?? [])];
    return all.filter((r: any) => inRange(leadDateFallback(r), monthStart, monthEnd)).length;
  }, [leadsHarley, leadsGio, monthStart, monthEnd]);

  // -------------------------
  // 3) SHOW-RATE (mês)
  // show = realizou + proposta + venda
  // no_show = no_show
  // base = só leads do mês (lead_date no mês)
  // -------------------------
  const { monthShow, monthNoShow, monthShowRatePct } = useMemo(() => {
    const all = [...(leadsHarley ?? []), ...(leadsGio ?? [])].filter((r: any) =>
      inRange(leadDateFallback(r), monthStart, monthEnd)
    );

    let show = 0;
    let noshow = 0;

    for (const r of all) {
      const s = String(r.status);
      if (s === "no_show") noshow += 1;
      if (s === "realizou" || s === "proposta" || s === "venda") show += 1;
    }

    const denom = show + noshow;
    const rate = denom > 0 ? safeDiv(show * 100, denom) : 0;

    return { monthShow: show, monthNoShow: noshow, monthShowRatePct: rate };
  }, [leadsHarley, leadsGio, monthStart, monthEnd]);

  // -------------------------
  // 4) META ADS (spend) mês — por perfil
  // -------------------------
  const spendByProfile = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += safeNum(r.spend ?? 0);
    }
    return out;
  }, [metaRows]);

  // custo por venda (mês) separado
  const costPerSaleHarley = useMemo(() => {
    const spend = spendByProfile.harley;
    const sales = salesMonthHarley.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfile, salesMonthHarley]);

  const costPerSaleGio = useMemo(() => {
    const spend = spendByProfile.giovanni;
    const sales = salesMonthGio.length;
    return sales > 0 ? safeDiv(spend, sales) : 0;
  }, [spendByProfile, salesMonthGio]);

  // -------------------------
  // 5) RENOVAÇÕES (%) mês
  // regra prática com o que temos hoje:
  // base = clientes com renewal_date (vencimento) no mês
  // renovou = esses clientes que tiveram pagamento de renovação até +15 dias do fim do mês
  // -------------------------
  const monthRenewalsPct = useMemo(() => {
    const due = (opsCustomers ?? []).filter((c: any) => inRange(iso10(c.renewal_date), monthStart, monthEnd));
    if (due.length === 0) return 0;

    const limit = addDays(parseISODate(monthEnd) ?? new Date(), 15).toISOString().slice(0, 10);

    const renewedSet = new Set<string>();
    for (const r of opsRenewals ?? []) {
      const cid = String(r.customer_id ?? "");
      const paidAt = iso10(r.renewal_date);
      if (!cid) continue;
      // pagamento dentro do mês ou até 15 dias após (pra não punir atraso curto)
      if (inRange(paidAt, monthStart, limit)) renewedSet.add(cid);
    }

    const renewed = due.filter((c: any) => renewedSet.has(String(c.id))).length;
    return safeDiv(renewed * 100, due.length);
  }, [opsCustomers, opsRenewals, monthStart, monthEnd]);

  // -------------------------
  // default inteligente
  // -------------------------
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  // progresso anual
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
          <div className="text-sm text-slate-400">Clareza do time: metas do ano e desempenho do mês.</div>
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
        <Card title="Meta anual — Faturamento" subtitle={`Meta 2026: ${brl(GOALS_2026.revenueAnnual)}`} right={<Pill>YTD</Pill>}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Stat label="Real (acumulado)" value={brl(soldValueYTD)} hint={`Meta do mês: ${brl(monthGoalRevenue)}`} />
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
            <Stat label="Real (acumulado)" value={String(companiesYTD)} hint={`Meta do mês: ${Math.round(monthGoalSales)} vendas`} />
            <Stat label="Progresso anual" value={pctFmt(progressCompaniesPct)} hint="1 venda = 1 empresa" />
          </div>
          <div className="mt-4">
            <ProgressBar valuePct={progressCompaniesPct} />
          </div>
        </Card>
      </div>

      {/* Indicadores do mês */}
      <Card title="Indicadores do mês" subtitle="Reais puxados do DB. Custos separados por perfil.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {/* Vendas do mês */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Vendas do mês</div>
            <div className="mt-1 text-2xl font-semibold">{monthSales}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSales)}</span>
            </div>
            <div className="mt-2">{deltaPill(monthSales, Math.round(monthGoalSales))}</div>
          </div>

          {/* Reuniões marcadas */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas</div>
            <div className="mt-1 text-2xl font-semibold">{monthBooked}</div>
            <div className="mt-2 text-xs text-slate-400">Meta: (definir depois)</div>
            <div className="mt-2">
              <Pill>—</Pill>
            </div>
          </div>

          {/* Show-rate */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Show-rate</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(monthShowRatePct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Show: <span className="text-slate-200">{monthShow}</span> • No-show: <span className="text-slate-200">{monthNoShow}</span>
            </div>
            <div className="mt-2">
              <Pill>—</Pill>
            </div>
          </div>

          {/* % Renovações */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">% Renovações</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(monthRenewalsPct)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(monthRenewalsPct, GOALS_2026.renewalsPct)}</div>
          </div>

          {/* Custo por venda (separado) */}
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
              {deltaPill(costPerSaleHarley, GOALS_2026.costPerSale)}
              {deltaPill(costPerSaleGio, GOALS_2026.costPerSale)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
