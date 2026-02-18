import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Label, Modal, Select, Pill, Stat } from "../components/ui";
import { uid } from "../lib/utils";
import { deleteOps, listOps, upsertOps } from "../lib/db";

type OpsStatus = "pausado" | "em_andamento" | "feito" | "arquivado";

function statusLabel(s: OpsStatus) {
  switch (s) {
    case "pausado": return "Pausado";
    case "em_andamento": return "Em andamento";
    case "feito": return "Feito";
    case "arquivado": return "Arquivado";
  }
}

export default function OpsPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    owner: "",
    due: "" as string | null,
    status: "pausado" as OpsStatus,
  });

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listOps();
      setRows(data);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const stats = useMemo(() => {
    const out: Record<OpsStatus, number> = {
      pausado: 0,
      em_andamento: 0,
      feito: 0,
      arquivado: 0,
    };
    for (const r of rows) {
      const s = (r.status ?? "pausado") as OpsStatus;
      if (out[s] !== undefined) out[s] += 1;
    }
    return out;
  }, [rows]);

  function openNew() {
    setEditingId(null);
    setForm({
      title: "",
      description: "",
      owner: "",
      due: null,
      status: "pausado",
    });
    setOpen(true);
  }

  function openEdit(r: any) {
    setEditingId(r.id);
    setForm({
      title: r.title ?? "",
      description: r.description ?? "",
      owner: r.owner ?? "",
      due: r.due ?? null,
      status: (r.status ?? "pausado") as OpsStatus,
    });
    setOpen(true);
  }

  async function save() {
    setErr(null);
    try {
      const payload = {
        id: editingId ?? uid(),
        title: form.title.trim(),
        description: form.description.trim(),
        owner: form.owner.trim(),
        due: form.due ? form.due : null,
        status: form.status,
      };

      if (!payload.title) {
        setErr("Título é obrigatório.");
        return;
      }

      await upsertOps(payload);
      setOpen(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta tarefa?")) return;
    setErr(null);
    try {
      await deleteOps(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir.");
    }
  }

  const cols: { key: OpsStatus; title: string }[] = [
    { key: "pausado", title: "Pausado" },
    { key: "em_andamento", title: "Em andamento" },
    { key: "feito", title: "Feito" },
    { key: "arquivado", title: "Arquivado" },
  ];

  const grouped = useMemo(() => {
    const g: Record<OpsStatus, any[]> = {
      pausado: [],
      em_andamento: [],
      feito: [],
      arquivado: [],
    };
    for (const r of rows) {
      const s = (r.status ?? "pausado") as OpsStatus;
      (g[s] ?? g.pausado).push(r);
    }
    for (const k of Object.keys(g) as OpsStatus[]) {
      g[k] = g[k].slice().sort((a, b) => {
        const ad = a.due ?? "9999-12-31";
        const bd = b.due ?? "9999-12-31";
        if (ad !== bd) return String(ad).localeCompare(String(bd));
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      });
    }
    return g;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Operação</div>
          <div className="text-sm text-slate-400">Kanban simples para execução.</div>
        </div>

        <div className="flex items-end gap-3">
          <Button onClick={openNew}>Adicionar tarefa</Button>
          {loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}
        </div>
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Pausado" value={stats.pausado} />
        <Stat label="Em andamento" value={stats.em_andamento} />
        <Stat label="Feito" value={stats.feito} />
        <Stat label="Arquivado" value={stats.arquivado} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {cols.map((c) => (
          <Card key={c.key} title={c.title} subtitle={`${grouped[c.key].length} tarefas`}>
            <div className="space-y-3">
              {grouped[c.key].length === 0 ? (
                <div className="text-sm text-slate-400">Sem tarefas.</div>
              ) : (
                grouped[c.key].map((t) => (
                  <div key={t.id} className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{t.title}</div>
                        {t.description ? (
                          <div className="mt-1 text-sm text-slate-300 whitespace-pre-wrap break-words">
                            {t.description}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-slate-500">Sem descrição.</div>
                        )}
                        <div className="mt-2 text-xs text-slate-400">
                          Dono: {t.owner || "—"} • Prazo: {t.due || "—"}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" onClick={() => openEdit(t)}>Editar</Button>
                        <Button variant="ghost" onClick={() => remove(t.id)}>Excluir</Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        title={editingId ? "Editar tarefa" : "Nova tarefa"}
        subtitle="Inclua descrição para o time saber exatamente o que fazer."
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div>
            <Label>Descrição (detalhes)</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
              rows={5}
              placeholder="Descreva exatamente o que precisa ser feito, contexto, links, critérios de pronto, etc."
            />
          </div>

          <div>
            <Label>Dono</Label>
            <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          </div>

          <div>
            <Label>Prazo</Label>
            <Input
              type="date"
              value={form.due ?? ""}
              onChange={(e) => setForm({ ...form, due: e.target.value || null })}
            />
          </div>

          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as OpsStatus })}
            >
              <option value="pausado">{statusLabel("pausado")}</option>
              <option value="em_andamento">{statusLabel("em_andamento")}</option>
              <option value="feito">{statusLabel("feito")}</option>
              <option value="arquivado">{statusLabel("arquivado")}</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editingId ? "Salvar alterações" : "Salvar tarefa"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
