import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Label, Modal, Select, Pill, Table } from "../components/ui";
import { uid } from "../lib/utils";
import {
  OpsTask,
  deleteOps,
  listOps,
  upsertOps,
  OpsImportantItem,
  deleteOpsImportantItem,
  listOpsImportantItems,
  upsertOpsImportantItem,
  // Customer Success
  OpsCustomer,
  deleteOpsCustomer,
  listOpsCustomers,
  upsertOpsCustomer,
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
  if (c === "procedimento") return "Processos internos";
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

function safeISODate(v: any): string {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function brl(n: any) {
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OpsPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [items, setItems] = useState<OpsImportantItem[]>([]);
  const [customers, setCustomers] = useState<OpsCustomer[]>([]);

  // Tasks: view modal
  const [openTaskView, setOpenTaskView] = useState(false);
  const [viewTask, setViewTask] = useState<OpsTask | null>(null);

  // Tasks: add/edit modal
  const [openTaskEdit, setOpenTaskEdit] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    owner: "",
    due: "" as string,
    status: "em_andamento" as OpsStatus,
  });

  // Important items: add/edit modal
  const [openItemEdit, setOpenItemEdit] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({
    category: "link" as ImportantCategory,
    title: "",
    description: "",
    url: "",
  });

  // CS: view modal
  const [openCustomerView, setOpenCustomerView] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<OpsCustomer | null>(null);

  // CS: add/edit modal
  const [openCustomerEdit, setOpenCustomerEdit] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({
    entry_date: "",
    name: "",
    phone: "",
    product: "",
    paid_value: 0,
    renewal_date: "",
    notes: "",
  });

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [t, it, cs] = await Promise.all([listOps(), listOpsImportantItems(), listOpsCustomers()]);
      setTasks(t ?? []);
      setItems(it ?? []);
      setCustomers(cs ?? []);
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

    for (const s of STATUS_ORDER) {
      map[s] = map[s].slice().sort((a, b) => {
        const ad = a.due ? String(a.due).slice(0, 10) : "9999-12-31";
        const bd = b.due ? String(b.due).slice(0, 10) : "9999-12-31";
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
    for (const [k, arr] of map.entries()) {
      map.set(k, arr.slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
    }
    return map;
  }, [items]);

  const customersSorted = useMemo(() => {
    return [...customers].sort((a, b) => safeISODate(a.renewal_date).localeCompare(safeISODate(b.renewal_date)));
  }, [customers]);

  const expiringNext30 = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 30);

    return customersSorted.filter((c) => {
      const d = safeISODate(c.renewal_date);
      if (!d) return false;
      const dt = new Date(d + "T00:00:00");
      return dt >= new Date(now.toISOString().slice(0, 10) + "T00:00:00") && dt <= end;
    });
  }, [customersSorted]);

  const csStats = useMemo(() => {
    const total = customers.length;
    // Como você falou: “renovou” é métrica separada, não tira de ativos.
    // Aqui fica simples: ativo = total cadastrado
    const ativos = total;

    // Se você tiver campo booleano/flag no DB, ajuste aqui.
    // Fallback: usa notes contendo “[renovou]” / “[nao_renovou]” se existir (não é obrigatório).
    const renovaram = customers.filter((c) => String((c as any).renewed ?? "").toLowerCase() === "true").length;
    const naoRenovaram = customers.filter((c) => String((c as any).not_renewed ?? "").toLowerCase() === "true").length;

    const pct = (n: number) => (total === 0 ? 0 : (n * 100) / total);
    return {
      total,
      ativos,
      renovaram,
      naoRenovaram,
      pAtivos: pct(ativos),
      pRenovaram: pct(renovaram),
      pNaoRenovaram: pct(naoRenovaram),
    };
  }, [customers]);

  // Tasks actions
  function openAddTask() {
    setEditingTaskId(null);
    setTaskForm({ title: "", description: "", owner: "", due: "", status: "em_andamento" });
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

  // Important items actions
  function openAddItem() {
    setEditingItemId(null);
    setItemForm({ category: "link", title: "", description: "", url: "" });
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

      if (!payload.title) return setErr("Título é obrigatório.");
      if (!payload.url) return setErr("Link é obrigatório.");
      if (!isValidUrl(payload.url)) return setErr("Link inválido. Use http:// ou https://");

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

  // CS actions
  function openAddCustomer() {
    setEditingCustomerId(null);
    setCustomerForm({
      entry_date: "",
      name: "",
      phone: "",
      product: "",
      paid_value: 0,
      renewal_date: "",
      notes: "",
    });
    setOpenCustomerEdit(true);
  }

  function openEditCustomer(c: OpsCustomer) {
    setEditingCustomerId(c.id);
    setCustomerForm({
      entry_date: safeISODate(c.entry_date),
      name: c.name ?? "",
      phone: c.phone ?? "",
      product: c.product ?? "",
      paid_value: Number(c.paid_value || 0),
      renewal_date: safeISODate(c.renewal_date),
      notes: c.notes ?? "",
    });
    setOpenCustomerEdit(true);
  }

  function openViewCustomer(c: OpsCustomer) {
    setViewCustomer(c);
    setOpenCustomerView(true);
  }

  async function saveCustomer() {
    setErr(null);
    try {
      const payload: Partial<OpsCustomer> = {
        id: editingCustomerId ?? uid(),
        entry_date: customerForm.entry_date || null,
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        product: customerForm.product.trim(),
        paid_value: Number(customerForm.paid_value || 0),
        renewal_date: customerForm.renewal_date || null,
        notes: customerForm.notes.trim(),
      } as any;

      if (!payload.name) return setErr("Nome é obrigatório.");
      if (!payload.renewal_date) return setErr("Data de renovação é obrigatória.");

      await upsertOpsCustomer(payload);
      setOpenCustomerEdit(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar cliente.");
    }
  }

  async function removeCustomer(id: string) {
    if (!confirm("Excluir este cliente?")) return;
    setErr(null);
    try {
      await deleteOpsCustomer(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir cliente.");
    }
  }

  // UI pieces
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Operação</div>
          <div className="text-sm text-slate-400">Kanban, dados internos e Customer Success.</div>
        </div>
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{err}</div>
      ) : null}

      {/* 1) KANBAN */}
      <Card
        title="Kanban de tarefas"
        subtitle="Clique no card para ver a descrição completa. Use Editar para alterar campos."
        right={<Button onClick={openAddTask}>Nova tarefa</Button>}
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

        {loading ? <div className="mt-3 text-xs text-slate-400">Carregando…</div> : null}
      </Card>

      {/* 2) DADOS IMPORTANTES */}
      <Card
        title="Dados importantes"
        subtitle="Central do time: logins/senhas, links úteis, materiais e processos internos. Apenas links."
        right={<Button variant="outline" onClick={openAddItem}>Adicionar item</Button>}
      >
        <div className="space-y-6">
          {["login", "link", "material", "procedimento", "outro"].map((k) => {
            const arr = itemsByCategory.get(k) ?? [];
            return (
              <div key={k} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{categoryLabel(k as any)}</div>
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

      {/* 3) CUSTOMER SUCCESS (tabela completa) */}
      <Card
        title="Customer Success"
        subtitle="Clientes ativos + datas e renovação. Ordenado por vencimento."
        right={<Button onClick={openAddCustomer}>Adicionar cliente</Button>}
      >
        <Table
          columns={[
            { key: "entry_date", header: "Entrada", render: (r: any) => safeISODate(r.entry_date) || "—" },
            { key: "name", header: "Nome" },
            { key: "phone", header: "Telefone" },
            { key: "product", header: "Produto ativo" },
            { key: "paid_value", header: "Valor pago", render: (r: any) => brl(r.paid_value) },
            { key: "renewal_date", header: "Renovação", render: (r: any) => safeISODate(r.renewal_date) || "—" },
          ]}
          rows={customersSorted}
          rowKey={(r: any) => r.id}
          actions={(r: any) => (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => openViewCustomer(r)}>
                Ver
              </Button>
              <Button variant="outline" onClick={() => openEditCustomer(r)}>
                Editar
              </Button>
              <Button variant="ghost" onClick={() => removeCustomer(r.id)}>
                Excluir
              </Button>
            </div>
          )}
        />

        {loading ? <div className="mt-3 text-xs text-slate-400">Carregando…</div> : null}
      </Card>

      {/* 4) VENCIMENTOS PRÓXIMOS */}
      <Card title="Vencimentos nos próximos 30 dias" subtitle="Clique em um cliente para ver os detalhes.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {expiringNext30.map((c) => (
            <div
              key={c.id}
              className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4 hover:bg-slate-950/30 cursor-pointer"
              onClick={() => openViewCustomer(c)}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Renovação: {safeISODate(c.renewal_date) || "—"} • Produto: {c.product || "—"}
                  </div>
                </div>
                <Pill>{brl(c.paid_value)}</Pill>
              </div>
            </div>
          ))}

          {expiringNext30.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/10 px-4 py-6 text-sm text-slate-500">
              Nenhum vencimento nos próximos 30 dias.
            </div>
          ) : null}
        </div>
      </Card>

      {/* 5) CONTADORES */}
      <Card title="Indicadores (Customer Success)" subtitle="Ativos = total cadastrado. Renovou / Não renovou dependem de flags no DB.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Clientes ativos</div>
            <div className="mt-1 text-2xl font-semibold">{csStats.ativos}</div>
            <div className="mt-1 text-xs text-slate-400">{csStats.pAtivos.toFixed(1)}% do total</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Clientes que renovaram</div>
            <div className="mt-1 text-2xl font-semibold">{csStats.renovaram}</div>
            <div className="mt-1 text-xs text-slate-400">{csStats.pRenovaram.toFixed(1)}% do total</div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Clientes que não renovaram</div>
            <div className="mt-1 text-2xl font-semibold">{csStats.naoRenovaram}</div>
            <div className="mt-1 text-xs text-slate-400">{csStats.pNaoRenovaram.toFixed(1)}% do total</div>
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
            <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{viewTask?.description || "Sem descrição."}</div>
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
              <Input
                type="date"
                value={taskForm.due}
                onChange={(e) => setTaskForm((s) => ({ ...s, due: e.target.value }))}
              />
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
              <Select value={itemForm.category} onChange={(e) => setItemForm((s) => ({ ...s, category: e.target.value as ImportantCategory }))}>
                <option value="login">Login/Senha</option>
                <option value="link">Link útil</option>
                <option value="material">Material</option>
                <option value="procedimento">Processos internos</option>
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

      {/* MODAL: VIEW CUSTOMER */}
      <Modal
        open={openCustomerView}
        title={viewCustomer?.name ?? "Cliente"}
        subtitle={viewCustomer?.product ? `Produto: ${viewCustomer.product}` : "—"}
        onClose={() => {
          setOpenCustomerView(false);
          setViewCustomer(null);
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Data de entrada</div>
              <div className="mt-1 font-semibold">{safeISODate(viewCustomer?.entry_date) || "—"}</div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Telefone</div>
              <div className="mt-1 font-semibold">{viewCustomer?.phone || "—"}</div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Valor pago</div>
              <div className="mt-1 font-semibold">{brl(viewCustomer?.paid_value)}</div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-xs text-slate-400">Data de renovação</div>
              <div className="mt-1 font-semibold">{safeISODate(viewCustomer?.renewal_date) || "—"}</div>
            </div>
          </div>

          {viewCustomer?.notes ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/20 px-5 py-4">
              <div className="text-sm font-semibold">Observações</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{viewCustomer.notes}</div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!viewCustomer) return;
                setOpenCustomerView(false);
                openEditCustomer(viewCustomer);
              }}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!viewCustomer) return;
                setOpenCustomerView(false);
                removeCustomer(viewCustomer.id);
              }}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD/EDIT CUSTOMER */}
      <Modal
        open={openCustomerEdit}
        title={editingCustomerId ? "Editar cliente (CS)" : "Adicionar cliente (CS)"}
        subtitle="Campos usados no acompanhamento de renovação."
        onClose={() => setOpenCustomerEdit(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Data de entrada</Label>
              <Input
                type="date"
                value={customerForm.entry_date}
                onChange={(e) => setCustomerForm((s) => ({ ...s, entry_date: e.target.value }))}
              />
            </div>

            <div>
              <Label>Data de renovação</Label>
              <Input
                type="date"
                value={customerForm.renewal_date}
                onChange={(e) => setCustomerForm((s) => ({ ...s, renewal_date: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Nome</Label>
              <Input value={customerForm.name} onChange={(e) => setCustomerForm((s) => ({ ...s, name: e.target.value }))} />
            </div>

            <div>
              <Label>Telefone</Label>
              <Input value={customerForm.phone} onChange={(e) => setCustomerForm((s) => ({ ...s, phone: e.target.value }))} />
            </div>

            <div>
              <Label>Produto ativo</Label>
              <Input value={customerForm.product} onChange={(e) => setCustomerForm((s) => ({ ...s, product: e.target.value }))} />
            </div>

            <div>
              <Label>Valor pago (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={customerForm.paid_value}
                onChange={(e) => setCustomerForm((s) => ({ ...s, paid_value: Number(e.target.value || 0) }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Input value={customerForm.notes} onChange={(e) => setCustomerForm((s) => ({ ...s, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenCustomerEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCustomer}>{editingCustomerId ? "Salvar alterações" : "Salvar cliente"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
