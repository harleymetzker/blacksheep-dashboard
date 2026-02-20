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

type Totals = {
  contato: number;
  qualificacao: number;
  reuniao_marcada: number;
  reuniao_realizada: number;
  fechado: number;
};

function sumDailyTop(rows: DailyFunnel[]) {
  const out = { contato: 0, qualificacao: 0, reuniao_marcada: 0 };
  for (const r of rows) {
    out.contato += Number((r as any).contato || 0);
    out.qualificacao += Number((r as any).qualificacao || 0);
    out.reuniao_marcada += Number((r as any).reuniao || 0); // "reuniao" = reunião marcada
  }
  return out;
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

function isSale(row: any) {
  return String(row?.status) === "venda";
}

function isRealizada(row: any) {
  return String(row?.status) === "realizou";
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

  // Modal: Daily Funnel
  const [openDaily, setOpenDaily] = useState(false);
  const [dailyProfile, setDailyProfile] = useState<Profile>("harley");
  const [editingDailyId, setEditingDailyId] = useState<string | null>(null);
  const [dailyForm, setDailyForm] = useState({
    day: todayISO(),
    contato: 0,
    qualificacao: 0,
    reuniao: 0, // reunião marcada
  });

  // Modal: Meeting Lead
  const [openLead, setOpenLead] = useState(false);
  const [leadProfile, setLeadProfile] = useState<Profile>("harley");
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({
    lead_date: todayISO(),
    name: "",
    contact: "",
    instagram: "",
    avg_revenue: 0,

    // compat com banco: lead nasce "marcou" (pendente)
    status: "marcou" as MeetingLead["status"],

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
      status: "marcou",
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

  // Filtra por lead_date (dia da reunião)
  const meetingHarley = useMemo(() => {
    return (meetingHarleyAll ?? []).filter((r: any) => inRange(leadDateFallback(r), range.start, range.end));
  }, [meetingHarleyAll, range.start, range.end]);

  const meetingGio = useMemo(() => {
    return (meetingGioAll ?? []).filter((r: any) => inRange(leadDateFallback(r), range.start, range.end));
  }, [meetingGioAll, range.start, range.end]);

  // Totais do topo:
  // - contato/qualificação/reunião marcada: daily_funnel
  // - reunião realizada/fechado: status do lead
  const totalsHarley = useMemo(() => {
    const top = sumDailyTop(dailyHarley);
    const realizados = (meetingHarley ?? []).filter(isRealizada).length;
    const fechados = (meetingHarley ?? []).filter(isSale).length;

    return {
      contato: top.contato,
      qualificacao: top.qualificacao,
      reuniao_marcada: top.reuniao_marcada,
      reuniao_realizada: realizados,
      fechado: fechados,
    } as Totals;
  }, [dailyHarley, meetingHarley]);

  const totalsGio = useMemo(() => {
    const top = sumDailyTop(dailyGio);
    const realizados = (meetingGio ?? []).filter(isRealizada).length;
    const fechados = (meetingGio ?? []).filter(isSale).length;

    return {
      contato: top.contato,
      qualificacao: top.qualificacao,
      reuniao_marcada: top.reuniao_marcada,
      reuniao_realizada: realizados,
      fechado: fechados,
    } as Totals;
  }, [dailyGio, meetingGio]);

  const ratesHarley = useMemo(() => {
    const t = totalsHarley;
    return {
      q_from_c: convRate(t.contato, t.qualificacao),
      r_from_q: convRate(t.qualificacao, t.reuniao_marcada),
      p_from_r: convRate(t.reuniao_marcada, t.reuniao_realizada),
      f_from_p: convRate(t.reuniao_realizada, t.fechado),
    };
  }, [totalsHarley]);

  const ratesGio = useMemo(() => {
    const t = totalsGio;
    return {
      q_from_c: convRate(t.contato, t.qualificacao),
      r_from_q: convRate(t.qualificacao, t.reuniao_marcada),
      p_from_r: convRate(t.reuniao_marcada, t.reuniao_realizada),
      f_from_p: convRate(t.reuniao_realizada, t.fechado),
    };
  }, [totalsGio]);

  function openDailyModal(profile: Profile) {
    resetDailyForm(profile);
    setOpenDaily(true);
  }

  function editDaily(profile: Profile, row: DailyFunnel) {
    setDailyProfile(profile);
    setEditingDailyId((row as any).id);
    setDailyForm({
      day: (row as any).day,
      contato: Number((row as any).contato || 0),
      qualificacao: Number((row as any).qualificacao || 0),
      reuniao: Number((row as any).reuniao || 0),
    });
    setOpenDaily(true);
  }

  async function saveDaily() {
    setErr(null);
    try {
      const payload: Partial<DailyFunnel> = {
        id: editingDailyId ?? uid(),
        profile: dailyProfile,
        day: dailyForm.day,
        contato: Number(dailyForm.contato || 0),
        qualificacao: Number(dailyForm.qualificacao || 0),
        reuniao: Number(dailyForm.reuniao || 0),

        // mantém compat com schema (se as colunas existirem)
        proposta: 0 as any,
        fechado: 0 as any,
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
    setEditingLeadId((row as any).id);

    setLeadForm({
      lead_date: (row as any).lead_date ?? (row.created_at ? String(row.created_at).slice(0, 10) : todayISO()),
      name: (row as any).name ?? "",
      contact: (row as any).contact ?? "",
      instagram: (row as any).instagram ?? "",
      avg_revenue: Number((row as any).avg_revenue || 0),
      status: ((row as any).status ?? "marcou") as any,
      deal_value: (row as any).deal_value ?? null,
      deal_date: (row as any).deal_date ?? null,
      notes: (row as any).notes ?? "",
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

      if (!payload.name) {
        setErr("Nome do lead é obrigatório.");
        return;
      }

      if (!payload.lead_date) {
        setErr("Dia da reunião é obrigatório.");
        return;
      }

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

  const dailyHarleySorted = useMemo(
    () => (dailyHarley ?? []).slice().sort((a, b) => String((b as any).day).localeCompare(String((a as any).day))),
    [dailyHarley]
  );
  const dailyGioSorted = useMemo(
    () => (dailyGio ?? []).slice().sort((a, b) => String((b as any).day).localeCompare(String((a as any).day))),
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
    totals: Totals;
    rates: { q_from_c: string; r_from_q: string; p_from_r: string; f_from_p: string };
    last5: DailyFunnel[];
  }) {
    const { profile, dailyRows, meetingRows, totals, rates, last5 } = props;

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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Stat label="Contato" value={totals.contato.toLocaleString("pt-BR")} hint="" />
            <Stat label="Qualificação" value={totals.qualificacao.toLocaleString("pt-BR")} hint={rates.q_from_c} />
            <Stat
              label="Reunião marcada"
              value={totals.reuniao_marcada.toLocaleString("pt-BR")}
              hint={rates.r_from_q}
            />
            <Stat
              label="Reunião realizada"
              value={totals.reuniao_realizada.toLocaleString("pt-BR")}
              hint={rates.p_from_r}
            />
            <Stat label="Fechado" value={totals.fechado.toLocaleString("pt-BR")} hint={rates.f_from_p} />
          </div>
        </Card>

        <Card
          title="Registros diários"
          subtitle="SDR preenche só: Contato, Qualificação e Reunião marcada."
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
            rowKey={(r) => (r as any).id}
            actions={(r) => (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => editDaily(profile, r)}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => removeDaily((r as any).id)}>
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
              rowKey={(r) => `last5-${(r as any).id}`}
            />
          </div>

          <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-sm font-semibold">Conversões do período</div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-300">
              <Pill>Contato → Qualificação: {rates.q_from_c}</Pill>
              <Pill>Qualificação → Reunião marcada: {rates.r_from_q}</Pill>
              <Pill>Reunião marcada → Reunião realizada: {rates.p_from_r}</Pill>
              <Pill>Reunião realizada → Fechado: {rates.f_from_p}</Pill>
            </div>
          </div>
        </Card>

        <Card
          title="Leads de reunião"
          subtitle='Use para contatos que marcaram reunião. "Dia da reunião" usa lead_date e é a data principal desta página.'
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
                  Number((r as any).avg_revenue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              },
              { key: "status", header: "Status", render: (r) => <Pill>{String((r as any).status)}</Pill> },
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
            rowKey={(r) => (r as any).id}
            actions={(r) => (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => editLead(profile, r)}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => removeLead((r as any).id)}>
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
          totals={totalsHarley}
          rates={ratesHarley}
          last5={dailyLast5Harley}
        />

        <ProfileSection
          profile="giovanni"
          dailyRows={dailyGioSorted}
          meetingRows={meetingGioSorted}
          totals={totalsGio}
          rates={ratesGio}
          last5={dailyLast5Gio}
        />
      </div>

      {/* Modal: Daily */}
      <Modal
        open={openDaily}
        title={
          editingDailyId
            ? `Editar registro diário — ${profileLabel(dailyProfile)}`
            : `Novo registro diário — ${profileLabel(dailyProfile)}`
        }
        subtitle="SDR preenche só: Contato, Qualificação e Reunião marcada."
        onClose={() => setOpenDaily(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Data</Label>
              <Input type="date" value={dailyForm.day} onChange={(e) => setDailyForm((s) => ({ ...s, day: e.target.value }))} />
            </div>

            <div className="hidden md:block" />

            <div>
              <Label>Contato</Label>
              <Input type="number" min={0} value={dailyForm.contato} onChange={(e) => setDailyForm((s) => ({ ...s, contato: Number(e.target.value || 0) }))} />
            </div>

            <div>
              <Label>Qualificação</Label>
              <Input type="number" min={0} value={dailyForm.qualificacao} onChange={(e) => setDailyForm((s) => ({ ...s, qualificacao: Number(e.target.value || 0) }))} />
            </div>

            <div>
              <Label>Reunião marcada</Label>
              <Input type="number" min={0} value={dailyForm.reuniao} onChange={(e) => setDailyForm((s) => ({ ...s, reuniao: Number(e.target.value || 0) }))} />
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

      {/* Modal: Lead */}
      <Modal
        open={openLead}
        title={editingLeadId ? `Editar lead — ${profileLabel(leadProfile)}` : `Novo lead — ${profileLabel(leadProfile)}`}
        subtitle="Lead nasce pendente. Depois atualize para: reunião realizada / no-show / venda."
        onClose={() => setOpenLead(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Dia da reunião</Label>
              <Input type="date" value={leadForm.lead_date} onChange={(e) => setLeadForm((s) => ({ ...s, lead_date: e.target.value }))} />
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
              <Input value={leadForm.instagram} onChange={(e) => setLeadForm((s) => ({ ...s, instagram: e.target.value }))} />
            </div>

            <div>
              <Label>Faturamento médio (do lead)</Label>
              <Input type="number" step="0.01" min={0} value={leadForm.avg_revenue} onChange={(e) => setLeadForm((s) => ({ ...s, avg_revenue: Number(e.target.value || 0) }))} />
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
                {leadForm.status === "marcou" ? (
                  <option value="marcou" disabled>
                    pendente (marcou)
                  </option>
                ) : null}

                <option value="realizou">reunião realizada</option>
                <option value="no_show">no-show</option>
                <option value="venda">venda</option>
              </Select>
            </div>

            {leadForm.status === "venda" && (
              <>
                <div>
                  <Label>Valor da venda (R$)</Label>
                  <Input type="number" step="0.01" min={0} value={leadForm.deal_value ?? 0} onChange={(e) => setLeadForm((s) => ({ ...s, deal_value: Number(e.target.value || 0) }))} />
                </div>

                <div>
                  <Label>Data do fechamento (deal_date)</Label>
                  <Input type="date" value={leadForm.deal_date ?? todayISO()} onChange={(e) => setLeadForm((s) => ({ ...s, deal_date: e.target.value }))} />
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
