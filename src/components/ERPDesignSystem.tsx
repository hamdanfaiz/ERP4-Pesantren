import React, { type ReactNode } from "react";

type Classed = { className?: string; children?: ReactNode };

export type ERPTabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

export function ERPTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  tabs: ERPTabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={"erp-tabs " + className} aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={"erp-tab-control " + (selected ? "is-active" : "")}
            aria-pressed={selected}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ERPPageContainer({ className = "", children }: Classed) {
  return <main className={"erp-page-container " + className}>{children}</main>;
}

export function ERPPanel({ className = "", children }: Classed) {
  return <section className={"erp-panel " + className}>{children}</section>;
}

export function ERPFormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={"erp-form-field " + (error ? "has-error" : "")}>
      <label className="erp-form-label" htmlFor={htmlFor}>
        {label}{required && <span aria-hidden="true" className="erp-required-mark"> *</span>}
      </label>
      {children}
      {error ? <p className="erp-field-error" role="alert">{error}</p> : hint ? <p className="erp-field-hint">{hint}</p> : null}
    </div>
  );
}

export function ERPEmptyState({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={"erp-state erp-empty-state " + className} role="status">
      <div className="erp-state-mark" aria-hidden="true">—</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="erp-state-action">{action}</div>}
    </div>
  );
}

export function ERPErrorState({
  title = "Terjadi kendala",
  description,
  action,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={"erp-state erp-error-state " + className} role="alert">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="erp-state-action">{action}</div>}
    </div>
  );
}

export function ERPLoadingState({
  label = "Memuat data…",
  className = "",
}: {
  label?: ReactNode;
  className?: string;
}) {
  return (
    <div className={"erp-state erp-loading-state " + className} role="status" aria-live="polite">
      <span className="erp-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export type ERPTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
};

export function ERPTable<T>({
  columns,
  rows,
  getRowKey,
  empty,
  caption,
}: {
  columns: ERPTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  caption?: string;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="erp-table-wrap">
      <table className="erp-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>{columns.map((column) => <th key={column.key} scope="col" className={column.className}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={columns.length}>{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
