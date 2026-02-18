import React, { useEffect, useMemo, useState } from "react";
import DateRange from "../components/DateRange";
import { Button, Card, Stat, Table, Pill } from "../components/ui";
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

export default function SalesPage() {
  const today = new Date();
  const [range, setRange] = useState({
    start: startOfMonthISO(today),
    end: endOfMonthISO(today),
  });

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
      const [
        meta,
        dh,
        dg,
        mh,
        mg
      ] = await Promise.all([
        listMetaAds(range.start, range.end),
        listDailyFunnel("harley", range.start, range.end),
        listDailyFunnel("giovanni", range.start, range.end),
        listMeetingLeads("harley", range.start, range.end),
        listMeetingLeads("giovanni", range.start, range.end),
      ]);

      setMetaRows(meta);
      setDailyHarley(dh);
      setDailyGio(dg);
      setMeetingHarley(mh);
      setMeetingGio(mg);

    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [range.start, range.end]);

  function compute(profile: Profile, daily: any[], meeting: any[]) {
    const spend = metaRows
      .filter((r) => r.profile === profile)
      .reduce((sum, r) => sum + Number(r.spend || 0), 0);

    const totalContato = daily.reduce((sum, r) => sum + Number(r.qualificacao || 0), 0);
    const totalReuniao = daily.reduce((sum, r) => sum + Number(r.reuniao || 0), 0);
    const totalFechado = daily.reduce((sum, r) => sum + Number(r.fechado || 0), 0);

    const vendas = meeting.filter((m) => m.status === "venda");

    return {
      totalVendas: vendas.length,
      custoConversa: safeDiv(spend, totalContato),
      custoReuniao: safeDiv(spend, totalReuniao),
      custoVenda: safeDiv(spend, totalFechado),
      propostas: meeting.filter((m) => m.status === "proposta"),
      fechados: vendas,
    };
  }

  const harley = compute("harley", dailyHarley, meetingHarley);
  const gio = compute("giovanni", dailyGio, meetingGio);

  function ProfileSection({ profile, data }: { profile: Profile; data: any }) {
    return (
      <div className="space-y-6">
        <Card
          title={`KPIs — ${profileLabel(profile)}`}
          subtitle={`Período: ${range.start} → ${range.end}`}
          right={loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total de vendas" value={data.totalVendas} />
            <Stat label="Custo por conversa" value={brl(data.custoConversa)} />
            <Stat label="Custo por reunião" value={brl(data.custoReuniao)} />
            <Stat label="Custo por venda" value={brl(data.custoVenda)} />
          </div>
        </Card>

        <Card title="Pipeline (Proposta + Fechado)">
          <Table
            columns={[
              { key: "name", header: "Nome" },
              { key: "status", header: "Status" },
              {
                key: "avg_revenue",
                header: "Faturamento médio",
                render: (r) =>
                  Number(r.avg_revenue || 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }),
              },
            ]}
            rows={[...data.propostas, ...data.fechados]}
            rowKey={(r) => r.id}
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
            KPIs calculados a partir de Meta Ads + Funil.
          </div>
        </div>

        <DateRange start={range.start} end={range.end} onChange={setRange} />
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <ProfileSection profile="harley" data={harley} />
      <ProfileSection profile="giovanni" data={gio} />
    </div>
  );
}
