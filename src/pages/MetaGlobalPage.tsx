import React, { useEffect, useMemo, useState } from "react";
import { Card, Stat, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import {
  listMetaAds,
  listDailyFunnel,
  listMeetingLeads,
  listOpsCustomers,
  listOpsCustomerRenewals,
} from "../lib/db";
import { Profile } from "../lib/utils";

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

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function maxISO(a: string, b: string) {
  return a >= b ? a : b;
}

function yearMonthRangeISO(year: number, month1to12: number) {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 0); // último dia do mês
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function yearStartISO(year: number) {
  return new Date(year, 0, 1).toISOString().slice(0, 10);
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

// helper de desvio vs meta
function deltaPct(real: number, target: number) {
  return safeDiv((real - target) * 100, target);
}

function deltaPill(real: number, target: number, mode: "higher_better" | "lower_better") {
  const d = deltaPct(real, target);
  const sign = d >= 0 ? "+" : "";
  const text = `${sign}${d.toFixed(1)}%`;
  // visual igual hoje (sem “vermelho/verde” pra não inventar componente)
  return <Pill>{text}</Pill>;
}

export default function MetaGlobalPage() {
  const YEAR = 2026;

  // Seletor de mês (2026 fixo)
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // 1..12
  const rangeMonth = useMemo(() => yearMonthRangeISO(YEAR, month), [month]);
  const rangeYTD = useMemo(() => ({ start: yearStartISO(YEAR), end: rangeMonth.end }), [rangeMonth.end]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaRows, setMetaRows] = useState<any[]>([]);
  const [dailyHarley, setDailyHarley] = useState<any[]>([]);
  const [dailyGio, setDailyGio] = useState<any[]>([]);
  const [meetingHarleyAll, setMeetingHarleyAll] = useState<any[]>([]);
  const [meetingGioAll, setMeetingGioAll] = useState<any[]>([]);
  const [opsCustomers, setOpsCustomers] = useState<any[]>([]);
  const [opsRenewals, setOpsRenewals] = useState<any[]>([]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      const queryEnd = maxISO(todayISO(), rangeMonth.end);

      const [meta, dh, dg, mhAll, mgAll, cs, rn] = await Promise.all([
        listMetaAds(rangeMonth.start, rangeMonth.end),

        // Daily funnel do mês (para “reuniões marcadas”)
        listDailyFunnel("harley", rangeMonth.start, rangeMonth.end),
        listDailyFunnel("giovanni", rangeMonth.start, rangeMonth.end),

        // Meeting leads: buscar amplo e filtrar no front por lead_date/deal_date
        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),

        // Ops: renovações
        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);

      setMetaRows(meta ?? []);
      setDailyHarley(dh ?? []);
      setDailyGio(dg ?? []);
      setMeetingHarleyAll(mhAll ?? []);
      setMeetingGioAll(mgAll ?? []);
      setOpsCustomers(cs ?? []);
      setOpsRenewals(rn ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar dados da Meta Global.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMonth.start, rangeMonth.end]);

  // ====== META ADS (spend por perfil no mês) ======
  const spendByProfile = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaRows ?? []) {
      const p = (r.profile as Profile) || "harley";
      out[p] += safeNum(r.spend || 0);
    }
    return out;
  }, [metaRows]);

  // ====== DAILY FUNNEL: reuniões marcadas (campo reuniao) ======
  function sumStage(rows: any[], stage: "reuniao") {
    return (rows ?? []).reduce((s, r) => s + safeNum(r?.[stage] || 0), 0);
  }

  const meetingsBookedMonth = useMemo(() => {
    const h = sumStage(dailyHarley, "reuniao");
    const g = sumStage(dailyGio, "reuniao");
    return h + g;
  }, [dailyHarley, dailyGio]);

  // ====== MEETING LEADS: filtra por mês (lead_date) ======
  const meetingHarleyMonth = useMemo(() => {
    return (meetingHarleyAll ?? []).filter((r: any) => inRange(leadDateFallback(r), rangeMonth.start, rangeMonth.end));
  }, [meetingHarleyAll, rangeMonth.start, rangeMonth.end]);

  const meetingGioMonth = useMemo(() => {
    return (meetingGioAll ?? []).filter((r: any) => inRange(leadDateFallback(r), rangeMonth.start, rangeMonth.end));
  }, [meetingGioAll, rangeMonth.start, rangeMonth.end]);

  // ====== SHOW-RATE (mês): considera só reuniões “concluídas”
  // - denominator: status em [realizou, no_show, proposta, venda]
  // - numerator: status em [realizou, proposta, venda]
  function showRatePct(monthRows: any[]) {
    const concluded = (monthRows ?? []).filter((r: any) => {
      const s = String(r.status || "");
      return s === "realizou" || s === "no_show" || s === "proposta" || s === "venda";
    });
    const show = concluded.filter((r: any) => {
      const s = String(r.status || "");
      return s === "realizou" || s === "proposta" || s === "venda";
    });
    return safeDiv(show.length * 100, concluded.length);
  }

  const showRateMonth = useMemo(() => {
    const rows = [...(meetingHarleyMonth ?? []), ...(meetingGioMonth ?? [])];
    return showRatePct(rows);
  }, [meetingHarleyMonth, meetingGioMonth]);

  // ====== VENDAS (deal_date): mês e YTD ======
  function salesRowsInRange(profile: Profile, start: string, end: string) {
    const rows = profile === "harley" ? meetingHarleyAll : meetingGioAll;
    return (rows ?? []).filter((r: any) => {
      if (String(r.status) !== "venda") return false;
      const d = dealDate(r);
      return inRange(d, start, end);
    });
  }

  const salesMonth = useMemo(() => {
    const h = salesRowsInRange("harley", rangeMonth.start, rangeMonth.end);
    const g = salesRowsInRange("giovanni", rangeMonth.start, rangeMonth.end);
    return { harley: h, giovanni: g, all: [...h, ...g] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingHarleyAll, meetingGioAll, rangeMonth.start, rangeMonth.end]);

  const salesYTD = useMemo(() => {
    const h = salesRowsInRange("harley", rangeYTD.start, rangeYTD.end);
    const g = salesRowsInRange("giovanni", rangeYTD.start, rangeYTD.end);
    return { harley: h, giovanni: g, all: [...h, ...g] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingHarleyAll, meetingGioAll, rangeYTD.start, rangeYTD.end]);

  const soldValueYTD = useMemo(() => {
    return (salesYTD.all ?? []).reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesYTD]);

  const companiesYTD = useMemo(() => {
    return (salesYTD.all ?? []).length;
  }, [salesYTD]);

  const monthSales = useMemo(() => (salesMonth.all ?? []).length, [salesMonth]);

  const monthRevenue = useMemo(() => {
    return (salesMonth.all ?? []).reduce((acc, r) => acc + dealValue(r), 0);
  }, [salesMonth]);

  // ====== CUSTO POR VENDA (mês) separado por perfil ======
  const costPerSaleHarley = useMemo(() => {
    const spend = spendByProfile.harley;
    const n = (salesMonth.harley ?? []).length;
    return n > 0 ? safeDiv(spend, n) : 0;
  }, [spendByProfile.harley, salesMonth.harley]);

  const costPerSaleGio = useMemo(() => {
    const spend = spendByProfile.giovanni;
    const n = (salesMonth.giovanni ?? []).length;
    return n > 0 ? safeDiv(spend, n) : 0;
  }, [spendByProfile.giovanni, salesMonth.giovanni]);

  // ====== RENOVAÇÕES (mês) — regra simples (boa o suficiente pra começar)
  // Denominador: clientes com renewal_date (vencimento) no mês
  // Numerador: renovações registradas (ops_customer_renewals.renewal_date = data do pagamento) no mês
  // Observação: se você quiser “renovou do vencimento do mês” (match por customer + janela),
  // a gente refina depois sem mudar a tela.
  const renewalsPctMonth = useMemo(() => {
    const dueCustomers = (opsCustomers ?? []).filter((c: any) => {
      const due = iso10(c?.renewal_date);
      return inRange(due, rangeMonth.start, rangeMonth.end);
    });

    const renewedCustomerIds = new Set<string>();
    for (const r of opsRenewals ?? []) {
      const pay = iso10((r as any)?.renewal_date);
      if (!inRange(pay, rangeMonth.start, rangeMonth.end)) continue;
      const cid = String((r as any)?.customer_id ?? "");
      if (cid) renewedCustomerIds.add(cid);
    }

    const renewedCount = dueCustomers.filter((c: any) => renewedCustomerIds.has(String(c?.id))).length;
    return safeDiv(renewedCount * 100, dueCustomers.length);
  }, [opsCustomers, opsRenewals, rangeMonth.start, rangeMonth.end]);

  // ====== DEFAULT INTELIGENTE (meta mensal)
  const monthGoalRevenue = useMemo(() => GOALS_2026.revenueAnnual / 12, []);
  const monthGoalSales = useMemo(() => GOALS_2026.companiesAnnual / 12, []);

  // ====== PROGRESSO ANUAL
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

        <div className="flex items-center gap-3">
          {loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}

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
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {/* Topo: 2 cards lado a lado */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Meta anual — Faturamento" subtitle={`Meta 2026: ${brl(GOALS_2026.revenueAnnual)}`} right={<Pill>YTD</Pill>}>
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
      <Card
        title="Indicadores do mês"
        subtitle={`Período: ${rangeMonth.start} → ${rangeMonth.end} | Vendas contam por deal_date. Show-rate usa lead_date.`}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {/* Vendas do mês (soma) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Vendas do mês</div>
            <div className="mt-1 text-2xl font-semibold">{monthSales}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta do mês: <span className="text-slate-200">{Math.round(monthGoalSales)}</span>
            </div>
            <div className="mt-2">{deltaPill(monthSales, Math.round(monthGoalSales), "higher_better")}</div>
          </div>

          {/* Reuniões marcadas (soma daily funnel) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Reuniões marcadas</div>
            <div className="mt-1 text-2xl font-semibold">{meetingsBookedMonth}</div>
            <div className="mt-2 text-xs text-slate-400">Meta: (definir depois)</div>
            <div className="mt-2">
              <Pill>—</Pill>
            </div>
          </div>

          {/* Show-rate (soma / %) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Show-rate</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(showRateMonth)}</div>
            <div className="mt-2 text-xs text-slate-400">Meta: (definir depois)</div>
            <div className="mt-2">
              <Pill>—</Pill>
            </div>
          </div>

          {/* % Renovações (mês) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">% Renovações</div>
            <div className="mt-1 text-2xl font-semibold">{pctFmt(renewalsPctMonth)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Meta: <span className="text-slate-200">{GOALS_2026.renewalsPct}%</span>
            </div>
            <div className="mt-2">{deltaPill(renewalsPctMonth, GOALS_2026.renewalsPct, "higher_better")}</div>
          </div>

          {/* Custo por venda (separado por perfil) */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-xs text-slate-400">Custo por venda</div>
            <div className="mt-1 text-xs text-slate-400">
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

        {/* Extra: Receita do mês (não é card pq você pediu card de vendas; mas é útil pro time) */}
        <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/10 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-slate-300">
              Receita no mês (vendas): <span className="font-semibold text-slate-50">{brl(monthRevenue)}</span>
            </div>
            <div className="text-sm text-slate-400">
              Meta do mês: <span className="text-slate-200">{brl(monthGoalRevenue)}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
