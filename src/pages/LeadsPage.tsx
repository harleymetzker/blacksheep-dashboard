import React, { useEffect, useMemo, useState } from "react";
import DateRange from "../components/DateRange";
import { Button, Card, Input, Label, Modal, Select, Stat, Table, Pill } from "../components/ui";
import { Profile, pct, safeDiv, todayISO, uid } from "../lib/utils";
import {
  DailyFunnel,
  MeetingLead,
  deleteDailyFunnel,
  deleteMeetingLead,
  listDailyFunnel,
  listMeetingLeads,
  upsertDailyFunnel,
  upsertMeetingLead,
} from "../lib/db";

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

type TotalsBase = {
  contato: number;
  qualificacao: number;
  reuniao: number; // reunião marcada (manual)
};

function emptyTotalsBase(): TotalsBase {
  return { contato: 0, qualificacao: 0, reuniao: 0 };
}

function sumTotalsBase(rows: DailyFunnel[]): TotalsBase {
  const t = emptyTotalsBase();
  for (const r of rows) {
    t.contato += Number(r.contato || 0);
    t.qualificacao += Number(r.qualificacao || 0);
    t.reuniao += Number(r.reuniao || 0);
  }
  return t;
}

function convRate(from: number, to: number) {
  return pct(safeDiv(to * 100, from));
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

function maxISO(a: string, b: string) {
  return a >= b ? a : b;
}

function statusLabel(s: string) {
  if (s === "realizou") return "Reunião realizada";
  if (s === "no_show") return "No-show";
  if (s === "venda") return "Venda";
  if (s === "marcou") return "Marcado (legado)";
  if (s === "proposta") return "Proposta (legado)";
  return s;
}

function isRealizedStatus(s: string) {
  // ✅ venda também conta como reunião realizada
  return s === "realizou" || s === "venda";
}

export default function LeadsPage() {
  const today = new Date();
  const [range, setRange] = useState(() => ({
    start: startOfMonthISO(today),
    end: endOfMonthISO(today),
  }));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [dailyHarley, setDailyHarley] = useState<DailyFunnel[]>([]);
  const [dailyGio, setDailyGio] = useState<DailyFunnel[]>([]);

  // buscar amplo e filtrar no front por lead_date
  const [meetingHarleyAll, setMeetingHarleyAll] = useState<MeetingLead[]>([]);
  const [meetingGioAll, setMeetingGioAll] = useState<MeetingLead[]>([]);

  // Modal: Daily Funnel (per profile) — agora só 3 campos
  const [openDaily, setOpenDaily] = useState(false);
  const [dailyProfile, setDailyProfile] = useState<Profile>("harley");
  const [editingDailyId, setEditingDailyId] = useState<string | null>(null);
  const [dailyForm, setDailyForm] = useState({
    day: todayISO(),
    contato: 0,
    qualificacao: 0,
    reuniao: 0, // reunião marcada
  });

  // Modal: Meeting Lead (per profile) — status só 3 opções
  const [openLead, setOpenLead] = useState(false);
  const [leadProfile, setLeadProfile] = useState<Profile>("harley");
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({
    lead_date: todayISO(),
    name: "",
    contact: "",
    instagram: "",
    avg_revenue: 0,
    status: "realizou" as MeetingLead["status"], // default (usuário pode mudar)
    deal_value: null as number | null,
    deal_date: null as string | null,
    notes: "",
  });

  function resetDailyForm(profile: Profile) {
    setDailyProfile(profile);
    setEditingDailyId(null);
    setDailyForm({
      day: todayISO(),
      contato: 0,
      qualificacao: 0,
      reuniao: 0,
    });
  }

  function resetLeadForm(profile: Profile) {
    setLeadProfile(profile);
    setEditingLeadId(null);
    setLeadForm({
      lead_date: todayISO(),
      name: "",
      contact: "",
      instagram: "",
      avg_revenue: 0,
      status: "realizou",
      deal_value: null,
      deal_date: null,
      notes: "",
    });
  }

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      const queryEnd = maxISO(todayISO(), range.end);

      const [dh, dg, mhAll, mgAll] = await Promise.all([
        listDailyFunnel("harley", range.start, range.end),
        listDailyFunnel("giovanni", range.start, range.end),

        // ✅ busca ampla (lead_date pode ser retroativo)
        listMeetingLeads("harley", "2000-01-01", queryEnd),
        listMeetingLeads("giovanni", "2000-01-01", queryEnd),
      ]);

      setDailyHarley(dh ?? []);
      setDailyGio(dg ?? []);
      setMeetingHarleyAll(mhAll ?? []);
      setMeetingGioAll(mgAll ?? []);
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

  // filtra meeting leads por lead_date (fallback created_at) no período
  const meetingHarley = useMemo(() => {
    return (meetingHarleyAll ?? []).filter((r: any) => inRange(leadDateFallback(r), range.start, range.end));
  }, [meetingHarleyAll, range.start, range.end]);

  const meetingGio = useMemo(() => {
    return (meetingGioAll ?? []).filter((r: any) => inRange(leadDateFallback(r), range.start, range.end));
  }, [meetingGioAll, range.start, range.end]);

  // ✅ totals base (manual): contato/qualificação/reunião marcada
  const totalsHarleyBase = useMemo(() => sumTotalsBase(dailyHarley), [dailyHarley]);
  const totalsGioBase = useMemo(() => sumTotalsBase(dailyGio), [dailyGio]);

  // ✅ “reunião realizada” e “fechado” vêm do status dos leads
  function realizedCount(rows: MeetingLead[]) {
    return (rows ?? []).filter((r: any) => isRealizedStatus(String(r.status))).length;
  }
  function salesCount(rows: MeetingLead[]) {
    return (rows ?? []).filter((r: any) => String(r.status) === "venda").length;
  }

  const realizedHarley = useMemo(() => realizedCount(meetingHarley), [meetingHarley]);
  const realizedGio = useMemo(() => realizedCount(meetingGio), [meetingGio]);
  const salesHarley = useMemo(() => salesCount(meetingHarley), [meetingHarley]);
  const salesGio = useMemo(() => salesCount(meetingGio), [meetingGio]);

  // Conversões (agora coerentes com a regra nova)
  const ratesHarley = useMemo(() => {
    const t = totalsHarleyBase;
    return {
      q_from_c: convRate(t.contato, t.qualificacao),
      r_from_q: convRate(t.qualificacao, t.reuniao),
      realized_from_booked: convRate(t.reuniao, realizedHarley),
      sale_from_realized: convRate(realizedHarley, salesHarley),
    };
  }, [totalsHarleyBase, realizedHarley, salesHarley]);

  const ratesGio = useMemo(() => {
    const t = totalsGioBase;
    return {
      q_from_c: convRate(t.contato, t.qualificacao),
      r_from_q: convRate(t.qualificacao, t.reuniao),
      realized_from_booked: convRate(t.reuniao, realizedGio),
      sale_from_realized: convRate(realizedGio, salesGio),
    };
  }, [totalsGioBase, realizedGio, salesGio]);

  function openDailyModal(profile: Profile) {
    resetDailyForm(profile);
    setOpenDaily(true);
  }

  function editDaily(profile: Profile, row: DailyFunnel) {
    setDailyProfile(profile);
    setEditingDailyId(row.id);
    setDailyForm({
      day: row.day,
      contato: Number(row.contato || 0),
      qualificacao: Number(row.qualificacao || 0),
      reuniao: Number(row.reuniao || 0),
    });
    setOpenDaily(true);
  }

  async function saveDaily() {
    setErr(null);
    try {
      // ✅ mantemos proposta/fechado sempre 0 pra não contaminar nada
      const payload: Partial<DailyFunnel> = {
        id: editingDailyId ?? uid(),
        profile: dailyProfile,
        day: dailyForm.day,
        contato: Number(dailyForm.contato || 0),
        qualificacao: Number(dailyForm.qualificacao || 0),
        reuniao: Number(dailyForm.reuniao || 0),
        proposta: 0,
        fechado: 0,
      };

      await upsertDailyFunnel(payload);
      setOpenDaily(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar registro diário.");
    }
  }

  async function removeDaily(id: string) {
    if (!confirm("Excluir este registro diário?")) return;
    setErr(null);
    try {
      await deleteDailyFunnel(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir registro diário.");
    }
  }

  function openLeadModal(profile: Profile) {
    resetLeadForm(profile);
    setOpenLead(true);
  }

  function editLead(profile: Profile, row: MeetingLead) {
    setLeadProfile(profile);
    setEditingLeadId(row.id);

    setLeadForm({
      lead_date: (row as any).lead_date ?? (row.created_at ? String(row.created_at).slice(0, 10) : todayISO()),
      name: row.name ?? "",
      contact: row.contact ?? "",
      instagram: row.instagram ?? "",
      avg_revenue: Number(row.avg_revenue || 0),
      status: row.status,
      deal_value: (row as any).deal_value ?? null,
      deal_date: (row as any).deal_date ?? null,
      notes: row.notes ?? "",
    });

    setOpenLead(true);
  }

  async function saveLead() {
    setErr(null);
    try {
      const payload: Partial<MeetingLead> = {
        id: editingLeadId ?? uid(),
        profile: leadProfile,
        lead_date: leadForm.lead_date,
        name: leadForm.name.trim(),
        contact: leadForm.contact.trim(),
        instagram: leadForm.instagram.trim(),
        avg_revenue: Number(leadForm.avg_revenue || 0),
        status: leadForm.status,
        notes: leadForm.notes.trim(),
        deal_value: leadForm.status === "venda" ? Number(leadForm.deal_value || 0) : null,
        deal_date: leadForm.status === "venda" ? (leadForm.deal_date ?? todayISO()) : null,
      };

      if (!payload.name) return setErr("Nome do lead é obrigatório.");
      if (!payload.lead_date) return setErr("Dia da reunião é obrigatório.");

      await upsertMeetingLead(payload);
      setOpenLead(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar lead.");
    }
  }

  async function removeLead(id: string) {
    if (!confirm("Excluir este lead?")) return;
    setErr(null);
    try {
      await deleteMeetingLead(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir lead.");
    }
  }

  // ordenação
  const dailyHarleySorted = useMemo(
    () => (dailyHarley ?? []).slice().sort((a, b) => String(b.day).localeCompare(String(a.day))),
    [dailyHarley]
  );
  const dailyGioSorted = useMemo(
    () => (dailyGio ?? []).slice().sort((a, b) => String(b.day).localeCompare(String(a.day))),
    [dailyGio]
  );

  const meetingHarleySorted = useMemo(
    () => (meetingHarley ?? []).slice().sort((a: any, b: any) => leadDateFallback(b).localeCompare(leadDateFallback(a))),
    [meetingHarley]
  );
  const meetingGioSorted = useMemo(
    () => (meetingGio ?? []).slice().sort((a: any, b: any) => leadDateFallback(b).localeCompare(leadDateFallback(a))),
    [meetingGio]
  );

  const dailyLast5Harley = useMemo(() => dailyHarleySorted.slice(0, 5), [dailyHarleySorted]);
  const dailyLast5Gio = useMemo(() => dailyGioSorted.slice(0, 5), [dailyGioSorted]);

  function ProfileSection(props: {
    profile: Profile;
    dailyRows: DailyFunnel[];
    meetingRows: MeetingLead[];
    totalsBase: TotalsBase;
    realized: number;
    sales: number;
    rates: { q_from_c: string; r_from_q: string; realized_from_booked: string; sale_from_realized: string };
    last5: DailyFunnel[];
  }) {
    const { profile, dailyRows, meetingRows, totalsBase, realized, sales, rates, last5 } = props;

    const [dailyLimit, setDailyLimit] = useState(7);
    const [leadLimit, setLeadLimit] = useState(7);

    useEffect(() => {
      setDailyLimit(7);
      setLeadLimit(7);
    }, [range.start, range.end]);

    const dailyVisible = useMemo(() => dailyRows.slice(0, dailyLimit), [dailyRows, dailyLimit]);
    const leadsVisible = useMemo(() => meetingRows.slice(0, leadLimit), [meetingRows, leadLimit]);

    return (
      <div className="space-y-6">
        <Card
          title={`Perfil — ${profileLabel(profile)}`}
          subtitle={`Período: ${range.start} → ${range.end}`}
          right={loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}
        >
          {/* ✅ Layout igual ao que você mostrou: não muda visual, só a origem dos dados */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Stat label="Contato" value={totalsBase.contato.toLocaleString("pt-BR")} hint="" />
            <Stat label="Qualificação" value={totalsBase.qualificacao.toLocaleString("pt-BR")} hint={rates.q_from_c} />
            <Stat label="Reunião marcada" value={totalsBase.reuniao.toLocaleString("pt-BR")} hint={rates.r_from_q} />
            <Stat label="Reunião realizada" value={realized.toLocaleString("pt-BR")} hint={rates.realized_from_booked} />
            <Stat label="Fechado" value={sales.toLocaleString("pt-BR")} hint={rates.sale_from_realized} />
          </div>
        </Card>

        <Card
          title="Registros diários"
          subtitle="SDR preenche diariamente: contato, qualificação e reunião marcada."
          right={<Button onClick={() => openDailyModal(profile)}>Imput de dados</Button>}
        >
          <Table
            columns={[
              { key: "day", header: "Data" },
              { key: "contato", header: "Contato" },
              { key: "qualificacao", header: "Qualificação" },
              { key: "reuniao", header: "Reunião marcada" },
            ]}
            rows={dailyVisible}
            rowKey={(r) => r.id}
            actions={(r) => (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => editDaily(profile, r)}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => removeDaily(r.id)}>
                  Excluir
                </Button>
              </div>
            )}
          />

          {dailyRows.length > dailyVisible.length ? (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" onClick={() => setDailyLimit((n) => n + 7)}>
                Ver mais
              </Button>
            </div>
          ) : null}

          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold">Últimos 5 dias (comparação)</div>
            <Table
              columns={[
                { key: "day", header: "Data" },
                { key: "contato", header: "Contato" },
                { key: "qualificacao", header: "Qualificação" },
                { key: "reuniao", header: "Reunião marcada" },
              ]}
              rows={last5}
              rowKey={(r) => `last5-${r.id}`}
            />
          </div>

          <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-sm font-semibold">Conversões do período</div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-300">
              <Pill>Contato → Qualificação: {rates.q_from_c}</Pill>
              <Pill>Qualificação → Reunião marcada: {rates.r_from_q}</Pill>
              <Pill>Reunião marcada → Reunião realizada: {rates.realized_from_booked}</Pill>
              <Pill>Reunião realizada → Venda: {rates.sale_from_realized}</Pill>
            </div>
          </div>
        </Card>

        <Card
          title="Leads de reunião"
          subtitle='CLOSER: Atualize o status do lead: reunião realizada, no-show ou venda.'
          right={<Button onClick={() => openLeadModal(profile)}>Adicionar lead</Button>}
        >
          <Table
            columns={[
              { key: "lead_date", header: "Dia da reunião", render: (r) => leadDateFallback(r) },
              { key: "name", header: "Nome" },
              { key: "contact", header: "Contato" },
              { key: "instagram", header: "@ Instagram" },
              {
                key: "avg_revenue",
                header: "Faturamento médio",
                render: (r) =>
                  Number(r.avg_revenue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              },
              { key: "status", header: "Status", render: (r) => <Pill>{statusLabel(String(r.status))}</Pill> },
              {
                key: "deal_value",
                header: "Venda (R$)",
                render: (r: any) =>
                  String(r.status) === "venda"
                    ? Number(r.deal_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    : "",
              },
              { key: "notes", header: "Obs." },
            ]}
            rows={leadsVisible}
            rowKey={(r) => r.id}
            actions={(r) => (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => editLead(profile, r)}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => removeLead(r.id)}>
                  Excluir
                </Button>
              </div>
            )}
          />

          {meetingRows.length > leadsVisible.length ? (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" onClick={() => setLeadLimit((n) => n + 7)}>
                Ver mais
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Leads</div>
          <div className="text-sm text-slate-400">Seletor de datas controla o desempenho do time no período selecionado.</div>
        </div>

        <DateRange start={range.start} end={range.end} onChange={setRange} />
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{err}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6">
        <ProfileSection
          profile="harley"
          dailyRows={dailyHarleySorted}
          meetingRows={meetingHarleySorted}
          totalsBase={totalsHarleyBase}
          realized={realizedHarley}
          sales={salesHarley}
          rates={ratesHarley}
          last5={dailyLast5Harley}
        />

        <ProfileSection
          profile="giovanni"
          dailyRows={dailyGioSorted}
          meetingRows={meetingGioSorted}
          totalsBase={totalsGioBase}
          realized={realizedGio}
          sales={salesGio}
          rates={ratesGio}
          last5={dailyLast5Gio}
        />
      </div>

      {/* Modal: Daily (agora só 3 campos) */}
      <Modal
        open={openDaily}
        title={
          editingDailyId
            ? `Editar registro diário — ${profileLabel(dailyProfile)}`
            : `Novo registro diário — ${profileLabel(dailyProfile)}`
        }
        subtitle="Preencha somente: contato, qualificação e reunião marcada."
        onClose={() => setOpenDaily(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={dailyForm.day}
                onChange={(e) => setDailyForm((s) => ({ ...s, day: e.target.value }))}
              />
            </div>

            <div className="hidden md:block" />

            <div>
              <Label>Contato</Label>
              <Input
                type="number"
                min={0}
                value={dailyForm.contato}
                onChange={(e) => setDailyForm((s) => ({ ...s, contato: Number(e.target.value || 0) }))}
              />
            </div>

            <div>
              <Label>Qualificação</Label>
              <Input
                type="number"
                min={0}
                value={dailyForm.qualificacao}
                onChange={(e) => setDailyForm((s) => ({ ...s, qualificacao: Number(e.target.value || 0) }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Reunião marcada</Label>
              <Input
                type="number"
                min={0}
                value={dailyForm.reuniao}
                onChange={(e) => setDailyForm((s) => ({ ...s, reuniao: Number(e.target.value || 0) }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenDaily(false)}>
              Cancelar
            </Button>
            <Button onClick={saveDaily}>{editingDailyId ? "Salvar alterações" : "Salvar registro"}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Lead (status só 3 opções) */}
      <Modal
        open={openLead}
        title={editingLeadId ? `Editar lead — ${profileLabel(leadProfile)}` : `Novo lead — ${profileLabel(leadProfile)}`}
        subtitle="Status permitido: reunião realizada, no-show ou venda."
        onClose={() => setOpenLead(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Dia da reunião</Label>
              <Input
                type="date"
                value={leadForm.lead_date}
                onChange={(e) => setLeadForm((s) => ({ ...s, lead_date: e.target.value }))}
              />
            </div>

            <div className="hidden md:block" />

            <div className="md:col-span-2">
              <Label>Nome</Label>
              <Input value={leadForm.name} onChange={(e) => setLeadForm((s) => ({ ...s, name: e.target.value }))} />
            </div>

            <div>
              <Label>Contato do lead</Label>
              <Input value={leadForm.contact} onChange={(e) => setLeadForm((s) => ({ ...s, contact: e.target.value }))} />
            </div>

            <div>
              <Label>@ do Instagram</Label>
              <Input
                value={leadForm.instagram}
                onChange={(e) => setLeadForm((s) => ({ ...s, instagram: e.target.value }))}
              />
            </div>

            <div>
              <Label>Faturamento médio (do lead)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={leadForm.avg_revenue}
                onChange={(e) => setLeadForm((s) => ({ ...s, avg_revenue: Number(e.target.value || 0) }))}
              />
            </div>

            <div>
              <Label>Status</Label>
              <Select
                value={leadForm.status}
                onChange={(e) => {
                  const next = e.target.value as MeetingLead["status"];
                  setLeadForm((s) => ({
                    ...s,
                    status: next,
                    deal_value: next === "venda" ? (s.deal_value ?? 0) : null,
                    deal_date: next === "venda" ? (s.deal_date ?? todayISO()) : null,
                  }));
                }}
              >
                <option value="realizou">Reunião realizada</option>
                <option value="no_show">No-show</option>
                <option value="venda">Venda</option>
              </Select>
            </div>

            {leadForm.status === "venda" && (
              <>
                <div>
                  <Label>Valor da venda (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={leadForm.deal_value ?? 0}
                    onChange={(e) => setLeadForm((s) => ({ ...s, deal_value: Number(e.target.value || 0) }))}
                  />
                </div>

                <div>
                  <Label>Data do fechamento (deal_date)</Label>
                  <Input
                    type="date"
                    value={leadForm.deal_date ?? todayISO()}
                    onChange={(e) => setLeadForm((s) => ({ ...s, deal_date: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Input value={leadForm.notes} onChange={(e) => setLeadForm((s) => ({ ...s, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenLead(false)}>
              Cancelar
            </Button>
            <Button onClick={saveLead}>{editingLeadId ? "Salvar alterações" : "Salvar lead"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
