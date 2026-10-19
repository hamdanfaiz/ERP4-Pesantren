import React, { useRef } from "react";
import { X, Printer, CheckCircle2, ShieldCheck, Download } from "lucide-react";
import { Candidate } from "../types";
import { SystemSettings } from "../services/systemSettingsService";
import { terbilangRupiah } from "../services/ppdbIntegrationService";

interface PPDBReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  settings: SystemSettings;
  paymentType: "registration" | "tuition";
}

export const PPDBReceiptModal: React.FC<PPDBReceiptModalProps> = ({
  isOpen,
  onClose,
  candidate,
  settings,
  paymentType,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !candidate) return null;

  const org = {
    name: settings?.orgInfo?.schoolName || "PONDOK PESANTREN DARUL ULUM",
    subName: "YAYASAN PENDIDIKAN ISLAM",
    address: settings?.orgInfo?.address || "Jl. Pesantren No. 123, Sumber Rejo, Jombang, Jawa Timur 61481",
    phone: settings?.orgInfo?.phone || "(0321) 861234",
    email: settings?.orgInfo?.email || "info@darululum.ac.id",
    principal: settings?.orgInfo?.principalName || "K.H. Dr. Ahmad Hidayatullah, M.Pd.",
  };

  const isReg = paymentType === "registration";
  const feeInfo = isReg
    ? candidate.payment?.registrationFee
    : candidate.payment?.tuitionFee;

  const amount = feeInfo?.amount || (isReg ? 250000 : 5000000);
  const paidAmount = (feeInfo as any)?.paidAmount ?? amount;
  const receiptNo =
    feeInfo?.receiptNo ||
    `KWT/PPDB/${new Date().getFullYear()}/${candidate.registrationId.replace(/[^0-9]/g, "") || "001"}`;
  const datePaid = feeInfo?.paidAt || new Date().toISOString().split("T")[0];
  const method = feeInfo?.method || "BSI Virtual Account / Transfer";
  const titleLabel = isReg
    ? "BIAYA PENDAFTARAN & SELEKSI PPDB"
    : "BIAYA DAFTAR ULANG, UANG PANGKAL & SPP AWAL";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8">
        {/* Header Actions */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <h3 className="font-semibold text-slate-100 text-sm sm:text-base">
              Kwitansi Resmi Pembayaran PPDB
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Kwitansi
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper */}
        <div className="p-6 sm:p-8 bg-white text-slate-900" ref={printRef}>
          {/* Institutional Letterhead (KOP SURAT) */}
          <div className="border-b-2 border-slate-900 pb-3 mb-4 text-center">
            {org.subName && (
              <p className="text-[11px] font-bold tracking-widest text-slate-600 uppercase">
                {org.subName}
              </p>
            )}
            <h1 className="text-xl sm:text-2xl font-serif font-extrabold text-slate-950 uppercase tracking-wide leading-tight">
              {org.name}
            </h1>
            <p className="text-xs text-slate-700 mt-1 font-sans">
              PANITIA PENERIMAAN PESERTA DIDIK BARU (PPDB) DIGITAL
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {org.address} | Telp: {org.phone} | Email: {org.email}
            </p>
            <div className="w-full h-0.5 bg-slate-900 mt-2 mb-0.5"></div>
            <div className="w-full h-[1px] bg-slate-900"></div>
          </div>

          {/* Receipt Title & Number */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                BUKTI KWITANSI PEMBAYARAN
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-500 block">Nomor Kwitansi:</span>
              <span className="text-xs font-mono font-bold text-slate-800">{receiptNo}</span>
            </div>
          </div>

          {/* Details Table */}
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Telah Terima Dari</span>
              <span className="w-4 text-center">:</span>
              <span className="font-bold text-slate-900 uppercase">
                {candidate.fatherName || candidate.motherName ? `${candidate.fatherName || candidate.motherName} (Wali dari ${candidate.name})` : candidate.name}
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Nomor Registrasi PPDB</span>
              <span className="w-4 text-center">:</span>
              <span className="font-mono font-semibold text-emerald-800">
                {candidate.registrationId} ({candidate.grade})
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Nama Calon Santri</span>
              <span className="w-4 text-center">:</span>
              <span className="font-semibold text-slate-900">{candidate.name}</span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Untuk Pembayaran</span>
              <span className="w-4 text-center">:</span>
              <span className="text-slate-800 font-medium">
                {titleLabel} - Tahun Ajaran 2026/2027
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Metode Pembayaran</span>
              <span className="w-4 text-center">:</span>
              <span className="text-slate-800 font-medium">{method}</span>
            </div>

            {/* Terbilang Box */}
            <div className="my-4 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Terbilang (In Words):
              </span>
              <p className="font-serif italic font-semibold text-slate-800 text-sm">
                # {terbilangRupiah(paidAmount)} #
              </p>
            </div>
          </div>

          {/* Amount Box and Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 pt-4 border-t-2 border-slate-300 items-end">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Jumlah Dibayar:
              </span>
              <div className="text-2xl font-extrabold font-mono text-emerald-800 bg-emerald-50/60 p-3 rounded-lg border border-emerald-200 inline-block min-w-[220px]">
                {new Intl.NumberFormat("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  minimumFractionDigits: 0,
                }).format(paidAmount)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                STATUS: LUNAS & TERVERIFIKASI
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs text-slate-600">
                Jombang, {datePaid}
              </p>
              <p className="text-xs font-semibold text-slate-800 mt-1">
                Bendahara PPDB / Kasir Keuangan
              </p>
              <div className="h-16 flex items-center justify-end">
                <div className="border border-emerald-500/40 text-emerald-700 text-[10px] uppercase font-bold px-2 py-1 rounded bg-emerald-50 rotate-[-6deg]">
                  LUNAS / VERIFIED
                </div>
              </div>
              <p className="text-xs font-bold text-slate-900 border-b border-slate-400 inline-block">
                ( Hj. Siti Aminah, S.E. / Kasir PPDB )
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                NIP. 19850412 201101 2 003
              </p>
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-8 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
            * Kwitansi ini merupakan bukti pembayaran resmi yang sah dan terintegrasi dengan Sistem Keuangan Pesantren (FinanceManager). Harap disimpan dengan baik.
          </div>
        </div>
      </div>
    </div>
  );
};
