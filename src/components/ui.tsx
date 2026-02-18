import React from "react";
import { X } from "lucide-react";

export function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>;
}

export function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/40 shadow-soft">
      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            {title ? <div className="text-base font-semibold">{title}</div> : null}
            {subtitle ? <div className="text-sm text-slate-400">{subtitle}</div> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/40 px-5 py-4 shadow-soft">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "solid",
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "solid" | "outline" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50";
  const cls =
    variant === "solid"
      ? `${base} bg-white text-slate-950 hover:bg-slate-200`
      : variant === "outline"
      ? `${base} border border-slate-700 bg-transparent text-slate-100 hover:bg-slate-800`
      : `${base} bg-transparent text-slate-100 hover:bg-slate-800`;
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-2xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 " +
        (props.className ?? "")
      }
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "w-full rounded-2xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 " +
        (props.className ?? "")
      }
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-slate-400">{children}</div>;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-xs text-slate-200">
      {children}
    </span>
  );
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 shadow-soft">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-base font-semibold">{title}</div>
            {subtitle ? <div className="text-sm text-slate-400">{subtitle}</div> : null}
          </div>
          <button
            className="rounded-full p-2 text-slate-300 hover:bg-slate-800"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Table({
  columns,
  rows,
  rowKey,
  actions,
}: {
  columns: { key: string; header: string; render?: (row: any) => React.ReactNode }[];
  rows: any[];
  rowKey: (row: any) => string;
  actions?: (row: any) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-900">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                {c.header}
              </th>
            ))}
            {actions ? <th className="px-4 py-3" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-400" colSpan={columns.length + (actions ? 1 : 0)}>
                Sem dados no período.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-slate-900/40">
                {columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-4 py-3 text-slate-200">
                    {c.render ? c.render(r) : String(r[c.key] ?? "")}
                  </td>
                ))}
                {actions ? <td className="px-4 py-3 text-right">{actions(r)}</td> : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
