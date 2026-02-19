import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Label, Modal, Select, Pill } from "../components/ui";
import { todayISO, uid } from "../lib/utils";
import {
  OpsTask,
  deleteOps,
  listOps,
  upsertOps,
  OpsImportantItem,
  deleteOpsImportantItem,
  listOpsImportantItems,
  upsertOpsImportantItem,
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
  if (c === "procedimento") return "Processos internos"; // ✅ alterado
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

export default function OpsPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [items, setItems] = useState<OpsImportantItem[]>([]);

  const [openTaskView, setOpenTaskView] = useState(false);
  const [viewTask, setViewTask] = useState<OpsTask | null>(null);

  const [openTaskEdit, setOpenTaskEdit] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    owner: "",
    due: "" as string,
    status: "em_andamento" as OpsStatus,
  });

  const [openItemEdit, setOpenItemEdit] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [itemForm, setItemForm] = useState({
    category: "link" as ImportantCategory,
    title: "",
    description: "",
    url: "",
  });

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [t, it] = await Promise.all([listOps(), listOpsImportantItems()]);
      setTasks(t ?? []);
      setItems(it ?? []);
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
    for (const [k, arr] of map.entries()) {
      map.set(
        k,
        arr.slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      );
    }
    return map;
  }, [items]);

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

  async function moveTask(t: OpsTask, next: OpsStatus) {
    setErr(null);
    try {
      await upsertOps({ id: t.id, status: next });
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao mover tarefa.");
    }
  }

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

  function TaskCard({ t }: { t: OpsTask }) {
    return (
      <div
        className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4 hover:bg-slate-950/30 cursor-pointer"
        onClick={() => openViewTask(t)}
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
            <Button variant="outline" onClick={(e) => { e.stopPropagation(); openEditTask(t); }}>
              Editar
            </Button>
            <Button variant="ghost" onClick={(e) => { e.stopPropagation(); removeTask(t.id); }}>
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

            {it.description && (
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{it.description}</div>
            )}

            <div className="mt-3">
              <a href={it.url} target="_blank" rel="noreferrer" className="text-sm text-slate-200 underline underline-offset-4">
                Abrir link
              </a>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => openEditItem(it)}>Editar</Button>
            <Button variant="ghost" onClick={() => removeItem(it.id)}>Excluir</Button>
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
          <div className="text-sm text-slate-400">Kanban de tarefas + dados importantes para o time.</div>
        </div>

        {/* ✅ BOTÃO DUPLICADO REMOVIDO — somente Nova tarefa */}
        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={openAddTask}>Nova tarefa</Button>
        </div>
      </div>

      {err && (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{err}</div>
      )}

      {/* KANBAN */}
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
                  <div key={t.id} className="space-y-2">
                    <TaskCard t={t} />
                    <div className="flex flex-wrap gap-2">
                      {STATUS_ORDER.filter((x) => x !== s).map((next) => (
                        <Button key={next} variant="ghost" onClick={() => moveTask(t, next)}>
                          Mover → {statusLabel(next)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}

                {tasksByStatus[s].length === 0 && (
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/10 px-4 py-6 text-sm text-slate-500">
                    Sem tarefas.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* DADOS IMPORTANTES */}
      <Card
        title="Dados importantes"
        subtitle="Central do time: logins/senhas, links úteis, materiais e processos internos. Apenas links (sem anexos)."
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
                  {arr.map((it) => <ImportantItemCard key={it.id} it={it} />)}
                </div>

                {arr.length === 0 && (
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/10 px-4 py-6 text-sm text-slate-500">
                    Nenhum item nesta categoria.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
