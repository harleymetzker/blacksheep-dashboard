export type Profile = "harley" | "giovanni";

export function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function pct(v: number) {
  if (!Number.isFinite(v)) return "0%";
  return `${v.toFixed(1)}%`;
}

export function safeDiv(a: number, b: number) {
  return b === 0 ? 0 : a / b;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const STAGES = ["contato", "qualificacao", "reuniao", "proposta", "fechado"] as const;
export type Stage = typeof STAGES[number];

export function stageLabel(s: Stage) {
  switch (s) {
    case "contato": return "Contato";
    case "qualificacao": return "Qualificação";
    case "reuniao": return "Reunião";
    case "proposta": return "Proposta";
    case "fechado": return "Fechado";
  }
}
