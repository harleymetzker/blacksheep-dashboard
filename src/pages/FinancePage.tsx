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
} from "recharts";

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

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    day: todayISO(),
    kind: "receita",
    expense_type: null as any,
    category: "administrativo",
    description: "",
    value: 0,
  });

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

  const receita = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "receita")
        .reduce((sum, r) => sum + Number(r.value || 0), 0),
    [rows]
  );

  const fixos = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "despesa" && r.expense_type === "fixa")
        .reduce((sum, r) => sum + Number(r.value || 0), 0),
    [rows]
  );

  const variaveis = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "despesa" && r.expense_type === "variavel")
        .reduce((sum, r) => sum + Number(r.value || 0), 0),
    [rows]
  );

  const totalDespesas = fixos + variaveis;

  const lucro = receita - totalDespesas;
  const margem = safeDiv(lucro * 100, receita);

  // Linha: você pode filtrar só por "day" e somar por dia, mas mantendo simples por enquanto
  const chartData = useMemo(
    () =>
      [...rows]
        .slice()
        .sort((a, b) => String(a.day).localeCompare(String(b.day)))
        .map((r) => ({
          day: r.day,
          valor: Number(r.value || 0) * (r.kind === "despesa" ? -1 : 1),
        })),
    [rows]
  );

  // Pizza #1: categorias (fixo + variável juntos) sobre o total de despesas
  const pieByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.kind !== "despesa") continue;
      const cat = String(r.category || "outros");
      map.set(cat, (map.get(cat) ?? 0) + Number(r.value || 0));
    }

    const arr = Array.from(map.entries())
      .map(([category, value]) => ({
        name: CATEGORY_LABEL[category] ?? category,
        key: category,
        value,
      }))
      .sort((a, b) => b.value - a.value);

    return arr;
  }, [rows]);

  // Pizza #2: fixo vs variável sobre o total de despesas
  const pieByType = useMemo(() => {
    return [
      { name: "Fixos", key: "fixa", value: fixos },
      { name: "Variáveis", key: "variavel", value: variaveis },
    ].filter((x) => x.value > 0);
  }, [fixos, variaveis]);

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
      await upsertFinance({
        id: editingId ?? uid(),
        ...form,
        value: Number(form.value || 0),
        // Normaliza: se não for despesa, expense_type vira null
        expense_type: form.kind === "despesa" ? form.expense_type : null,
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

  if (!authorized) {
    return (
      <div className="mx-auto mt-20 max-w-md space-y-4">
        <Card title="Acesso restrito — Financeiro">
          <div className="space-y-3">
            <Label>Senha</Label>
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Financeiro</div>
          <div className="text-sm text-slate-400">
            Resumo em tempo real + histórico por período.
          </div>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <Stat label="Receita" value={brl(receita)} />
        <Stat label="Custos fixos" value={brl(fixos)} />
        <Stat label="Custos variáveis" value={brl(variaveis)} />
        <Stat label="Lucro" value={brl(lucro)} />
        <Stat label="Margem" value={`${margem.toFixed(1)}%`} />
      </div>

      <Card title="Evolução (lançamentos)">
        <div className="text-sm text-slate-400 mb-3">
          Receita entra positiva, despesa entra negativa (para visualizar movimento).
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip
              formatter={(v: any) => brl(Number(v))}
              labelFormatter={(l: any) => `Dia: ${l}`}
            />
            <Line type="monotone" dataKey="valor" stroke="#8884d8" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Distribuição de despesas (período)">
        {totalDespesas === 0 ? (
          <div className="text-sm text-slate-400">Sem despesas no período.</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">
                % por categoria (fixo + variável)
              </div>
              <div className="text-xs text-slate-400 mb-3">
                Base: total de despesas do período ({brl(totalDespesas)}).
              </div>

              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Tooltip
                    formatter={(v: any, _n: any, p: any) => {
                      const value = Number(v);
                      const percent = safeDiv(value * 100, totalDespesas);
                      return [`${brl(value)} • ${percent.toFixed(1)}%`, "Valor"];
                    }}
                  />
                  <Legend />
                  <Pie
                    data={pieByCategory}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">
                % por tipo de custo (fixo vs variável)
              </div>
              <div className="text-xs text-slate-400 mb-3">
                Base: total de despesas do período ({brl(totalDespesas)}).
              </div>

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
                  <Pie
                    data={pieByType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Card>

      <Card title="Lançamentos">
        <Table
          columns={[
            { key: "day", header: "Data" },
            { key: "kind", header: "Tipo" },
            { key: "expense_type", header: "Despesa" },
            { key: "category", header: "Categoria" },
            { key: "description", header: "Descrição" },
            {
              key: "value",
              header: "Valor",
              render: (r) => brl(Number(r.value || 0)),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          actions={(r) => (
            <Button variant="ghost" onClick={() => remove(r.id)}>
              Excluir
            </Button>
          )}
        />
      </Card>

      <Modal open={open} title="Registrar lançamento" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Label>Dia</Label>
          <Input
            type="date"
            value={form.day}
            onChange={(e) => setForm({ ...form, day: e.target.value })}
          />

          <Label>Tipo</Label>
          <Select
            value={form.kind}
            onChange={(e) =>
              setForm({
                ...form,
                kind: e.target.value,
                expense_type: e.target.value === "despesa" ? "fixa" : null,
              })
            }
          >
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </Select>

          {form.kind === "despesa" && (
            <>
              <Label>Tipo de despesa</Label>
              <Select
                value={form.expense_type ?? "fixa"}
                onChange={(e) => setForm({ ...form, expense_type: e.target.value })}
              >
                <option value="fixa">Fixa</option>
                <option value="variavel">Variável</option>
              </Select>
            </>
          )}

          <Label>Categoria</Label>
          <Select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
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

          <Label>Descrição</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

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
