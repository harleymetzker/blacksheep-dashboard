// src/pages/OpsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Label, Modal, Select, Pill, Table, Stat } from "../components/ui";
import { todayISO, brl, safeDiv } from "../lib/utils";
import {
  OpsTask,
  deleteOps,
  listOps,
  upsertOps,
  OpsImportantItem,
  deleteOpsImportantItem,
  listOpsImportantItems,
  upsertOpsImportantItem,
  OpsCustomer,
  deleteOpsCustomer,
  listOpsCustomers,
  upsertOpsCustomer,
  OpsCustomerRenewal,
  listOpsCustomerRenewals,
  upsertOpsCustomerRenewal,
  deleteOpsCustomerRenewal,
} from "../lib/db";

type OpsStatus = OpsTask["status"];
type ImportantCategory = OpsImportantItem["category"];

const STATUS_ORDER: OpsStatus[] = ["pausado", "em_andamento", "feito", "arquivado"];

// UUID real (compatível com Supabase uuid)
function uuid() {
  // @ts-ignore
  if (typeof crypto !== "undefined" && crypto?.randomUUID) return crypto.randomUUID();
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

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

function iso10(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function parseISODate(s?: string | null) {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function inNextDays(dateISO?: string | null, days = 30) {
  const d = parseISODate(dateISO);
  if (!d) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = addDays(start, days);
  return d >= start && d <= end;
}

function olderThanDays(dateISO?: string | null, days = 30) {
  const d = parseISODate(dateISO);
  if (!d) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const limit = addDays(start, -days);
  return d < limit;
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nextRenewalDefault(currentRenewalDate?: string | null) {
  const d = parseISODate(currentRenewalDate);
  if (!d) return todayISO();
  return addDays(d, 30).toISOString().slice(0, 10);
}

export default function OpsPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [items, setItems] = useState<OpsImportantItem[]>([]);
  const [customers, setCustomers] = useState<OpsCustomer[]>([]);
  const [renewals, setRenewals] = useState<OpsCustomerRenewal[]>([]);

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
    due: "" as string,
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

  // ---------- Customer: details modal ----------
  const [openCustomerView, setOpenCustomerView] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<OpsCustomer | null>(null);

  // ---------- Customer: add/edit modal ----------
  const [openCustomerEdit, setOpenCustomerEdit] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  const [customerForm, setCustomerForm] = useState({
    entry_date: todayISO(),
    name: "",
    phone: "",
    product: "",
    paid_value: "",
    renewal_date: "",
    notes: "",
  });

  // ---------- Renewal: add modal ----------
  const [openRenewalAdd, setOpenRenewalAdd] = useState(false);
  const [renewalCustomer, setRenewalCustomer] = useState<OpsCustomer | null>(null);

  const [renewalForm, setRenewalForm] = useState({
    renewal_date: todayISO(), // data do pagamento
    paid_value: "",
    notes: "",
    next_renewal_date: "", // próximo vencimento (atualiza ops_customers.renewal_date)
  });

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [t, it, cs, rn] = await Promise.all([
        listOps(),
        listOpsImportantItems(),
        listOpsCustomers(),
        listOpsCustomerRenewals(),
      ]);
      setTasks(t ?? []);
      setItems(it ?? []);
      setCustomers(cs ?? []);
      setRenewals(rn ?? []);
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
      map.set(k, arr.slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
    }
    return map;
  }, [items]);

  const renewalsByCustomer = useMemo(() => {
    const map = new Map<string, OpsCustomerRenewal[]>();
    for (const r of renewals) {
      const cid = String((r as any).customer_id ?? "");
      if (!cid) continue;
      map.set(cid, [...(map.get(cid) ?? []), r]);
    }
    for (const [k, arr] of map.entries()) {
      map.set(k, arr.slice().sort((a, b) => String(b.renewal_date ?? "").localeCompare(String(a.renewal_date ?? ""))));
    }
    return map;
  }, [renewals]);

  // ✅ LTV: entry_paid_value (imutável) + soma das renovações
  const ltvByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers ?? []) {
      const cid = String((c as any).id ?? "");
      const base = safeNum((c as any).entry_paid_value ?? (c as any).paid_value ?? 0);
      const rs = renewalsByCustomer.get(cid) ?? [];
      const sumRenewals = rs.reduce((acc, r) => acc + safeNum((r as any).paid_value ?? 0), 0);
      map.set(cid, base + sumRenewals);
    }
    return map;
  }, [customers, renewalsByCustomer]);

  const upcomingRenewals = useMemo(() => {
    return (customers ?? [])
      .filter((c: any) => inNextDays(c.renewal_date, 30))
      .slice()
      .sort((a: any, b: any) => String(a.renewal_date ?? "").localeCompare(String(b.renewal_date ?? "")));
  }, [customers]);

  const totalToRenew30 = useMemo(() => {
    return (upcomingRenewals ?? []).reduce((acc: number, c: any) => acc + safeNum(c.paid_value ?? 0), 0);
  }, [upcomingRenewals]);

  const totalCollectedRenewals = useMemo(() => {
    return (renewals ?? []).reduce((acc: number, r: any) => acc + safeNum(r.paid_value ?? 0), 0);
  }, [renewals]);

  const csStats = useMemo(() => {
    const total = (customers ?? []).length;

    const renewedSet = new Set<string>();
    for (const r of renewals ?? []) {
      const cid = String((r as any).customer_id ?? "");
      if (cid) renewedSet.add(cid);
    }

    const active = (customers ?? []).filter((c: any) => !(c.churned_at || c.churn_date)).length;
    const renewed = renewedSet.size;

    const notRenewed = (customers ?? []).filter((c: any) => {
      const cid = String((c as any).id ?? "");
      const hasRenewal = renewedSet.has(cid);
      if (hasRenewal) return false;
      if (!c.renewal_date) return false;
      return olderThanDays(c.renewal_date, 30);
    }).length;

    const pctActive = safeDiv(active * 100, total);
    const pctRenewed = safeDiv(renewed * 100, total);
    const pctNotRenewed = safeDiv(notRenewed * 100, total);

    return { total, active, renewed, notRenewed, pctActive, pctRenewed, pctNotRenewed };
  }, [customers, renewals]);

  // ---------- Tasks actions ----------
  function openAddTask() {
    setEditingTaskId(null);
    setTaskForm({ title: "", description: "", owner: "", due: "", status: "em_andamento" });
    setOpenTaskEdit(true);
  }

  function openEditTask(t: OpsTask) {
    setEditingTaskId((t as any).id);
    setTaskForm({
      title: (t as any).title ?? "",
      description: (t as any).description ?? "",
      owner: (t as any).owner ?? "",
      due: (t as any).due ? String((t as any).due).slice(0, 10) : "",
      status: ((t as any).status ?? "em_andamento") as OpsStatus,
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
        id: editingTaskId ?? uuid(),
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
    setItemForm({ category: "link", title: "", description: "", url: "" });
    setOpenItemEdit(true);
  }

  function openEditItem(it: OpsImportantItem) {
    setEditingItemId((it as any).id);
    setItemForm({
      category: ((it as any).category ?? "link") as ImportantCategory,
      title: (it as any).title ?? "",
      description: (it as any).description ?? "",
      url: (it as any).url ?? "",
    });
    setOpenItemEdit(true);
  }

  async function saveItem() {
    setErr(null);
    try {
      const payload: Partial<OpsImportantItem> = {
        id: editingItemId ?? uuid(),
        category: itemForm.category,
        title: itemForm.title.trim(),
        description: itemForm.description.trim() || null,
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

  // ---------- Customer actions ----------
  function openCustomerDetails(c: OpsCustomer) {
    setViewCustomer(c);
    setOpenCustomerView(true);
  }

  function openAddCustomer() {
    setEditingCustomerId(null);
    setCustomerForm({
      entry_date: todayISO(),
      name: "",
      phone: "",
      product: "",
      paid_value: "",
      renewal_date: "",
      notes: "",
    });
    setOpenCustomerEdit(true);
  }

  function openEditCustomer(c: OpsCustomer) {
    setEditingCustomerId(String((c as any).id));
    setCustomerForm({
      entry_date: iso10((c as any).entry_date) || todayISO(),
      name: String((c as any).name ?? ""),
      phone: String((c as any).phone ?? ""),
      product: String((c as any).product ?? (c as any).active_product ?? ""),
      paid_value: String((c as any).paid_value ?? ""),
      renewal_date: iso10((c as any).renewal_date) || "",
      notes: String((c as any).notes ?? ""),
    });
    setOpenCustomerEdit(true);
  }

  async function saveCustomer() {
    setErr(null);
    try {
      const isNew = !editingCustomerId;
      const paid = customerForm.paid_value ? safeNum(customerForm.paid_value) : null;

      const payload: Partial<OpsCustomer> = {
        id: editingCustomerId ?? uuid(),
        entry_date: customerForm.entry_date || null,
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim() || null,
        ...(customerForm.product.trim()
          ? ({ product: customerForm.product.trim(), active_product: customerForm.product.trim() } as any)
          : ({} as any)),
        paid_value: paid as any, // valor atual
        renewal_date: customerForm.renewal_date || null,
        notes: customerForm.notes.trim() || null,
        ...(isNew ? ({ entry_paid_value: paid } as any) : ({} as any)), // ✅ valor inicial (imutável)
      };

      if (!payload.name) return setErr("Nome é obrigatório.");

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

  // ---------- Renewal actions ----------
  function openAddRenewal(c: OpsCustomer) {
    const currentRenewal = iso10((c as any).renewal_date) || todayISO();
    setRenewalCustomer(c);
    setRenewalForm({
      renewal_date: todayISO(),
      paid_value: String((c as any).paid_value ?? ""),
      notes: "",
      next_renewal_date: nextRenewalDefault(currentRenewal),
    });
    setOpenRenewalAdd(true);
  }

  async function saveRenewal() {
  setErr(null);
  try {
    if (!renewalCustomer) return;

    // 1) grava a renovação (histórico)
    const renewalPayload: Partial<OpsCustomerRenewal> = {
      id: uuid(),
      customer_id: renewalCustomer.id,
      renewal_date: renewalForm.renewal_date || todayISO(),
      paid_value: renewalForm.paid_value ? safeNum(renewalForm.paid_value) : null,
      notes: renewalForm.notes.trim() || null,
    };

    await upsertOpsCustomerRenewal(renewalPayload);

    // 2) opcional (recomendado): atualiza o cliente com o "valor atual" (paid_value)
    // IMPORTANTE: manda 'name' junto pra nunca cair em NOT NULL se o Supabase tentar inserir.
    const currentProduct = String((renewalCustomer as any).product ?? (renewalCustomer as any).active_product ?? "").trim();

    await upsertOpsCustomer({
      id: renewalCustomer.id,

      // campos NOT NULL (evita o erro)
      name: String((renewalCustomer as any).name ?? "").trim() || "Sem nome",
      entry_date: (renewalCustomer as any).entry_date ?? todayISO(),

      // campos opcionais
      phone: (renewalCustomer as any).phone ?? null,
      ...(currentProduct
        ? ({ product: currentProduct, active_product: currentProduct } as any)
        : ({} as any)),

      // aqui vira o "valor atual"
      paid_value: renewalForm.paid_value ? safeNum(renewalForm.paid_value) : (renewalCustomer as any).paid_value ?? null,

      // NÃO mexo na renewal_date do cliente aqui porque depende da sua regra (mensal/anual etc).
      // Se você quiser atualizar o próximo vencimento automaticamente, me diga a regra.
      renewal_date: (renewalCustomer as any).renewal_date ?? null,
    } as any);

    setOpenRenewalAdd(false);
    setRenewalCustomer(null);
    await refresh();
  } catch (e: any) {
    setErr(e?.message ?? "Erro ao registrar renovação.");
  }
}

  async function removeRenewal(id: string) {
    if (!confirm("Excluir esta renovação?")) return;
    setErr(null);
    try {
      await deleteOpsCustomerRenewal(id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir renovação.");
    }
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
            <div className="font-semibold truncate">{(t as any).title}</div>
            <div className="mt-1 text-xs text-slate-400">
              {(t as any).owner ? `Responsável: ${(t as any).owner}` : "Sem responsável"}
              {(t as any).due ? ` • Prazo: ${String((t as any).due).slice(0, 10)}` : ""}
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
                removeTask(String((t as any).id));
              }}
            >
              Excluir
            </Button>
          </div>
        </div>

        {(t as any).description ? (
          <div className="mt-3 text-sm text-slate-300 line-clamp-3 whitespace-pre-wrap">{(t as any).description}</div>
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
              <Pill>{categoryLabel((it as any).category)}</Pill>
              <div className="font-semibold truncate">{(it as any).title}</div>
            </div>

            {(it as any).description ? (
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{(it as any).description}</div>
            ) : null}

            <div className="mt-3">
              <a
                href={(it as any).url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-slate-200 underline underline-offset-4"
              >
                Abrir link
              </a>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => openEditItem(it)}>
              Editar
            </Button>
            <Button variant="ghost" onClick={() => removeItem(String((it as any).id))}>
              Excluir
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const customerColumns = useMemo(
    () => [
      { key: "entry_date", header: "Entrada", render: (r: any) => iso10(r.entry_date) },
      { key: "name", header: "Nome", render: (r: any) => <span className="font-semibold">{String(r.name ?? "")}</span> },
      { key: "phone", header: "Telefone", render: (r: any) => String(r.phone ?? "") },
      { key: "product", header: "Produto ativo", render: (r: any) => String(r.product ?? r.active_product ?? "") },
      { key: "paid_value", header: "Valor pago", render: (r: any) => brl(safeNum(r.paid_value ?? 0)) },
      { key: "renewal_date", header: "Renovação", render: (r: any) => iso10(r.renewal_date) },
      { key: "ltv", header: "LTV", render: (r: any) => brl(safeNum(ltvByCustomer.get(String(r.id)) ?? 0)) },
      {
        key: "renewed",
        header: "Renovou",
        render: (r: any) => {
          const has = (renewalsByCustomer.get(String(r.id)) ?? []).length > 0;
          return has ? <Pill>Sim</Pill> : <Pill>Não</Pill>;
        },
      },
    ],
    [renewalsByCustomer, ltvByCustomer]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Operação</div>
          <div className="text-sm text-slate-400">Kanban + dados importantes + customer success.</div>
        </div>

        <div className="flex items-center gap-2">
          {loading ? <Pill>carregando…</Pill> : <Pill>ok</Pill>}
          <Button variant="outline" onClick={refresh}>
            Atualizar
          </Button>
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
                  <TaskCard key={String((t as any).id)} t={t} />
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

      {/* 2) DADOS IMPORTANTES */}
      <Card
        title="Dados importantes"
        subtitle="Central do time: logins/senhas, links úteis, materiais e processos internos. Apenas links."
        right={
          <Button variant="outline" onClick={openAddItem}>
            Adicionar item
          </Button>
        }
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
                    <ImportantItemCard key={String((it as any).id)} it={it} />
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

      {/* 3) CUSTOMER SUCCESS */}
      <Card
        title="Customer Success"
        subtitle="LTV = entry_paid_value + soma de renovações. Valor pago = valor atual do ciclo."
        right={<Button onClick={openAddCustomer}>Adicionar cliente</Button>}
      >
        <Table
          columns={customerColumns as any}
          rows={customers as any}
          rowKey={(r: any) => r.id}
          actions={(r: any) => (
  <div className="flex justify-end gap-2">
    <Button variant="outline" onClick={() => openAddRenewal(r)}>
      Marcar renovação
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
      </Card>

      {/* 4) VENCIMENTOS PRÓXIMOS */}
      <Card title="Vencimentos nos próximos 30 dias" subtitle="Clique no cliente para abrir os dados.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mb-4">
          <Stat label="Total em R$ a ser renovado (30 dias)" value={brl(totalToRenew30)} />
          <Stat label="Total coletado em renovações" value={brl(totalCollectedRenewals)} />
        </div>

        {upcomingRenewals.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-950/10 px-4 py-6 text-sm text-slate-500">
            Nenhum vencimento nos próximos 30 dias.
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingRenewals.map((c: any) => (
              <div
                key={String(c.id)}
                className="rounded-3xl border border-slate-800 bg-slate-950/20 px-4 py-4 hover:bg-slate-950/30 cursor-pointer"
                onClick={() => openCustomerDetails(c)}
                role="button"
                tabIndex={0}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{String(c.name ?? "")}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {String(c.product ?? c.active_product ?? "")}
                      {c.phone ? ` • ${String(c.phone)}` : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Pill>Renova: {iso10(c.renewal_date)}</Pill>
                    <Pill>{brl(safeNum(c.paid_value ?? 0))}</Pill>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 5) CONTADORES */}
      <Card
        title="Indicadores de base (cadastro)"
        subtitle="Não renovou = passou 30 dias do renewal_date sem renovação."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Clientes cadastrados" value={String(csStats.total)} />
          <Stat label="Clientes ativos" value={`${csStats.active} (${csStats.pctActive.toFixed(1)}%)`} />
          <Stat label="Clientes que renovaram" value={`${csStats.renewed} (${csStats.pctRenewed.toFixed(1)}%)`} />
          <Stat label="Clientes que não renovaram" value={`${csStats.notRenewed} (${csStats.pctNotRenewed.toFixed(1)}%)`} />
        </div>
      </Card>

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
              />
            </div>

            <div className="md:col-span-2">
              <Label>Link</Label>
              <Input
                value={itemForm.url}
                onChange={(e) => setItemForm((s) => ({ ...s, url: e.target.value }))}
                placeholder="https://..."
              />
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

      {/* MODAL: ADD/EDIT CUSTOMER */}
      <Modal
        open={openCustomerEdit}
        title={editingCustomerId ? "Editar cliente" : "Adicionar cliente"}
        subtitle="Cadastro do cliente ativo."
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
              <Label>Data de renovação (vencimento)</Label>
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
              <Input
                value={customerForm.phone}
                onChange={(e) => setCustomerForm((s) => ({ ...s, phone: e.target.value }))}
              />
            </div>

            <div>
              <Label>Produto ativo</Label>
              <Input
                value={customerForm.product}
                onChange={(e) => setCustomerForm((s) => ({ ...s, product: e.target.value }))}
              />
            </div>

            <div>
              <Label>Valor pago (valor atual)</Label>
              <Input
                type="number"
                step="0.01"
                value={customerForm.paid_value}
                onChange={(e) => setCustomerForm((s) => ({ ...s, paid_value: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observações (opcional)</Label>
              <Input
                value={customerForm.notes}
                onChange={(e) => setCustomerForm((s) => ({ ...s, notes: e.target.value }))}
              />
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

      {/* MODAL: ADD RENEWAL */}
      <Modal
        open={openRenewalAdd}
        title="Marcar renovação"
        subtitle={renewalCustomer?.name ? `Cliente: ${renewalCustomer.name}` : "Cliente"}
        onClose={() => {
          setOpenRenewalAdd(false);
          setRenewalCustomer(null);
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={renewalForm.renewal_date}
                onChange={(e) => setRenewalForm((s) => ({ ...s, renewal_date: e.target.value }))}
              />
            </div>

            <div>
              <Label>Valor pago (renovação)</Label>
              <Input
                type="number"
                step="0.01"
                value={renewalForm.paid_value}
                onChange={(e) => setRenewalForm((s) => ({ ...s, paid_value: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Próximo vencimento (remove do card de 30 dias)</Label>
              <Input
                type="date"
                value={renewalForm.next_renewal_date}
                onChange={(e) => setRenewalForm((s) => ({ ...s, next_renewal_date: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observações (opcional)</Label>
              <Input value={renewalForm.notes} onChange={(e) => setRenewalForm((s) => ({ ...s, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpenRenewalAdd(false);
                setRenewalCustomer(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={saveRenewal}>Salvar renovação</Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: VIEW TASK (mantive só os essenciais para não inflar o arquivo aqui) */}
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
        </div>
      </Modal>

      {/* MODAL: ADD/EDIT TASK */}
      <Modal
        open={openTaskEdit}
        title={editingTaskId ? "Editar tarefa" : "Nova tarefa"}
        subtitle="Preencha os campos."
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
              <Input value={taskForm.description} onChange={(e) => setTaskForm((s) => ({ ...s, description: e.target.value }))} />
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
    </div>
  );
}
