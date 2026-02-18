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

/* ----------------- Helpers ----------------- */

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

/* 🔥 CORREÇÃO DEFINITIVA DO PARSE DECIMAL */
function parseMoneyInput(raw: string): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;

  const cleaned = s.replace(/[^\d.,-]/g, "");

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // 1.234,56
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    return safeNumber(normalized);
  }

  if (hasComma && !hasDot) {
    // 1234,56
    const normalized = cleaned.replace(",", ".");
    return safeNumber(normalized);
  }

  // 1234.56 ou 1234
  return safeNumber(cleaned);
}

/* ----------------- Cores ----------------- */

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

const CATEGORY_COLOR: Record<string, string> = {
  administrativo: "#3B82F6",
  pessoas: "#10B981",
  impostos: "#F59E0B",
  sistemas: "#6366F1",
  marketing: "#EC4899",
  comissoes: "#F97316",
  taxas: "#64748B",
  outros: "#94A3B8",
};

const COST_TYPE_COLOR: Record<string, string> = {
  fixa: "#3B82F6",
  variavel: "#F97316",
};

/* ----------------- Página ----------------- */

export default function FinancePage() {
  const today = new Date();
  const [range, setRange] = useState({
    start: startOfMonthISO(today),
    end: endOfMonthISO(today),
  });

  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const correctPassword = import.meta.env.VITE_FINANCE_PASSWORD;

  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [bankBalanceInput, setBankBalanceInput] = useState("");

  const [form, setForm] = useState({
    day: todayISO(),
    kind: "receita" as "receita" | "despesa" | "retirada",
    expense_type: null as any,
    category: "administrativo",
    description: "",
    value: 0,
  });

  async function refresh() {
    try {
      const data = await listFinance(range.start, range.end);
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar dados.");
    }
  }

  useEffect(() => {
    if (authorized) refresh();
  }, [range.start, range.end, authorized]);

  /* ---------- DRE (sem retirada) ---------- */

  const receita = useMemo(
    () => rows.filter(r => r.kind === "receita")
      .reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const fixos = useMemo(
    () => rows.filter(r => r.kind === "despesa" && r.expense_type === "fixa")
      .reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const variaveis = useMemo(
    () => rows.filter(r => r.kind === "despesa" && r.expense_type === "variavel")
      .reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const totalDespesas = fixos + variaveis;
  const lucro = receita - totalDespesas;
  const margem = safeDiv(lucro * 100, receita);

  /* ---------- Caixa (inclui retirada) ---------- */

  const retiradas = useMemo(
    () => rows.filter(r => r.kind === "retirada")
      .reduce((s, r) => s + safeNumber(r.value), 0),
    [rows]
  );

  const fluxoLiquido = receita - totalDespesas - retiradas;
  const bankBalance = parseMoneyInput(bankBalanceInput);
  const saldoInicialEstimado = bankBalance - fluxoLiquido;

  /* ---------- Gráfico Linha ---------- */

  const chartData = useMemo(
    () => rows
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(r => ({
        day: r.day,
        valor: safeNumber(r.value) *
          (r.kind === "receita" ? 1 : -1),
      })),
    [rows]
  );

  /* ---------- Pie Categoria ---------- */

  const pieByCategory = useMemo(() => {
    const map = new Map<string, number>();

    rows.forEach(r => {
      if (r.kind !== "despesa") return;
      map.set(r.category,
        (map.get(r.category) ?? 0) + safeNumber(r.value));
    });

    return Array.from(map.entries()).map(([key, value]) => ({
      key,
      name: CATEGORY_LABEL[key] ?? key,
      value,
    }));
  }, [rows]);

  const pieByType = [
    { key: "fixa", name: "Fixos", value: fixos },
    { key: "variavel", name: "Variáveis", value: variaveis },
  ].filter(x => x.value > 0);

  async function save() {
    await upsertFinance({
      id: uid(),
      ...form,
      value: safeNumber(form.value),
      expense_type: form.kind === "despesa" ? form.expense_type : null,
      category: form.kind === "despesa" ? form.category : "outros",
    });
    setOpen(false);
    refresh();
  }

  if (!authorized) {
    return (
      <div className="mx-auto mt-20 max-w-md">
        <Card title="Acesso restrito">
          <Input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
          />
          <Button onClick={() => {
            if (passwordInput === correctPassword) {
              setAuthorized(true);
            }
          }}>
            Acessar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <Card title="Caixa (Conta bancária)">
        <Label>Saldo atual (banco)</Label>
        <Input
          value={bankBalanceInput}
          onChange={e => setBankBalanceInput(e.target.value)}
          placeholder="Ex: 17000,24"
        />

        <div className="grid grid-cols-3 gap-3 mt-4">
          <Stat label="Entradas" value={brl(receita)} />
          <Stat label="Saídas" value={brl(totalDespesas)} />
          <Stat label="Retiradas" value={brl(retiradas)} />
          <Stat label="Fluxo líquido" value={brl(fluxoLiquido)} />
          <Stat label="Saldo inicial (estim.)" value={brl(saldoInicialEstimado)} />
          <Stat label="Saldo atual" value={brl(bankBalance)} />
        </div>
      </Card>

      <Card title="Resultado (DRE)">
        <div className="grid grid-cols-5 gap-3">
          <Stat label="Receita" value={brl(receita)} />
          <Stat label="Custos fixos" value={brl(fixos)} />
          <Stat label="Custos variáveis" value={brl(variaveis)} />
          <Stat label="Lucro" value={brl(lucro)} />
          <Stat label="Margem" value={`${margem.toFixed(1)}%`} />
        </div>
      </Card>

      <Card title="Distribuição de despesas">
        <div className="grid grid-cols-2 gap-6">

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieByCategory} dataKey="value" nameKey="name" outerRadius={110}>
                {pieByCategory.map(entry => (
                  <Cell key={entry.key}
                        fill={CATEGORY_COLOR[entry.key] ?? "#888"} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieByType} dataKey="value" nameKey="name" outerRadius={110}>
                {pieByType.map(entry => (
                  <Cell key={entry.key}
                        fill={COST_TYPE_COLOR[entry.key]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>

        </div>
      </Card>

      <Modal open={open} title="Registrar lançamento" onClose={() => setOpen(false)}>
        <Label>Tipo</Label>
        <Select
          value={form.kind}
          onChange={e => {
            const v = typeof e === "string" ? e : e.target.value;
            setForm({
              ...form,
              kind: v,
              expense_type: v === "despesa" ? "fixa" : null,
            });
          }}
        >
          <option value="receita">Receita</option>
          <option value="despesa">Despesa</option>
          <option value="retirada">Retirada</option>
        </Select>

        {form.kind === "despesa" && (
          <>
            <Label>Categoria</Label>
            <Select
              value={form.category}
              onChange={e => {
                const v = typeof e === "string" ? e : e.target.value;
                setForm({ ...form, category: v });
              }}
            >
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </>
        )}

        <Label>Valor</Label>
        <Input
          type="number"
          value={form.value}
          onChange={e => setForm({ ...form, value: Number(e.target.value) })}
        />

        <Button onClick={save}>Salvar</Button>
      </Modal>
    </div>
  );
}
