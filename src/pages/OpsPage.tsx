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
    due: "",
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
    try {
      const payload: Partial<OpsTask> = {
        id: editingTaskId ?? uid(),
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        owner: taskForm.owner.trim(),
        due: taskForm.due ? taskForm.due : null,
        status: taskForm.status,
      };
      if (!payload.title) return setErr("Título obrigatório.");
      await upsertOps(payload);
      setOpenTaskEdit(false);
      refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro.");
    }
  }

  async function removeTask(id: string) {
    if (!confirm("Excluir tarefa?")) return;
    await deleteOps(id);
    refresh();
  }

  async function moveTask(t: OpsTask, next: OpsStatus) {
    await upsertOps({ id: t.id, status: next });
    refresh();
  }

  function openAddItem() {
    setEditingItemId(null);
    setItemForm({ category: "link", title: "", description: "", url: "" });
    setOpenItemEdit(true);
  }

  function openEditItem(it: OpsImportantItem) {
    setEditingItemId(it.id);
    setItemForm({
      category: it.category,
      title: it.title ?? "",
      description: it.description ?? "",
      url: it.url ?? "",
    });
    setOpenItemEdit(true);
  }

  async function saveItem() {
    const payload: Partial<OpsImportantItem> = {
      id: editingItemId ?? uid(),
      ...itemForm,
    };
    if (!payload.title) return setErr("Título obrigatório.");
    if (!isValidUrl(payload.url ?? "")) return setErr("Link inválido.");
    await upsertOpsImportantItem(payload);
    setOpenItemEdit(false);
    refresh();
  }

  async function removeItem(id: string) {
    if (!confirm("Excluir item?")) return;
    await deleteOpsImportantItem(id);
    refresh();
  }

  function TaskCard({ t }: { t: OpsTask }) {
    return (
      <div
        className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4 hover:bg-slate-950/30 cursor-pointer"
        onClick={() => openViewTask(t)}
      >
        <div className="font-semibold">{t.title}</div>
        <div className="text-xs text-slate-400">
          {t.owner} {t.due ? `• ${t.due}` : ""}
        </div>
      </div>
    );
  }

  function ImportantItemCard({ it }: { it: OpsImportantItem }) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-950/20 p-4">
        <Pill>{categoryLabel(it.category)}</Pill>
        <div className="font-semibold mt-2">{it.title}</div>
        <a href={it.url} target="_blank" className="underline text-sm">
          Abrir link
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <div className="text-lg font-semibold">Operação</div>
          <div className="text-sm text-slate-400">Kanban + base do time</div>
        </div>

        {/* ✅ botão duplicado removido */}
        <Button onClick={openAddTask}>Nova tarefa</Button>
      </div>

      <Card title="Kanban">
        <div className="grid grid-cols-4 gap-4">
          {STATUS_ORDER.map((s) => (
            <div key={s}>
              <div className="font-semibold mb-2">{statusLabel(s)}</div>
              {tasksByStatus[s].map((t) => (
                <TaskCard key={t.id} t={t} />
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Dados importantes"
        right={<Button variant="outline" onClick={openAddItem}>Adicionar item</Button>}
      >
        {["login", "link", "material", "procedimento", "outro"].map((k) => {
          const arr = itemsByCategory.get(k) ?? [];
          return (
            <div key={k} className="mb-6">
              <div className="font-semibold mb-2">{categoryLabel(k as any)}</div>
              <div className="grid grid-cols-2 gap-3">
                {arr.map((it) => (
                  <ImportantItemCard key={it.id} it={it} />
                ))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
