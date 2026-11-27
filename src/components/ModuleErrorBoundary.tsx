import React from "react";
import { ERPErrorState } from "./ERPDesignSystem";

type ModuleErrorBoundaryProps = {
  moduleName: string;
  children: React.ReactNode;
};

type ModuleErrorBoundaryState = {
  hasError: boolean;
};

/** Keeps a render failure inside one module from blanking the whole application. */
export class ModuleErrorBoundary extends React.Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ModuleErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Keep technical details in developer tools only; never show them in the user interface.
    console.error("Modul ERP gagal ditampilkan.", {
      module: this.props.moduleName,
      errorName: error?.name || "Error",
      errorMessage: String(error?.message || "Unknown render error").slice(0, 500),
      errorStack: typeof error?.stack === "string" ? error.stack.slice(0, 5000) : undefined,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <ERPErrorState
        className="mx-auto my-8 max-w-3xl"
        title={"Modul " + this.props.moduleName + " belum dapat ditampilkan"}
        description="Terjadi kendala saat membuka bagian ini. Coba lagi atau muat ulang aplikasi."
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Muat ulang aplikasi
            </button>
          </div>
        )}
      />
    );
  }
}


