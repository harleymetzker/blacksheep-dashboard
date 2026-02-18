import React, { useEffect, useMemo, useState } from "react";
import DateRange from "../components/DateRange";
import { Button, Card, Input, Label, Modal, Select, Stat, Table, Pill } from "../components/ui";
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
  }, [range.start, range.end, authorized]);

  const receita = rows
    .filter((r) => r.kind === "receita")
    .reduce((sum, r) => sum + Number(r.value || 0), 0);

  const fixos = rows
    .filter((r) => r.kind === "despesa" && r.expense_type === "fixa")
    .reduce((sum, r) => sum + Number(r.value || 0), 0);

  const variaveis = rows
    .filter((r) => r.kind === "despesa" && r.expense_type === "variavel")
    .reduce((sum, r) => sum + Number(r.value || 0), 0);

  const lucro = receita - (fixos + variaveis);
  const margem = safeDiv(lucro * 100, receita);

  const chartData = rows.map((r) => ({
    day: r.day,
    valor: r.value,
  }));

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
    await upsertFinance({
      id: editingId ?? uid(),
      ...form,
      value: Number(form.value || 0),
    });
    setOpen(false);
    refresh();
  }

  async function remove(id: string) {
    await deleteFinance(id);
    refresh();
  }

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto mt-20 space-y-4">
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
                } else {
                  setError("Senha incorreta.");
                }
              }}
            >
              Acessar
            </Button>
            {error && <div className="text-red-400 text-sm">{error}</div>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <div className="text-lg font-semibold">Financeiro</div>
          <div className="text-sm text-slate-400">
            Resumo em tempo real + histórico por período.
          </div>
        </div>
        <div className="flex items-end gap-3">
          <DateRange start={range.start} end={range.end} onChange={setRange} />
          <Button onClick={openModal}>Registrar dados</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <Stat label="Receita" value={brl(receita)} />
        <Stat label="Custos fixos" value={brl(fixos)} />
        <Stat label="Custos variáveis" value={brl(variaveis)} />
        <Stat label="Lucro" value={brl(lucro)} />
        <Stat label="Margem" value={`${margem.toFixed(1)}%`} />
      </div>

      <Card title="Evolução">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="valor" stroke="#8884d8" />
          </LineChart>
        </ResponsiveContainer>
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
              render: (r) =>
                Number(r.value || 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }),
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
          <Input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />

          <Label>Tipo</Label>
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </Select>

          {form.kind === "despesa" && (
            <>
              <Label>Tipo de despesa</Label>
              <Select
                value={form.expense_type ?? ""}
                onChange={(e) => setForm({ ...form, expense_type: e.target.value })}
              >
                <option value="fixa">Fixa</option>
                <option value="variavel">Variável</option>
              </Select>
            </>
          )}

          <Label>Categoria</Label>
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
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
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <Label>Valor</Label>
          <Input
            type="number"
            step="0.01"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
          />

          <Button onClick={save}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
