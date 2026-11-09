import React, { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabsId = useId();
  const [scrollBounds, setScrollBounds] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });

  useEffect(() => {
    const element = tabsRef.current;
    if (!element) return;

    const updateScrollBounds = () => {
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      const nextBounds = {
        hasOverflow: maxScrollLeft > 1,
        canScrollLeft: element.scrollLeft > 1,
        canScrollRight: element.scrollLeft < maxScrollLeft - 1,
      };
      setScrollBounds((current) => current.hasOverflow === nextBounds.hasOverflow
        && current.canScrollLeft === nextBounds.canScrollLeft
        && current.canScrollRight === nextBounds.canScrollRight
        ? current
        : nextBounds);
    };

    updateScrollBounds();
    element.addEventListener("scroll", updateScrollBounds, { passive: true });
    window.addEventListener("resize", updateScrollBounds, { passive: true });
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScrollBounds) : undefined;
    resizeObserver?.observe(element);
    Array.from(element.children).forEach((child) => resizeObserver?.observe(child));
    const mutationObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(() => {
      Array.from(element.children).forEach((child) => resizeObserver?.observe(child));
      updateScrollBounds();
    }) : undefined;
    mutationObserver?.observe(element, { childList: true, subtree: true, characterData: true });

    return () => {
      element.removeEventListener("scroll", updateScrollBounds);
      window.removeEventListener("resize", updateScrollBounds);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = tabsRef.current;
    const selectedTab = element?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!element || !selectedTab) return;

    const viewport = element.getBoundingClientRect();
    const selected = selectedTab.getBoundingClientRect();
    const leftOverflow = selected.left - viewport.left;
    const rightOverflow = selected.right - viewport.right;
    const distance = leftOverflow < 0 ? leftOverflow : rightOverflow > 0 ? rightOverflow : 0;
    if (distance === 0) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: distance, behavior: reducedMotion ? "auto" : "smooth" });
  }, [value]);

  const scrollTabs = (direction: "left" | "right") => {
    const element = tabsRef.current;
    if (!element) return;
    const distance = Math.max(180, element.clientWidth * 0.7);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction === "left" ? -distance : distance, behavior: reducedMotion ? "auto" : "smooth" });
  };

  return (
    <div className={"erp-tabs-viewport " + className}>
      {scrollBounds.hasOverflow && <button
        type="button"
        className="erp-tabs-scroll-button"
        aria-label={`Gulir ${ariaLabel} ke kiri`}
        aria-controls={tabsId}
        disabled={!scrollBounds.canScrollLeft}
        onClick={() => scrollTabs("left")}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>}
      <div id={tabsId} ref={tabsRef} className="erp-tabs" role="group" aria-label={ariaLabel}>
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
      {scrollBounds.hasOverflow && <button
        type="button"
        className="erp-tabs-scroll-button"
        aria-label={`Gulir ${ariaLabel} ke kanan`}
        aria-controls={tabsId}
        disabled={!scrollBounds.canScrollRight}
        onClick={() => scrollTabs("right")}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>}
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

export type ERPNoticeTone = "info" | "success" | "warning" | "error";

export function ERPNotice({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: ERPNoticeTone;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const styles: Record<ERPNoticeTone, string> = {
    info: "erp-notice-info",
    success: "erp-notice-success",
    warning: "erp-notice-warning",
    error: "erp-notice-error",
  };

  return (
    <div
      className={`erp-notice ${styles[tone]} ${className}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <div className="erp-notice-content">
        {title && <h2>{title}</h2>}
        <div>{children}</div>
      </div>
      {action && <div className="erp-notice-action">{action}</div>}
    </div>
  );
}

export function ERPFeatureStatus({
  title,
  status,
  description,
  action,
  tone = "warning",
}: {
  title: ReactNode;
  status?: string;
  description: ReactNode;
  action?: ReactNode;
  tone?: "warning" | "available";
}) {
  const statusClass = tone === "available"
    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-200"
    : "bg-amber-100 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200";
  return (
    <section className="erp-panel space-y-3 p-5 sm:p-6" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{status || (tone === "available" ? "Tersedia" : "Belum tersedia")}</span>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
      {action && <div>{action}</div>}
    </section>
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
