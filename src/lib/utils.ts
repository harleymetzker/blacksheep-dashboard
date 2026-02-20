// src/lib/utils.ts

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

/**
 * UUID real compatível com Supabase
 * (substitui gerador antigo que quebrava inserts)
 */
export function uid() {
  // Supabase costuma usar uuid. Isso garante UUID válido.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback (bem raro)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const STAGES = ["contato", "qualificacao", "reuniao", "proposta", "fechado"] as const;
export type Stage = typeof STAGES[number];

export function stageLabel(s: Stage) {
  switch (s) {
    case "contato":
      return "Contato";
    case "qualificacao":
      return "Qualificação";
    case "reuniao":
      return "Reunião";
    case "proposta":
      return "Proposta";
    case "fechado":
      return "Fechado";
  }
}
