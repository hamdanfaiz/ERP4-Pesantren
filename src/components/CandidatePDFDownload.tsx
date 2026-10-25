import React from "react";
import { Download } from "lucide-react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CandidatePDFDocument } from "./CandidatePDFCard";
import type { Candidate } from "../types";
import type { SystemSettings } from "../services/systemSettingsService";

export function CandidatePDFDownload({ candidate, settings }: { candidate: Candidate; settings: SystemSettings }) {
  return (
    <PDFDownloadLink document={<CandidatePDFDocument candidate={candidate} settings={settings} />} fileName={"Kartu_PPDB_" + candidate.registrationId + ".pdf"} className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2">
      {({ loading }) => <><Download className="w-4 h-4" /><span>{loading ? "Menyiapkan Berkas PDF..." : "Unduh Kartu Pendaftaran (PDF)"}</span></>}
    </PDFDownloadLink>
  );
}
