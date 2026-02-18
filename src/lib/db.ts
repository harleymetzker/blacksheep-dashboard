import { supabase } from "./supabase";
import { Profile } from "./utils";

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
};

export type FinanceEntry = {
  id: string;
  day: string;
  kind: "receita" | "despesa";
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
  owner: string;
  due: string | null;
  status: "backlog" | "em_andamento" | "bloqueado" | "feito";
};

function mustConfigured() {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }
}

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
