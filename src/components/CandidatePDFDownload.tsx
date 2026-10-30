import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { Candidate } from "../types";
import type { SystemSettings } from "../services/systemSettingsService";

export function CandidatePDFDownload({ candidate, settings }: { candidate: Candidate; settings: SystemSettings }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    if (loading) return;

    setLoading(true);
    setError("");
    try {
      const [{ pdf }, { CandidatePDFDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./CandidatePDFCard"),
      ]);
      const documentElement = React.createElement(CandidatePDFDocument, { candidate, settings }) as unknown as React.ReactElement<DocumentProps>;
      const documentBlob = await pdf(documentElement).toBlob();
      const objectUrl = URL.createObjectURL(documentBlob);
      const link = document.createElement("a");
      const safeRegistrationId = candidate.registrationId.replace(/[^A-Za-z0-9_-]/g, "_") || "pendaftaran";
      link.href = objectUrl;
      link.download = `Kartu_PPDB_${safeRegistrationId}.pdf`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      setError("Kartu PDF belum dapat disiapkan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={download}
        disabled={loading}
        aria-busy={loading}
        className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        <span>{loading ? "Menyiapkan berkas PDF…" : "Unduh Kartu Pendaftaran (PDF)"}</span>
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
