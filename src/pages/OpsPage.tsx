import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Label, Modal, Select, Pill, Table } from "../components/ui";
import { uid, todayISO } from "../lib/utils";
import {
  OpsTask,
  deleteOps,
  listOps,
  upsertOps,
  OpsImportantItem,
  deleteOpsImportantItem,
  listOpsImportantItems,
  upsertOpsImportantItem,
  CSClient,
  deleteCSClient,
  listCSClients,
  upsertCSClient,
} from "../lib/db";

type OpsStatus = OpsTask["status"];
type ImportantCategory = OpsImportantItem["category"];

const STATUS_ORDER: OpsStatus[] = ["pausado", "em_andamento", "feito", "arquivado"];

function statusLabel(s: OpsStatus) {
  if (s === "pausado") return "Pausado";
  if (s === "em_andamento") return "Em andamento";
  if (s === "feito") return "Feito";
  return "Arquivado";
}

function categoryLabel(c: ImportantCategory) {
  if (c === "login") return "Login/Senha";
  if (c === "link") return "Link útil";
  if (c === "material") return "Material";
  if (c === "processos_internos") return "Processos internos";
  return "Outro";
}

function isValidUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isoDate(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function addDaysISO(dayISO: string, days: number) {
  const d = new Date(dayISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(aISO: string, bISO: string) {
  const a = new Date(aISO + "T00:00:00").getTime();
  const b = new Date(bISO + "T00:00:00").getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

export default function OpsPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [items, setItems] = useState<OpsImportantItem[]>([]);
  const [clients, setClients] = useState<CSClient[]>([]);

  // ---------- Tasks: view modal ----------
  const [openTaskView, setOpenTaskView] = useState(false);
  const [viewTask, setViewTask] = useState<OpsTask | null>(null);

  // ---------- Tasks: add/edit modal ----------
  const [openTaskEdit, setOpenTaskEdit] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    owner: "",
    due: "" as string, // ISO yyyy-mm-dd
    status: "em_andamento" as OpsStatus,
  });

  // ---------- Important items: add/edit modal ----------
  const [openItemEdit, setOpenItemEdit] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [itemForm, setItemForm] = useState({
    category: "link" as ImportantCategory,
    title: "",
    description: "",
    url: "",
  });

  // ---------- CS: add/edit modal ----------
  const [openClientEdit, setOpenClientEdit] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  const [clientForm, setClientForm] = useState({
    entry_date: todayISO(),
    name: "",
    phone: "",
    product: "",
    amount_paid: 0,
    renewal_date: addDaysISO(todayISO(), 30),
    renewed: false,
  });

  // ---------- CS: popup from “Vencimentos próximos” ----------
  const [openClientView, setOpenClientView] = useState(false);
  const [viewClient, setViewClient] = useState<CSClient | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [t, it, cs] = await Promise.all([listOps(), listOpsImportantItems(), listCSClients()]);
      setTasks(t ?? []);
      setItems(it ?? []);
      setClients(cs ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const tasksByStatus = useMemo(() => {
    const map: Record<OpsStatus, OpsTask[]> = {
      pausado: [],
      em_andamento: [],
      feito: [],
      arquivado: [],
    };

    for (const t of tasks) {
      const s = (t.status ?? "em_andamento") as OpsStatus;
      map[s].push(t);
    }

    // ordena: com due primeiro, depois created_at desc
    for (const s of STATUS_ORDER) {
      map[s] = map[s].slice().sort((a, b) => {
        const ad = a.due ? String(a.due) : "9999-12-31";
        const bd = b.due ? String(b.due) : "9999-12-31";
        if (ad !== bd) return ad.localeCompare(bd);
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      });
    }

    return map;
  }, [tasks]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, OpsImportantItem[]>();
    for (const it of items) {
      const c = String(it.category || "outro");
      map.set(c, [...(map.get(c) ?? []), it]);
    }
    // sort by created_at desc
    for (const [k, arr] of map.entries()) {
      map.set(k, arr.slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
    }
    return map;
  }, [items]);

  // ---------- CS computed ----------
  const today = todayISO();
  const next30 = addDaysISO(today, 30);

  const clientsSorted = useMemo(() => {
    return [...clients].sort((a, b) => String(a.renewal_date).localeCompare(String(b.renewal_date)));
  }, [clients]);

  const expiringSoon = useMemo(() => {
    return clientsSorted.filter((c) => {
      const r = isoDate(c.renewal_date);
      if (!r) return false;
      return r >= today && r <= next30;
    });
  }, [clientsSorted, today, next30]);

  const totals = useMemo(() => {
    const total = clients.length;

    const active = clients.filter((c) => isoDate(c.renewal_date) >= today).length;
    const renewed = clients.filter((c) => !!c.renewed).length;
    const notRenewed = clients.filter((c) => isoDate(c.renewal_date) < today && !c.renewed).length;

    const pct = (n: number) => (total > 0 ? (n * 100) / total : 0);

    return {
      total,
      active,
      renewed,
      notRenewed,
      activePct: pct(active),
      renewedPct: pct(renewed),
      notRenewedPct: pct(notRenewed),
    };
  }, [clients, today]);

  // ---------- Task actions ----------
  function openAddTask() {
    setEditingTaskId(null);
    setTaskForm({
      title: "",
      description: "",
      owner: "",
      due: "",
      status: "em_andamento",
    });
    setOpenTaskEdit(true);
  }

  function openEditTask(t: OpsTask) {
    setEditingTaskId(t.id);
    setTaskForm({
      title: t.title ?? "",
      description: t.description ?? "",
      owner: t.owner ?? "",
      due: t.due ? String(t.due).slice(0, 10) : "",
      status: (t.status ?? "em_andamento") as OpsStatus,
    });
    setOpenTaskEdit(true);
  }

  function openViewTask(t: OpsTask) {
    setViewTask(t);
    setOpenTaskView(true);
  }

  async function saveTask() {
    setErr(null);
    try {
      const payload: Partial<OpsTask> = {
        id: editingTaskId ?? uid(),
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        owner: taskForm.owner.trim(),
        due: taskForm.due ? taskForm.due : null,
        status: taskForm.status,
      };

      if (!payload.title) {
        setErr("Título é obrigatório.");
        return;
      }

      await upsertOps(payload);
      setOpenTaskEdit(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar tarefa.");
    }
  }

  async function removeTask(id: string) {
    if (!confirm("Excluir esta tarefa?")) return;
    setErr(null);
    try {
      await deleteOps(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir tarefa.");
    }
  }

  // ---------- Important items actions ----------
  function openAddItem() {
    setEditingItemId(null);
    setItemForm({
      category: "link",
      title: "",
      description: "",
      url: "",
    });
    setOpenItemEdit(true);
  }

  function openEditItem(it: OpsImportantItem) {
    setEditingItemId(it.id);
    setItemForm({
      category: (it.category ?? "link") as ImportantCategory,
      title: it.title ?? "",
      description: it.description ?? "",
      url: it.url ?? "",
    });
    setOpenItemEdit(true);
  }

  async function saveItem() {
    setErr(null);
    try {
      const payload: Partial<OpsImportantItem> = {
        id: editingItemId ?? uid(),
        category: itemForm.category,
        title: itemForm.title.trim(),
        description: itemForm.description.trim(),
        url: itemForm.url.trim(),
      };

      if (!payload.title) {
        setErr("Título é obrigatório.");
        return;
      }
      if (!payload.url) {
        setErr("Link é obrigatório.");
        return;
      }
      if (!isValidUrl(payload.url)) {
        setErr("Link inválido. Use http:// ou https://");
        return;
      }

      await upsertOpsImportantItem(payload);
      setOpenItemEdit(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar item.");
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Excluir este item?")) return;
    setErr(null);
    try {
      await deleteOpsImportantItem(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir item.");
    }
  }

  // ---------- CS actions ----------
  function openAddClient() {
    setEditingClientId(null);
    setClientForm({
      entry_date: todayISO(),
      name: "",
      phone: "",
      product: "",
      amount_paid: 0,
      renewal_date: addDaysISO(todayISO(), 30),
      renewed: false,
    });
    setOpenClientEdit(true);
  }

  function openEditClient(c: CSClient) {
    setEditingClientId(c.id);
    setClientForm({
      entry_date: isoDate(c.entry_date) || todayISO(),
      name: c.name ?? "",
      phone: c.phone ?? "",
      product: c.product ?? "",
      amount_paid: Number(c.amount_paid || 0),
      renewal_date: isoDate(c.renewal_date) || addDaysISO(todayISO(), 30),
      renewed: !!c.renewed,
    });
    setOpenClientEdit(true);
  }

  async function saveClient() {
    setErr(null);
    try {
      const payload: Partial<CSClient> = {
        id: editingClientId ?? uid(),
        entry_date: clientForm.entry_date,
        name: clientForm.name.trim(),
        phone: clientForm.phone.trim(),
        product: clientForm.product.trim(),
        amount_paid: Number(clientForm.amount_paid || 0),
        renewal_date: clientForm.renewal_date,
        renewed: !!clientForm.renewed,
      };

      if (!payload.name) {
        setErr("Nome é obrigatório.");
        return;
      }
      if (!payload.phone) {
        setErr("Telefone é obrigatório.");
        return;
      }
      if (!payload.product) {
        setErr("Produto ativo é obrigatório.");
        return;
      }
      if (!payload.entry_date) {
        setErr("Data de entrada é obrigatória.");
        return;
      }
      if (!payload.renewal_date) {
        setErr("Data de renovação é obrigatória.");
        return;
      }

      await upsertCSClient(payload);
      setOpenClientEdit(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar cliente.");
    }
  }

  async function removeClient(id: string) {
    if (!confirm("Excluir este cliente?")) return;
    setErr(null);
    try {
      await deleteCSClient(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir cliente.");
    }
  }

  function openClientPopup(c: CSClient) {
    setViewClient(c);
    setOpenClientView(true);
  }

  // ---------- UI helpers ----------
  function TaskCard({ t }: { t: OpsTask }) {
    return (
      <div
        className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4 hover:bg-slate-950/30 cursor-pointer"
        onClick={() => openViewTask(t)}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{t.title}</div>
            <div className="mt-1 text-xs text-slate-400">
              {t.owner ? `Responsável: ${t.owner}` : "Sem responsável"}
              {t.due ? ` • Prazo: ${String(t.due).slice(0, 10)}` : ""}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                openEditTask(t);
              }}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                removeTask(t.id);
              }}
            >
              Excluir
            </Button>
          </div>
        </div>

        {t.description ? (
          <div className="mt-3 text-sm text-slate-300 line-clamp-3 whitespace-pre-wrap">{t.description}</div>
        ) : (
          <div className="mt-3 text-sm text-slate-500">Sem descrição.</div>
        )}
      </div>
    );
  }

  function ImportantItemCard({ it }: { it: OpsImportantItem }) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{categoryLabel(it.category)}</Pill>
              <div className="font-semibold truncate">{it.title}</div>
            </div>

            {it.description ? <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{it.description}</div> : null}

            <div className="mt-3">
              <a href={it.url} target="_blank" rel="noreferrer" className="text-sm text-slate-200 underline underline-offset-4">
                Abrir link
              </a>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => openEditItem(it)}>
              Editar
            </Button>
            <Button variant="ghost" onClick={() => removeItem(it.id)}>
              Excluir
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const csColumns = useMemo(
    () => [
      { key: "entry_date", header: "Entrada", render: (r: any) => isoDate(r.entry_date) },
      { key: "name", header: "Nome" },
      { key: "phone", header: "Telefone" },
      { key: "product", header: "Produto ativo" },
      {
        key: "amount_paid",
        header: "Valor pago",
        render: (r: any) =>
          Number(r.amount_paid || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      },
      {
        key: "renewal_date",
        header: "Renovação",
        render: (r: any) => {
          const d = isoDate(r.renewal_date);
          const days = diffDays(today, d);
          const badge =
            d < today ? "Vencido" : days <= 7 ? "Vence já" : days <= 30 ? "Próx. 30d" : "OK";

          return (
            <div className="flex flex-wrap items-center gap-2">
              <span>{d}</span>
              <Pill>{badge}</Pill>
            </div>
          );
        },
      },
      {
        key: "renewed",
        header: "Renovou?",
        render: (r: any) => <Pill>{r.renewed ? "Sim" : "Não"}</Pill>,
      },
    ],
    [today]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Operação</div>
          <div className="text-sm text-slate-400">Kanban, dados internos e Customer Success.</div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={openAddTask}>Nova tarefa</Button>
          <Button variant="outline" onClick={openAddItem}>
            Adicionar item (Dados importantes)
          </Button>
          <Button variant="outline" onClick={openAddClient}>
            Adicionar cliente (CS)
          </Button>
        </div>
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{err}</div>
      ) : null}

      {/* 1) KANBAN (sem botões mover) */}
      <Card
        title="Kanban de tarefas"
        subtitle="Clique no card para ver a descrição completa. Use Editar para alterar campos."
        right={loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{statusLabel(s)}</div>
                <Pill>{tasksByStatus[s].length}</Pill>
              </div>

              <div className="space-y-3">
                {tasksByStatus[s].map((t) => (
                  <TaskCard key={t.id} t={t} />
                ))}

                {tasksByStatus[s].length === 0 ? (
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/10 px-4 py-6 text-sm text-slate-500">
                    Sem tarefas.
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 2) DADOS IMPORTANTES (somente 1 botão de adicionar, no topo da página) */}
      <Card
        title="Dados importantes"
        subtitle="Central do time: logins/senhas, links úteis, materiais e processos internos. Apenas links (sem anexos)."
      >
        <div className="space-y-6">
          {(["login", "link", "material", "processos_internos", "outro"] as ImportantCategory[]).map((k) => {
            const arr = itemsByCategory.get(k) ?? [];
            return (
              <div key={k} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{categoryLabel(k)}</div>
                  <Pill>{arr.length}</Pill>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {arr.map((it) => (
                    <ImportantItemCard key={it.id} it={it} />
                  ))}
                </div>

                {arr.length === 0 ? (
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/10 px-4 py-6 text-sm text-slate-500">
                    Nenhum item nesta categoria.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 4) VENCIMENTOS PRÓXIMOS (card clicável abre popup com dados do cliente) */}
      <Card
        title="Vencimentos próximos (30 dias)"
        subtitle={`Hoje: ${today} • Janela: ${today} → ${next30}`}
        right={<Pill>{expiringSoon.length}</Pill>}
      >
        {expiringSoon.length === 0 ? (
          <div className="text-sm text-slate-400">Nenhum cliente vencendo nos próximos 30 dias.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {expiringSoon.map((c) => {
              const r = isoDate(c.renewal_date);
              const days = diffDays(today, r);
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openClientPopup(c)}
                  className="cursor-pointer rounded-3xl border border-slate-800 bg-slate-950/20 p-4 hover:bg-slate-950/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {c.product} • {c.phone}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Pill>Renova: {r}</Pill>
                      <Pill>{days <= 7 ? "Vence já" : `Faltam ${days}d`}</Pill>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-300">
                    Pago:{" "}
                    {Number(c.amount_paid || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} • Renovou?{" "}
                    <b>{c.renewed ? "Sim" : "Não"}</b>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 3) CUSTOMER SUCCESS (tabela completa) */}
      <Card
        title="Customer Success — clientes ativos"
        subtitle="Lista completa, ordenada por data de vencimento (mais próximo primeiro)."
        right={<Pill>Total: {clients.length}</Pill>}
      >
        <Table
          columns={csColumns as any}
          rows={clientsSorted}
          rowKey={(r: any) => r.id}
          actions={(r: any) => (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => openEditClient(r)}>
                Editar
              </Button>
              <Button variant="ghost" onClick={() => removeClient(r.id)}>
                Excluir
              </Button>
            </div>
          )}
        />
      </Card>

      {/* 5) CONTADORES */}
      <Card
        title="Indicadores de renovação"
        subtitle="Base: total de clientes cadastrados. Renovou é um marcador separado (não remove o cliente de ativo)."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Clientes ativos</div>
            <div className="mt-1 text-2xl font-semibold">{totals.active}</div>
            <div className="mt-2 text-sm text-slate-300">{totals.activePct.toFixed(1)}%</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Clientes que renovaram</div>
            <div className="mt-1 text-2xl font-semibold">{totals.renewed}</div>
            <div className="mt-2 text-sm text-slate-300">{totals.renewedPct.toFixed(1)}%</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Clientes que não renovaram</div>
            <div className="mt-1 text-2xl font-semibold">{totals.notRenewed}</div>
            <div className="mt-2 text-sm text-slate-300">{totals.notRenewedPct.toFixed(1)}%</div>
          </div>
        </div>
      </Card>

      {/* MODAL: VIEW TASK */}
      <Modal
        open={openTaskView}
        title={viewTask?.title ?? "Tarefa"}
        subtitle={viewTask?.owner ? `Responsável: ${viewTask.owner}` : "Sem responsável"}
        onClose={() => {
          setOpenTaskView(false);
          setViewTask(null);
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{viewTask?.status ? statusLabel(viewTask.status) : "—"}</Pill>
            {viewTask?.due ? <Pill>Prazo: {String(viewTask.due).slice(0, 10)}</Pill> : <Pill>Sem prazo</Pill>}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
            <div className="text-sm font-semibold">Descrição</div>
            <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
              {viewTask?.description ? viewTask.description : "Sem descrição."}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!viewTask) return;
                setOpenTaskView(false);
                openEditTask(viewTask);
              }}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!viewTask) return;
                setOpenTaskView(false);
                removeTask(viewTask.id);
              }}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD/EDIT TASK */}
      <Modal
        open={openTaskEdit}
        title={editingTaskId ? "Editar tarefa" : "Nova tarefa"}
        subtitle="Preencha os campos. Clique no card para visualizar."
        onClose={() => setOpenTaskEdit(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Título</Label>
              <Input value={taskForm.title} onChange={(e) => setTaskForm((s) => ({ ...s, title: e.target.value }))} />
            </div>

            <div>
              <Label>Responsável</Label>
              <Input value={taskForm.owner} onChange={(e) => setTaskForm((s) => ({ ...s, owner: e.target.value }))} />
            </div>

            <div>
              <Label>Prazo</Label>
              <Input type="date" value={taskForm.due} onChange={(e) => setTaskForm((s) => ({ ...s, due: e.target.value }))} />
            </div>

            <div className="md:col-span-2">
              <Label>Status</Label>
              <Select value={taskForm.status} onChange={(e) => setTaskForm((s) => ({ ...s, status: e.target.value as OpsStatus }))}>
                <option value="pausado">Pausado</option>
                <option value="em_andamento">Em andamento</option>
                <option value="feito">Feito</option>
                <option value="arquivado">Arquivado</option>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Input
                value={taskForm.description}
                onChange={(e) => setTaskForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Detalhes da tarefa"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenTaskEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={saveTask}>{editingTaskId ? "Salvar alterações" : "Salvar tarefa"}</Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD/EDIT IMPORTANT ITEM */}
      <Modal
        open={openItemEdit}
        title={editingItemId ? "Editar item (Dados importantes)" : "Adicionar item (Dados importantes)"}
        subtitle="Somente links (sem anexos)."
        onClose={() => setOpenItemEdit(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Categoria</Label>
              <Select
                value={itemForm.category}
                onChange={(e) => setItemForm((s) => ({ ...s, category: e.target.value as ImportantCategory }))}
              >
                <option value="login">Login/Senha</option>
                <option value="link">Link útil</option>
                <option value="material">Material</option>
                <option value="processos_internos">Processos internos</option>
                <option value="outro">Outro</option>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label>Título</Label>
              <Input value={itemForm.title} onChange={(e) => setItemForm((s) => ({ ...s, title: e.target.value }))} />
            </div>

            <div className="md:col-span-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={itemForm.description}
                onChange={(e) => setItemForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Contexto, instruções, observações"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Link</Label>
              <Input value={itemForm.url} onChange={(e) => setItemForm((s) => ({ ...s, url: e.target.value }))} placeholder="https://..." />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenItemEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={saveItem}>{editingItemId ? "Salvar alterações" : "Salvar item"}</Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD/EDIT CLIENT */}
      <Modal
        open={openClientEdit}
        title={editingClientId ? "Editar cliente (CS)" : "Adicionar cliente (CS)"}
        subtitle="Clientes e datas para renovação."
        onClose={() => setOpenClientEdit(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Data de entrada</Label>
              <Input
                type="date"
                value={clientForm.entry_date}
                onChange={(e) => setClientForm((s) => ({ ...s, entry_date: e.target.value }))}
              />
            </div>

            <div>
              <Label>Data de renovação</Label>
              <Input
                type="date"
                value={clientForm.renewal_date}
                onChange={(e) => setClientForm((s) => ({ ...s, renewal_date: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Nome</Label>
              <Input value={clientForm.name} onChange={(e) => setClientForm((s) => ({ ...s, name: e.target.value }))} />
            </div>

            <div>
              <Label>Telefone</Label>
              <Input value={clientForm.phone} onChange={(e) => setClientForm((s) => ({ ...s, phone: e.target.value }))} />
            </div>

            <div>
              <Label>Produto ativo</Label>
              <Input value={clientForm.product} onChange={(e) => setClientForm((s) => ({ ...s, product: e.target.value }))} />
            </div>

            <div>
              <Label>Valor pago (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={clientForm.amount_paid}
                onChange={(e) => setClientForm((s) => ({ ...s, amount_paid: Number(e.target.value || 0) }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Renovou?</Label>
              <Select
                value={clientForm.renewed ? "sim" : "nao"}
                onChange={(e) => setClientForm((s) => ({ ...s, renewed: e.target.value === "sim" }))}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenClientEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={saveClient}>{editingClientId ? "Salvar alterações" : "Salvar cliente"}</Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: VIEW CLIENT (popup do card de vencimentos próximos) */}
      <Modal
        open={openClientView}
        title={viewClient?.name ?? "Cliente"}
        subtitle={viewClient?.product ? `Produto: ${viewClient.product}` : "—"}
        onClose={() => {
          setOpenClientView(false);
          setViewClient(null);
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Pill>Entrada: {isoDate(viewClient?.entry_date)}</Pill>
            <Pill>Renovação: {isoDate(viewClient?.renewal_date)}</Pill>
            <Pill>Renovou? {viewClient?.renewed ? "Sim" : "Não"}</Pill>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4 space-y-2">
            <div className="text-sm">
              <span className="text-slate-400">Telefone:</span> <span className="font-semibold">{viewClient?.phone ?? "—"}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-400">Valor pago:</span>{" "}
              <span className="font-semibold">
                {Number(viewClient?.amount_paid || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!viewClient) return;
                setOpenClientView(false);
                openEditClient(viewClient);
              }}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!viewClient) return;
                setOpenClientView(false);
                removeClient(viewClient.id);
              }}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
