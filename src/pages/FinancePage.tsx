import React, { useEffect, useMemo, useState } from "react";
import DateRange from "../components/DateRange";
import { Button, Card, Input, Label, Modal, Select, Stat, Table } from "../components/ui";
import { brl, safeDiv, todayISO, uid } from "../lib/utils";
import { deleteFinance, listFinance, upsertFinance } from "../lib/db";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
  Cell,
} from "recharts";

/* ---------------- Helpers ---------------- */

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

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse robusto para valores monetários digitados.
 * Aceita:
 * - 17000,24
 * - 17000.24
 * - 17.000,24
 * - 17000
 */
function parseMoneyInput(raw: string): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;

  // mantém apenas dígitos, ponto, vírgula e sinal
  const cleaned = s.replace(/[^\d.,-]/g, "");

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  // 1) "1.234,56" => "1234.56"
  if (hasComma && hasDot) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    return safeNumber(normalized);
  }

  // 2) "1234,56" => "1234.56"
  if (hasComma && !hasDot) {
    const normalized = cleaned.replace(",", ".");
    return safeNumber(normalized);
  }

  // 3) "1234.56" ou "1234"
  return safeNumber(cleaned);
}

function storageKeyForRange(start: string, end: string) {
  return `bs_bank_balance:${start}:${end}`;
}

/* ---------------- Labels / Colors ---------------- */

const CATEGORY_LABEL: Record<string, string> = {
  administrativo: "Administrativo",
  pessoas: "Pessoas",
  impostos: "Impostos",
  sistemas: "Sistemas",
  marketing: "Marketing",
  comissoes: "Comissões",
  taxas: "Taxas",
  outros: "Outros",
};

const CATEGORY_COLOR_BY_KEY: Record<string, string> = {
  administrativo: "#3B82F6",
  pessoas: "#10B981",
  impostos: "#F59E0B",
  sistemas: "#6366F1",
  marketing: "#EC4899",
  comissoes: "#F97316",
  taxas: "#64748B",
  outros: "#94A3B8",
};

const COST_TYPE_COLORS: Record<string, string> = {
  fixa: "#3B82F6",
  variavel: "#F97316",
};

export default function FinancePage() {
  const today = new Date();

  const [range, setRange] = useState({
    start: startOfMonthISO(today),
    end: endOfMonthISO(today),
  });

  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const correctPassword = import.meta.env.VITE_FINANCE_PASSWORD;

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // saldo bancário manual (por período)
  const [bankBalanceInput, setBankBalanceInput] = useState<string>("");

  // modal
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    day: todayISO(),
    kind: "receita" as "receita" | "despesa" | "retirada",
    expense_type: null as any, // fixa/variavel apenas p/ despesa
    category: "administrativo",
    description: "",
    value: 0,
  });

  // carregar/salvar saldo manual por período no localStorage
  useEffect(() => {
    try {
      const key = storageKeyForRange(range.start, range.end);
      const stored = localStorage.getItem(key);
      setBankBalanceInput(stored ?? "");
    } catch {
      setBankBalanceInput("");
    }
  }, [range.start, range.end]);

  useEffect(() => {
    try {
      const key = storageKeyForRange(range.start, range.end);
      localStorage.setItem(key, bankBalanceInput);
    } catch {}
  }, [bankBalanceInput, range.start, range.end]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listFinance(range.start, range.end);
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authorized) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, authorized]);

  /* ---------------- DRE (retirada NÃO entra) ---------------- */

  const receita = useMemo(
    () => rows.filter((r) => r.kind === "receita").reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const fixos = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "despesa" && r.expense_type === "fixa")
        .reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const variaveis = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "despesa" && r.expense_type === "variavel")
        .reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const totalDespesas = fixos + variaveis;
  const lucro = receita - totalDespesas;
  const margem = safeDiv(lucro * 100, receita);

  /* ---------------- Caixa (retirada ENTRA) ---------------- */

  const retiradas = useMemo(
    () => rows.filter((r) => r.kind === "retirada").reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const entradasCaixa = receita;
  const saidasCaixa = totalDespesas;
  const fluxoLiquido = entradasCaixa - saidasCaixa - retiradas;

  const bankBalance = useMemo(() => parseMoneyInput(bankBalanceInput), [bankBalanceInput]);
  const saldoInicialEstimado = bankBalance - fluxoLiquido;

  /* ---------------- Gráficos ---------------- */

  const chartData = useMemo(
    () =>
      [...rows]
        .slice()
        .sort((a, b) => String(a.day).localeCompare(String(b.day)))
        .map((r) => ({
          day: r.day,
          // receita +, despesa -, retirada -
          valor: safeNumber(r.value) * (r.kind === "receita" ? 1 : -1),
        })),
    [rows]
  );

  const pieByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.kind !== "despesa") continue;
      const cat = String(r.category || "outros");
      map.set(cat, (map.get(cat) ?? 0) + safeNumber(r.value));
    }
    return Array.from(map.entries())
      .map(([category, value]) => ({
        name: CATEGORY_LABEL[category] ?? category,
        key: category,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const pieByType = useMemo(() => {
    return [
      { name: "Fixos", key: "fixa", value: fixos },
      { name: "Variáveis", key: "variavel", value: variaveis },
    ].filter((x) => x.value > 0);
  }, [fixos, variaveis]);

  /* ---------------- Modal / CRUD ---------------- */

  function openModal() {
    setEditingId(null);
    setForm({
      day: todayISO(),
      kind: "receita",
      expense_type: null,
      category: "administrativo",
      description: "",
      value: 0,
    });
    setOpen(true);
  }

  async function save() {
    setError(null);
    try {
      const isDespesa = form.kind === "despesa";
      const isRetirada = form.kind === "retirada";

      await upsertFinance({
        id: editingId ?? uid(),
        ...form,
        value: safeNumber(form.value),
        expense_type: isDespesa ? form.expense_type : null,
        // categoria só faz sentido p/ despesa; fora disso mantém "outros" para não quebrar NOT NULL
        category: isDespesa ? form.category : "outros",
        description: isRetirada && !form.description ? "Retirada de sócios" : form.description,
      });

      setOpen(false);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    setError(null);
    try {
      await deleteFinance(id);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir.");
    }
  }

  /* ---------------- Auth ---------------- */

  if (!authorized) {
    return (
      <div className="mx-auto mt-20 max-w-md space-y-4">
        <Card title="Acesso restrito — Financeiro">
          <div className="space-y-3">
            <Label>Senha</Label>
            <Input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
            <Button
              onClick={() => {
                if (passwordInput === correctPassword) {
                  setAuthorized(true);
                  setError(null);
                } else {
                  setError("Senha incorreta.");
                }
              }}
            >
              Acessar
            </Button>
            {error && <div className="text-sm text-red-400">{error}</div>}
          </div>
        </Card>
      </div>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Financeiro</div>
          <div className="text-sm text-slate-400">Resultado (DRE) + Caixa (saldo bancário) por período.</div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <DateRange start={range.start} end={range.end} onChange={setRange} />
          <Button onClick={openModal}>Registrar dados</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* CAIXA */}
      <Card title="Caixa (Conta bancária)">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Saldo atual (banco)</Label>
            <Input
              type="text"
              value={bankBalanceInput}
              onChange={(e) => setBankBalanceInput(e.target.value)}
              placeholder="Ex: 17.000,24"
            />
            <div className="text-xs text-slate-400">
              Esse número é manual (o real do banco). O sistema reconcilia com o período.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:col-span-2">
            <Stat label="Entradas" value={brl(entradasCaixa)} />
            <Stat label="Saídas" value={brl(saidasCaixa)} />
            <Stat label="Retiradas" value={brl(retiradas)} />
            <Stat label="Fluxo líquido" value={brl(fluxoLiquido)} />
            <Stat label="Saldo inicial (estim.)" value={brl(saldoInicialEstimado)} />
            <Stat label="Saldo atual" value={brl(bankBalance)} />
          </div>
        </div>
      </Card>

      {/* DRE */}
      <Card title="Resultado (DRE) — retiradas não afetam margem">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Stat label="Receita" value={brl(receita)} />
          <Stat label="Custos fixos" value={brl(fixos)} />
          <Stat label="Custos variáveis" value={brl(variaveis)} />
          <Stat label="Lucro" value={brl(lucro)} />
          <Stat label="Margem" value={`${margem.toFixed(1)}%`} />
        </div>
      </Card>

      {/* Linha */}
      <Card title="Evolução (lançamentos)">
        <div className="text-sm text-slate-400 mb-3">
          Receita entra positiva, despesas e retiradas entram negativas (movimento no período).
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip formatter={(v: any) => brl(Number(v))} labelFormatter={(l: any) => `Dia: ${l}`} />
            <Line type="monotone" dataKey="valor" stroke="#8884d8" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Pies */}
      <Card title="Distribuição de despesas (período)">
        {totalDespesas === 0 ? (
          <div className="text-sm text-slate-400">Sem despesas no período.</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">% por categoria (fixo + variável)</div>
              <div className="text-xs text-slate-400 mb-3">Base: {brl(totalDespesas)}.</div>

              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Tooltip
                    formatter={(v: any) => {
                      const value = Number(v);
                      const percent = safeDiv(value * 100, totalDespesas);
                      return [`${brl(value)} • ${percent.toFixed(1)}%`, "Valor"];
                    }}
                  />
                  <Legend />
                  <Pie data={pieByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}>
                    {pieByCategory.map((entry) => (
                      <Cell key={entry.key} fill={CATEGORY_COLOR_BY_KEY[String(entry.key)] ?? "#94A3B8"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">% por tipo de custo (fixo vs variável)</div>
              <div className="text-xs text-slate-400 mb-3">Base: {brl(totalDespesas)}.</div>

              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Tooltip
                    formatter={(v: any) => {
                      const value = Number(v);
                      const percent = safeDiv(value * 100, totalDespesas);
                      return [`${brl(value)} • ${percent.toFixed(1)}%`, "Valor"];
                    }}
                  />
                  <Legend />
                  <Pie data={pieByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}>
                    {pieByType.map((entry) => (
                      <Cell key={entry.key} fill={COST_TYPE_COLORS[String(entry.key)] ?? "#64748B"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Card>

      {/* Tabela */}
      <Card title="Lançamentos">
        <Table
          columns={[
            { key: "day", header: "Data" },
            { key: "kind", header: "Tipo" },
            { key: "expense_type", header: "Despesa" },
            { key: "category", header: "Categoria" },
            { key: "description", header: "Descrição" },
            { key: "value", header: "Valor", render: (r: any) => brl(safeNumber(r.value)) },
          ]}
          rows={rows}
          rowKey={(r: any) => r.id}
          actions={(r: any) => (
            <Button variant="ghost" onClick={() => remove(r.id)}>
              Excluir
            </Button>
          )}
        />
        {loading ? <div className="mt-3 text-xs text-slate-400">Carregando…</div> : null}
      </Card>

      {/* Modal */}
      <Modal open={open} title="Registrar lançamento" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Label>Dia</Label>
          <Input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />

          <Label>Tipo</Label>
          <Select
            value={form.kind}
            onChange={(e: any) => {
              // seu Select pode mandar string ou event
              const v = typeof e === "string" ? e : e?.target?.value;
              const kind = v as "receita" | "despesa" | "retirada";

              setForm({
                ...form,
                kind,
                expense_type: kind === "despesa" ? "fixa" : null,
                // categoria só é relevante se virar despesa, mas mantemos estado sem renderizar fora
                category: kind === "despesa" ? form.category : form.category,
              });
            }}
          >
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
            <option value="retirada">Retirada de sócios</option>
          </Select>

          {form.kind === "despesa" && (
            <>
              <Label>Tipo de despesa</Label>
              <Select
                value={form.expense_type ?? "fixa"}
                onChange={(e: any) => {
                  const v = typeof e === "string" ? e : e?.target?.value;
                  setForm({ ...form, expense_type: v });
                }}
              >
                <option value="fixa">Fixa</option>
                <option value="variavel">Variável</option>
              </Select>

              <Label>Categoria</Label>
              <Select
                value={form.category}
                onChange={(e: any) => {
                  const v = typeof e === "string" ? e : e?.target?.value;
                  setForm({ ...form, category: v });
                }}
              >
                <option value="administrativo">Administrativo</option>
                <option value="pessoas">Pessoas</option>
                <option value="impostos">Impostos</option>
                <option value="sistemas">Sistemas</option>
                <option value="marketing">Marketing</option>
                <option value="comissoes">Comissões</option>
                <option value="taxas">Taxas</option>
                <option value="outros">Outros</option>
              </Select>
            </>
          )}

          <Label>Descrição</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <Label>Valor (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value || 0) })}
          />

          <div className="flex justify-end">
            <Button onClick={save}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
