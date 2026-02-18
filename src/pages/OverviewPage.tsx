import React, { useEffect, useMemo, useState } from "react";
import DateRange from "../components/DateRange";
import { Button, Card, Input, Label, Modal, Select, Stat, Table, Pill } from "../components/ui";
import { brl, pct, safeDiv, uid } from "../lib/utils";
import { deleteMetaAds, listMetaAds, listMeetingLeads, upsertMetaAds, MetaAdsEntry } from "../lib/db";

type Profile = "harley" | "giovanni";

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
  // YYYY-MM-DD compara lexicograficamente
  return dayISO >= start && dayISO <= end;
}

export default function OverviewPage() {
  const today = new Date();
  const [range, setRange] = useState(() => ({
    start: startOfMonthISO(today),
    end: endOfMonthISO(today),
  }));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaRows, setMetaRows] = useState<MetaAdsEntry[]>([]);
  const [salesRevenue, setSalesRevenue] = useState<Record<Profile, number>>({
    harley: 0,
    giovanni: 0,
  });

  // Modal (add/edit campaign)
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    profile: "harley" as Profile,
    start_date: range.start,
    end_date: range.end,
    impressions: 0,
    followers: 0,
    spend: 0,
    clicks: 0,
  });

  function resetForm() {
    setEditingId(null);
    setForm({
      profile: "harley",
      start_date: range.start,
      end_date: range.end,
      impressions: 0,
      followers: 0,
      spend: 0,
      clicks: 0,
    });
  }

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      // IMPORTANT:
      // Para "receita por vendas", precisamos considerar vendas cujo deal_date cai no período,
      // mesmo que o lead tenha sido criado em outro mês.
      // Então buscamos meeting leads até o fim do range, com um start bem antigo.
      const LEADS_START = "2000-01-01";

      const [meta, harleyLeads, gioLeads] = await Promise.all([
        listMetaAds(range.start, range.end),
        listMeetingLeads("harley", LEADS_START, range.end),
        listMeetingLeads("giovanni", LEADS_START, range.end),
      ]);

      setMetaRows(meta);

      // ✅ RECEITA (VENDAS) = soma de deal_value
      // ✅ Só conta quando status="venda" E deal_date dentro do range
      const revHarley =
        (harleyLeads ?? [])
          .filter((r: any) => String(r.status) === "venda")
          .filter((r: any) => {
            const d = isoDate(r.deal_date);
            if (!d) return false;
            return inRange(d, range.start, range.end);
          })
          .reduce((sum: number, r: any) => sum + Number(r.deal_value || 0), 0) || 0;

      const revGio =
        (gioLeads ?? [])
          .filter((r: any) => String(r.status) === "venda")
          .filter((r: any) => {
            const d = isoDate(r.deal_date);
            if (!d) return false;
            return inRange(d, range.start, range.end);
          })
          .reduce((sum: number, r: any) => sum + Number(r.deal_value || 0), 0) || 0;

      setSalesRevenue({ harley: revHarley, giovanni: revGio });
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

  const byProfile = useMemo(() => {
    const init = {
      harley: { spend: 0, impressions: 0, clicks: 0, followers: 0 },
      giovanni: { spend: 0, impressions: 0, clicks: 0, followers: 0 },
    };

    for (const r of metaRows) {
      const p = r.profile as Profile;
      init[p].spend += Number(r.spend || 0);
      init[p].impressions += Number(r.impressions || 0);
      init[p].clicks += Number(r.clicks || 0);
      init[p].followers += Number(r.followers || 0);
    }

    return init;
  }, [metaRows]);

  const kpis = useMemo(() => {
    const out: Record<Profile, any> = { harley: {}, giovanni: {} };
    (["harley", "giovanni"] as Profile[]).forEach((p) => {
      const spend = byProfile[p].spend;
      const impressions = byProfile[p].impressions;
      const clicks = byProfile[p].clicks;
      const followers = byProfile[p].followers;

      const ctr = safeDiv(clicks * 100, impressions);
      const cpf = safeDiv(spend, followers); // cost per follower
      const revenue = salesRevenue[p];
      const roi = spend === 0 ? 0 : ((revenue - spend) / spend) * 100;

      out[p] = { spend, impressions, clicks, followers, ctr, cpf, revenue, roi };
    });
    return out;
  }, [byProfile, salesRevenue]);

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: MetaAdsEntry) {
    setEditingId(row.id);
    setForm({
      profile: row.profile as Profile,
      start_date: row.start_date,
      end_date: row.end_date,
      impressions: Number(row.impressions || 0),
      followers: Number(row.followers || 0),
      spend: Number(row.spend || 0),
      clicks: Number(row.clicks || 0),
    });
    setOpen(true);
  }

  async function save() {
    setErr(null);
    try {
      const payload: Partial<MetaAdsEntry> = {
        id: editingId ?? uid(),
        profile: form.profile,
        start_date: form.start_date,
        end_date: form.end_date,
        impressions: Number(form.impressions || 0),
        followers: Number(form.followers || 0),
        spend: Number(form.spend || 0),
        clicks: Number(form.clicks || 0),
      };

      await upsertMetaAds(payload);
      setOpen(false);
      resetForm();
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar campanha.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este registro de campanha?")) return;
    setErr(null);
    try {
      await deleteMetaAds(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Visão geral</div>
          <div className="text-sm text-slate-400">Seletor de período controla os indicadores desta página.</div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <DateRange start={range.start} end={range.end} onChange={setRange} />
          <Button onClick={openAdd}>Adicionar dados (Meta Ads)</Button>
        </div>
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{err}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(["harley", "giovanni"] as Profile[]).map((p) => (
          <Card
            key={p}
            title={`Meta Ads — ${profileLabel(p)}`}
            subtitle={`Período: ${range.start} → ${range.end}`}
            right={loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Stat label="Investimento" value={brl(kpis[p].spend)} />
              <Stat label="Receita (vendas)" value={brl(kpis[p].revenue)} />
              <Stat label="ROI" value={pct(kpis[p].roi)} hint="(receita - investimento) / investimento" />
              <Stat label="Custo por seguidor" value={brl(kpis[p].cpf)} hint="investimento / seguidores" />
              <Stat label="Impressões" value={kpis[p].impressions.toLocaleString("pt-BR")} />
              <Stat label="Cliques" value={kpis[p].clicks.toLocaleString("pt-BR")} />
              <Stat label="CTR" value={pct(kpis[p].ctr)} hint="cliques / impressões" />
              <Stat label="Seguidores" value={kpis[p].followers.toLocaleString("pt-BR")} />
            </div>
          </Card>
        ))}
      </div>

      <Card title="Campanhas registradas (Meta Ads)" subtitle="Você pode editar retroativamente — dados são semanais/por campanha.">
        <Table
          columns={[
            { key: "profile", header: "Perfil", render: (r) => <Pill>{profileLabel(r.profile)}</Pill> },
            { key: "start_date", header: "Início" },
            { key: "end_date", header: "Fim" },
            { key: "spend", header: "Investimento", render: (r) => brl(Number(r.spend || 0)) },
            {
              key: "impressions",
              header: "Impressões",
              render: (r) => Number(r.impressions || 0).toLocaleString("pt-BR"),
            },
            { key: "clicks", header: "Cliques", render: (r) => Number(r.clicks || 0).toLocaleString("pt-BR") },
            {
              key: "followers",
              header: "Seguidores",
              render: (r) => Number(r.followers || 0).toLocaleString("pt-BR"),
            },
          ]}
          rows={metaRows}
          rowKey={(r) => r.id}
          actions={(r) => (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => openEdit(r)}>
                Editar
              </Button>
              <Button variant="ghost" onClick={() => remove(r.id)}>
                Excluir
              </Button>
            </div>
          )}
        />
      </Card>

      <Modal
        open={open}
        title={editingId ? "Editar campanha (Meta Ads)" : "Adicionar campanha (Meta Ads)"}
        subtitle="Dados manuais. Selecione o perfil correto."
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Perfil</Label>
              <Select value={form.profile} onChange={(e) => setForm((s) => ({ ...s, profile: e.target.value as Profile }))}>
                <option value="harley">Harley</option>
                <option value="giovanni">Giovanni</option>
              </Select>
            </div>

            <div className="hidden md:block" />

            <div>
              <Label>Início da campanha</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} />
            </div>

            <div>
              <Label>Fim da campanha</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm((s) => ({ ...s, end_date: e.target.value }))} />
            </div>

            <div>
              <Label>Impressões</Label>
              <Input type="number" min={0} value={form.impressions} onChange={(e) => setForm((s) => ({ ...s, impressions: Number(e.target.value || 0) }))} />
            </div>

            <div>
              <Label>Cliques</Label>
              <Input type="number" min={0} value={form.clicks} onChange={(e) => setForm((s) => ({ ...s, clicks: Number(e.target.value || 0) }))} />
            </div>

            <div>
              <Label>Seguidores</Label>
              <Input type="number" min={0} value={form.followers} onChange={(e) => setForm((s) => ({ ...s, followers: Number(e.target.value || 0) }))} />
            </div>

            <div>
              <Label>Investimento (R$)</Label>
              <Input type="number" min={0} step="0.01" value={form.spend} onChange={(e) => setForm((s) => ({ ...s, spend: Number(e.target.value || 0) }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={save}>{editingId ? "Salvar alterações" : "Salvar campanha"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
