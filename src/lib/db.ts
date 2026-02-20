// src/lib/db.ts
import { supabase } from "./supabase";
import { Profile } from "./utils";

/* ---------------- Types ---------------- */

export type MetaAdsEntry = {
  id: string;
  profile: Profile;
  start_date: string;
  end_date: string;
  impressions: number;
  followers: number;
  spend: number;
  clicks: number;
  created_at?: string;
};

export type DailyFunnel = {
  id: string;
  profile: Profile;
  day: string;
  contato: number;
  qualificacao: number;
  reuniao: number;
  proposta: number;
  fechado: number;
  created_at?: string;
};

export type MeetingLead = {
  id: string;
  profile: Profile;
  created_at?: string;
  name: string;
  contact: string;
  instagram: string;
  avg_revenue: number;
  status: "marcou" | "realizou" | "no_show" | "venda" | "proposta";
  notes: string;

  lead_date?: string | null;
  deal_value?: number | null;
  deal_date?: string | null;
};

export type FinanceEntry = {
  id: string;
  day: string;
  kind: "receita" | "despesa" | "retirada";
  expense_type: "fixa" | "variavel" | null;
  category:
    | "administrativo"
    | "pessoas"
    | "impostos"
    | "sistemas"
    | "marketing"
    | "comissoes"
    | "taxas"
    | "outros";
  description: string;
  value: number;
  created_at?: string;
};

export type OpsTask = {
  id: string;
  created_at?: string;
  title: string;
  description: string;
  owner: string;
  due: string | null;
  status: "pausado" | "em_andamento" | "feito" | "arquivado";
};

export type BankBalanceEntry = {
  id: string;
  day: string;
  balance: number;
  notes?: string | null;
  created_at?: string;
};

export type OpsImportantItem = {
  id: string;
  created_at?: string;
  category: "login" | "link" | "material" | "procedimento" | "outro";
  title: string;
  description: string | null;
  url: string;
};

/**
 * Customer Success dentro da Operação
 * Colunas esperadas em ops_customers:
 * - id uuid (pk)
 * - entry_date date
 * - name text
 * - phone text
 * - product text
 * - paid_value numeric
 * - renewal_date date
 * - notes text (nullable)
 * - created_at timestamp
 *
 * Campos opcionais abaixo só se você quiser adicionar no futuro (não quebra o upsert via Partial).
 */
export type OpsCustomer = {
  id: string;
  created_at?: string;

  entry_date: string; // YYYY-MM-DD
  name: string;
  phone: string;
  product: string;
  paid_value: number;
  renewal_date: string; // YYYY-MM-DD
  notes?: string | null;

  // opcionais (se existirem na tabela)
  last_renewal_date?: string | null;
  churn_date?: string | null;
};

function mustConfigured() {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }
}

/* ---------------- Meta Ads ---------------- */

export async function listMetaAds(start: string, end: string) {
  mustConfigured();
  const { data, error } = await supabase
    .from("meta_ads_entries")
    .select("*")
    .gte("start_date", start)
    .lte("end_date", end)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MetaAdsEntry[];
}

export async function upsertMetaAds(row: Partial<MetaAdsEntry>) {
  mustConfigured();
  const { data, error } = await supabase.from("meta_ads_entries").upsert(row).select("*").single();
  if (error) throw error;
  return data as MetaAdsEntry;
}

export async function deleteMetaAds(id: string) {
  mustConfigured();
  const { error } = await supabase.from("meta_ads_entries").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Daily Funnel ---------------- */

export async function listDailyFunnel(profile: Profile, start: string, end: string) {
  mustConfigured();
  const { data, error } = await supabase
    .from("daily_funnel")
    .select("*")
    .eq("profile", profile)
    .gte("day", start)
    .lte("day", end)
    .order("day", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DailyFunnel[];
}

export async function upsertDailyFunnel(row: Partial<DailyFunnel>) {
  mustConfigured();
  const { data, error } = await supabase.from("daily_funnel").upsert(row).select("*").single();
  if (error) throw error;
  return data as DailyFunnel;
}

export async function deleteDailyFunnel(id: string) {
  mustConfigured();
  const { error } = await supabase.from("daily_funnel").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Meeting Leads ---------------- */

export async function listMeetingLeads(profile: Profile, start: string, end: string) {
  mustConfigured();
  const { data, error } = await supabase
    .from("meeting_leads")
    .select("*")
    .eq("profile", profile)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MeetingLead[];
}

export async function upsertMeetingLead(row: Partial<MeetingLead>) {
  mustConfigured();
  const { data, error } = await supabase.from("meeting_leads").upsert(row).select("*").single();
  if (error) throw error;
  return data as MeetingLead;
}

export async function deleteMeetingLead(id: string) {
  mustConfigured();
  const { error } = await supabase.from("meeting_leads").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Finance ---------------- */

export async function listFinance(start: string, end: string) {
  mustConfigured();
  const { data, error } = await supabase
    .from("finance_data")
    .select("*")
    .gte("day", start)
    .lte("day", end)
    .order("day", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FinanceEntry[];
}

export async function upsertFinance(row: Partial<FinanceEntry>) {
  mustConfigured();
  const { data, error } = await supabase.from("finance_data").upsert(row).select("*").single();
  if (error) throw error;
  return data as FinanceEntry;
}

export async function deleteFinance(id: string) {
  mustConfigured();
  const { error } = await supabase.from("finance_data").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Bank balances ---------------- */

export async function listBankBalances() {
  mustConfigured();
  const { data, error } = await supabase.from("bank_balances").select("*").order("day", { ascending: false });

  if (error) throw error;
  return (data ?? []) as BankBalanceEntry[];
}

export async function upsertBankBalance(row: Partial<BankBalanceEntry>) {
  mustConfigured();
  const { data, error } = await supabase.from("bank_balances").upsert(row).select("*").single();
  if (error) throw error;
  return data as BankBalanceEntry;
}

/* ---------------- Ops Tasks ---------------- */

export async function listOps() {
  mustConfigured();
  const { data, error } = await supabase.from("ops_tasks").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OpsTask[];
}

export async function upsertOps(row: Partial<OpsTask>) {
  mustConfigured();
  const { data, error } = await supabase.from("ops_tasks").upsert(row).select("*").single();
  if (error) throw error;
  return data as OpsTask;
}

export async function deleteOps(id: string) {
  mustConfigured();
  const { error } = await supabase.from("ops_tasks").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Ops Important Items ---------------- */

export async function listOpsImportantItems() {
  mustConfigured();
  const { data, error } = await supabase
    .from("ops_important_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as OpsImportantItem[];
}

export async function upsertOpsImportantItem(row: Partial<OpsImportantItem>) {
  mustConfigured();
  const { data, error } = await supabase.from("ops_important_items").upsert(row).select("*").single();
  if (error) throw error;
  return data as OpsImportantItem;
}

export async function deleteOpsImportantItem(id: string) {
  mustConfigured();
  const { error } = await supabase.from("ops_important_items").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Ops Customers (CS) ---------------- */

export async function listOpsCustomers() {
  mustConfigured();
  const { data, error } = await supabase
    .from("ops_customers")
    .select("*")
    .order("renewal_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as OpsCustomer[];
}

export async function upsertOpsCustomer(row: Partial<OpsCustomer>) {
  mustConfigured();
  const { data, error } = await supabase.from("ops_customers").upsert(row).select("*").single();
  if (error) throw error;
  return data as OpsCustomer;
}

export async function deleteOpsCustomer(id: string) {
  mustConfigured();
  const { error } = await supabase.from("ops_customers").delete().eq("id", id);
  if (error) throw error;
}

// =============================
// OPS CUSTOMERS (Customer Success)
// =============================

export type OpsCustomer = {
  id: string;
  created_at?: string;
  entry_date: string | null;
  name: string;
  phone: string | null;
  active_product: string | null;
  paid_value: number | null;
  renewal_date: string | null;
  churned_at?: string | null;
};

export async function listOpsCustomers(): Promise<OpsCustomer[]> {
  const { data, error } = await supabase
    .from("ops_customers")
    .select("*")
    .order("renewal_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function upsertOpsCustomer(row: Partial<OpsCustomer>) {
  const { error } = await supabase.from("ops_customers").upsert(row);
  if (error) throw error;
}

export async function deleteOpsCustomer(id: string) {
  const { error } = await supabase.from("ops_customers").delete().eq("id", id);
  if (error) throw error;
}

// =============================
// OPS CUSTOMER RENEWALS
// =============================

export type OpsCustomerRenewal = {
  id: string;
  created_at?: string;
  customer_id: string;
  renewal_date: string;
  paid_value: number | null;
  notes: string | null;
};

export async function listOpsCustomerRenewals(): Promise<OpsCustomerRenewal[]> {
  const { data, error } = await supabase
    .from("ops_customer_renewals")
    .select("*")
    .order("renewal_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function upsertOpsCustomerRenewal(row: Partial<OpsCustomerRenewal>) {
  const { error } = await supabase.from("ops_customer_renewals").upsert(row);
  if (error) throw error;
}

export async function deleteOpsCustomerRenewal(id: string) {
  const { error } = await supabase.from("ops_customer_renewals").delete().eq("id", id);
  if (error) throw error;
}
