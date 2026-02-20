import React, { useEffect, useMemo, useState } from "react";
import DateRange from "../components/DateRange";
import { Card, Stat, Table, Pill } from "../components/ui";
import { brl, safeDiv, todayISO } from "../lib/utils";
import { listDailyFunnel, listMeetingLeads, listMetaAds } from "../lib/db";
import { Profile } from "../lib/utils";

function startOfMonthISO(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  return x.toISOString().slice(0, 10);
}

function endOfMonthISO(d: Date) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1);
  x.setDate(0);
  return x.toISOString().slice(0, 10);
}

function profileLabel(p: Profile) {
  return p === "harley" ? "Harley" : "Giovanni";
}

function isoDate(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function inRange(dayISO: string, start: string, end: string) {
  return !!dayISO && dayISO >= start && dayISO <= end;
}

function leadDateFallback(row: any) {
  return isoDate(row?.lead_date) || isoDate(row?.created_at) || todayISO();
}

function dealDate(row: any) {
  return isoDate(row?.deal_date);
}

function dealValue(row: any) {
  const n = Number(row?.deal_value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function maxISO(a: string, b: string) {
  return a >= b ? a : b;
}

export default function SalesPage() {
  const today = new Date();
  const [range, setRange] = useState(() => ({
    start: startOfMonthISO(today),
    end: endOfMonthISO(today),
  }));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaRows, setMetaRows] = useState<any[]>([]);
  const [dailyHarley, setDailyHarley] = useState<any[]>([]);
  const [dailyGio, setDailyGio] = useState<any[]>([]);
  const [meetingHarley, setMeetingHarley] = useState<any[]>([]);
  const [meetingGio, setMeetingGio] = useState<any[]>([]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      const queryEnd = maxISO(todayISO(), range.end);

      const [meta, dh, dg, mh, mg] = await Promise.all([
        listMetaAds(range.start, range.end),
        listDailyFunnel("harley", range.start, range.end),
        listDailyFunnel("giovanni", range.start, range.end),

        // IMPORTANTE: buscar amplo e filtrar no front por lead_date/deal_date
        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),
      ]);

      setMetaRows(meta ?? []);
      setDailyHarley(dh ?? []);
      setDailyGio(dg ?? []);
      setMeetingHarley(mh ?? []);
      setMeetingGio(mg ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  const spendByProfile = useMemo(() => {
    const out: Record<Profile, number> = { harley: 0, giovanni: 0 };
    for (const r of metaRows) {
      const p = (r.profile as Profile) || "harley";
      out[p] += Number(r.spend || 0);
    }
    return out;
  }, [metaRows]);

  function sumStage(rows: any[], stage: "contato" | "reuniao") {
    return rows.reduce((s, r) => s + Number(r?.[stage] || 0), 0);
  }

  // reuniao aqui = REUNIÃO MARCADA (daily funnel)
  const funnelByProfile = useMemo(() => {
    return {
      harley: {
        contato: sumStage(dailyHarley, "contato"),
        reuniao: sumStage(dailyHarley, "reuniao"),
      },
      giovanni: {
        contato: sumStage(dailyGio, "contato"),
        reuniao: sumStage(dailyGio, "reuniao"),
      },
    };
  }, [dailyHarley, dailyGio]);

  function salesInPeriod(profile: Profile) {
    const rows = profile === "harley" ? meetingHarley : meetingGio;

    return (rows ?? []).filter((r: any) => {
      if (String(r.status) !== "venda") return false;
      const d = dealDate(r);
      return inRange(d, range.start, range.end);
    });
  }

  function pipelineRows(profile: Profile) {
    const rows = profile === "harley" ? meetingHarley : meetingGio;

    return (rows ?? []).filter((r: any) => {
      const status = String(r.status);

      if (status === "proposta") {
        const d = leadDateFallback(r);
        return inRange(d, range.start, range.end);
      }

      if (status === "venda") {
        const d = dealDate(r);
        return inRange(d, range.start, range.end);
      }

      return false;
    });
  }

  const kpis = useMemo(() => {
    const out: Record<Profile, any> = { harley: {}, giovanni: {} };

    (["harley", "giovanni"] as Profile[]).forEach((p) => {
      const spend = spendByProfile[p];
      const conversas = funnelByProfile[p].contato;
      const reunioesMarcadas = funnelByProfile[p].reuniao;

      const vendas = salesInPeriod(p);
      const totalVendas = vendas.length;

      const totalVendido = (vendas ?? []).reduce((acc: number, r: any) => acc + dealValue(r), 0);

      const custoPorConversa = safeDiv(spend, conversas);
      const custoPorReuniaoMarcada = safeDiv(spend, reunioesMarcadas);
      const custoPorVenda = totalVendas > 0 ? safeDiv(spend, totalVendas) : 0;

      out[p] = {
        totalVendas,
        totalVendido,
        custoPorConversa,
        custoPorReuniaoMarcada,
        custoPorVenda,
      };
    });

    return out;
  }, [spendByProfile, funnelByProfile, meetingHarley, meetingGio, range.start, range.end]);

  function ProfileSection({ profile }: { profile: Profile }) {
    const pipe = pipelineRows(profile);

    return (
      <div className="space-y-6">
        <Card
          title={`KPIs — ${profileLabel(profile)}`}
          subtitle={`Período: ${range.start} → ${range.end}`}
          right={loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Stat label="Total de vendas" value={String(kpis[profile].totalVendas || 0)} />
            <Stat label="Total vendido (R$)" value={brl(kpis[profile].totalVendido || 0)} />
            <Stat label="Custo por conversa" value={brl(kpis[profile].custoPorConversa || 0)} />
            <Stat label="Custo por reunião marcada" value={brl(kpis[profile].custoPorReuniaoMarcada || 0)} />
            <Stat label="Custo por venda" value={brl(kpis[profile].custoPorVenda || 0)} />
          </div>
        </Card>

        <Card
          title="Pipeline (Proposta + Fechado)"
          subtitle="Proposta entra por data do lead. Venda entra por data do fechamento (deal_date)."
        >
          <Table
            columns={[
              { key: "name", header: "Nome" },
              { key: "status", header: "Status", render: (r) => <Pill>{String(r.status)}</Pill> },
              {
                key: "date",
                header: "Data",
                render: (r) => (String(r.status) === "venda" ? dealDate(r) : leadDateFallback(r)),
              },
              {
                key: "deal_value",
                header: "Venda (R$)",
                render: (r) => (String(r.status) === "venda" ? brl(dealValue(r)) : ""),
              },
            ]}
            rows={pipe}
            rowKey={(r: any) => r.id}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Vendas</div>
          <div className="text-sm text-slate-400">
            KPIs e pipeline por período (venda conta por deal_date).
          </div>
        </div>

        <DateRange start={range.start} end={range.end} onChange={setRange} />
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6">
        <ProfileSection profile="harley" />
        <ProfileSection profile="giovanni" />
      </div>
    </div>
  );
}
