import React, { useState } from "react";
import {
  X,
  CreditCard,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  FileText,
  AlertCircle,
  TrendingUp,
  Receipt,
  Printer,
  ChevronRight,
  ShieldCheck,
  Send,
  UserCheck,
} from "lucide-react";
import { Candidate } from "../types";
import { SystemSettings } from "../services/systemSettingsService";
import {
  ppdbIntegrationService,
  terbilangRupiah,
} from "../services/ppdbIntegrationService";
import { cn } from "../lib/utils";

interface PPDBFinanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: Candidate[];
  settings: SystemSettings;
  onRefresh: () => void;
  showToast: (message: string, type?: "success" | "info" | "error", title?: string) => void;
  onOpenReceipt: (candidate: Candidate, paymentType: "registration" | "tuition") => void;
}

export const PPDBFinanceModal: React.FC<PPDBFinanceModalProps> = ({
  isOpen,
  onClose,
  candidates,
  settings,
  onRefresh,
  showToast,
  onOpenReceipt,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "record" | "candidates">("overview");
  const [isProcessing, setIsProcessing] = useState(false);

  // Manual payment form state
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [payFeeType, setPayFeeType] = useState<"registration" | "tuition">("registration");
  const [payAmount, setPayAmount] = useState<number>(250000);
  const [payMethod, setPayMethod] = useState("BSI Virtual Account");
  const [payStatus, setPayStatus] = useState<"Paid" | "Verification">("Paid");
  const [payNotes, setPayNotes] = useState("");

  if (!isOpen) return null;

  // Compute Financial Aggregates
  const totalRegistrationBill = candidates.length * 250000;
  const regPaidCandidates = candidates.filter(
    (c) => c.payment?.registrationFee?.status === "Paid"
  );
  const totalRegistrationPaid = regPaidCandidates.length * 250000;

  const acceptedCandidates = candidates.filter((c) => c.stage === "Accepted");
  const totalTuitionBill = acceptedCandidates.length * 5000000;
  const tuiPaidCandidates = acceptedCandidates.filter(
    (c) => c.payment?.tuitionFee?.status === "Paid"
  );
  const totalTuitionPaid = tuiPaidCandidates.reduce(
    (acc, c) => acc + (c.payment?.tuitionFee?.paidAmount || 5000000),
    0
  );

  const totalRevenue = totalRegistrationPaid + totalTuitionPaid;
  const pendingVerificationCount = candidates.filter(
    (c) =>
      c.payment?.registrationFee?.status === "Verification" ||
      c.payment?.tuitionFee?.status === "Verification"
  ).length;

  const handleGenerateRegBills = async () => {
    setIsProcessing(true);
    try {
      const count = await ppdbIntegrationService.batchGenerateRegistrationBills(candidates, 250000);
      showToast(
        `Berhasil membuat ${count} invoice biaya pendaftaran di Modul Keuangan!`,
        "success",
        "Integrasi Keuangan"
      );
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast("Gagal membuat tagihan pendaftaran massal.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateAcceptedTuitionBills = async () => {
    if (acceptedCandidates.length === 0) {
      showToast("Belum ada calon santri dengan status Diterima (Accepted).", "info");
      return;
    }
    setIsProcessing(true);
    try {
      const count = await ppdbIntegrationService.batchGenerateAcceptedTuitionBills(
        acceptedCandidates,
        5000000
      );
      showToast(
        `Berhasil menerbitkan ${count} tagihan uang pangkal & SPP ke Modul Keuangan!`,
        "success",
        "Integrasi Keuangan"
      );
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast("Gagal menerbitkan tagihan daftar ulang.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncFromFinance = async () => {
    setIsProcessing(true);
    try {
      const count = await ppdbIntegrationService.syncPaymentsFromFinance(candidates);
      if (count > 0) {
        showToast(
          `Tersinkronisasi ${count} perubahan status pembayaran dari Modul Keuangan!`,
          "success",
          "Sinkronisasi Keuangan"
        );
      } else {
        showToast("Semua data pembayaran sudah sinkron dengan Modul Keuangan.", "info");
      }
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast("Gagal menyinkronkan pembayaran dari Keuangan.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecordManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = candidates.find((c) => c.id === selectedCandidateId);
    if (!candidate) {
      showToast("Silakan pilih calon santri terlebih dahulu.", "info");
      return;
    }

    setIsProcessing(true);
    try {
      const { receiptNo } = await ppdbIntegrationService.recordCandidatePayment(
        candidate,
        payFeeType,
        {
          amount: payAmount,
          method: payMethod,
          status: payStatus,
          notes: payNotes,
        }
      );

      showToast(
        `Pembayaran untuk ${candidate.name} berhasil dicatat! Kwitansi: ${receiptNo}`,
        "success",
        "Pembayaran Berhasil"
      );
      setSelectedCandidateId("");
      onRefresh();
      // Ask or automatically offer receipt
      onOpenReceipt(candidate, payFeeType);
    } catch (err) {
      console.error(err);
      showToast("Gagal mencatat pembayaran.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2">
                Integrasi Pembayaran PPDB & Keuangan (FinanceManager)
              </h3>
              <p className="text-xs text-slate-400">
                Pencatatan kas masuk, penerbitan invoice pendaftaran & SPP awal, serta cetak bukti bayar/kwitansi resmi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 bg-slate-800/40 border-b border-slate-800 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "pb-3 border-b-2 transition-colors flex items-center gap-2",
              activeTab === "overview"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            Ringkasan Kas & Sinkronisasi
          </button>
          <button
            onClick={() => setActiveTab("record")}
            className={cn(
              "pb-3 border-b-2 transition-colors flex items-center gap-2",
              activeTab === "record"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            )}
          >
            <Receipt className="w-4 h-4" />
            Catat Pembayaran Manual
          </button>
          <button
            onClick={() => setActiveTab("candidates")}
            className={cn(
              "pb-3 border-b-2 transition-colors flex items-center gap-2",
              activeTab === "candidates"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            )}
          >
            <UserCheck className="w-4 h-4" />
            Daftar Calon & Status Pembayaran ({candidates.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Financial Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                    Total Kas Masuk PPDB
                  </span>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">
                    {formatCurrency(totalRevenue)}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Pendaftaran + Uang Pangkal/SPP Awal
                  </span>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                    Biaya Pendaftaran (@Rp 250rb)
                  </span>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-blue-400">
                    {formatCurrency(totalRegistrationPaid)}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {regPaidCandidates.length} dari {candidates.length} calon lunas ({Math.round((regPaidCandidates.length / (candidates.length || 1)) * 100)}%)
                  </span>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                    Daftar Ulang & SPP Calon Diterima
                  </span>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-400">
                    {formatCurrency(totalTuitionPaid)}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {tuiPaidCandidates.length} dari {acceptedCandidates.length} santri diterima lunas
                  </span>
                </div>
              </div>

              {/* Sync & Bulk Action Bar */}
              <div className="p-4 bg-emerald-950/20 rounded-xl border border-emerald-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">
                        Sinkronisasi Dua Arah dengan Modul FinanceManager
                      </h4>
                      <p className="text-xs text-slate-400">
                        Setiap transaksi otomatis membuat jurnal invoice/billing kas masuk di Modul Keuangan
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSyncFromFinance}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isProcessing && "animate-spin")} />
                    Tarik Mutasi dari Keuangan
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-500/10">
                  <button
                    onClick={handleGenerateRegBills}
                    disabled={isProcessing}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-left transition-colors disabled:opacity-50"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Terbitkan Invoice Pendaftaran Massal
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Generate tagihan Rp 250.000 ke FinanceManager untuk semua calon
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                  </button>

                  <button
                    onClick={handleGenerateAcceptedTuitionBills}
                    disabled={isProcessing || acceptedCandidates.length === 0}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-left transition-colors disabled:opacity-50"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Terbitkan Tagihan Daftar Ulang (Accepted)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Generate tagihan Rp 5.000.000 untuk {acceptedCandidates.length} santri diterima
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0 ml-2" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "record" && (
            <form onSubmit={handleRecordManualPayment} className="space-y-4 max-w-xl mx-auto">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Pilih Calon Santri:
                </label>
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Pilih Calon Santri --</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.registrationId} - {c.name} ({c.grade}) [{c.stage}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Jenis Pos Tagihan:
                  </label>
                  <select
                    value={payFeeType}
                    onChange={(e) => {
                      const t = e.target.value as "registration" | "tuition";
                      setPayFeeType(t);
                      setPayAmount(t === "registration" ? 250000 : 5000000);
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="registration">Biaya Pendaftaran & Seleksi (Rp 250.000)</option>
                    <option value="tuition">Uang Pangkal & SPP Awal (Rp 5.000.000)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Nominal Pembayaran (Rp):
                  </label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                    required
                    min={10000}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block italic">
                    {terbilangRupiah(payAmount)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Metode Pembayaran:
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="BSI Virtual Account">BSI Virtual Account (VA)</option>
                    <option value="Bank Mandiri Transfer">Bank Mandiri Transfer</option>
                    <option value="Bank Muamalat">Bank Muamalat</option>
                    <option value="QRIS Standar">QRIS Dinamis / Standar</option>
                    <option value="Tunai / Kasir PPDB">Tunai / Langsung di Kasir PPDB</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Status Verifikasi:
                  </label>
                  <select
                    value={payStatus}
                    onChange={(e) => setPayStatus(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Paid">Lunas & Terverifikasi (Terbitkan Kwitansi)</option>
                    <option value="Verification">Menunggu Verifikasi Kasir / Bukti Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Catatan Transaksi / No. Referensi Transfer:
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Misal: Bukti setor tunai di kantor panitia / Ref No: BSI-992182"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isProcessing || !selectedCandidateId}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-950/40 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isProcessing ? "Menyimpan ke FinanceManager..." : "Simpan Pembayaran & Buka Kwitansi"}
                </button>
              </div>
            </form>
          )}

          {activeTab === "candidates" && (
            <div className="space-y-4">
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-800/80 border-b border-slate-700 text-slate-400 uppercase font-semibold">
                      <th className="p-3">Calon Santri</th>
                      <th className="p-3">Tahap</th>
                      <th className="p-3">Biaya Pendaftaran</th>
                      <th className="p-3">Daftar Ulang & SPP</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {candidates.map((candidate) => {
                      const regStatus = candidate.payment?.registrationFee?.status || "Unpaid";
                      const tuiStatus = candidate.payment?.tuitionFee?.status || "Unpaid";

                      return (
                        <tr key={candidate.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3">
                            <span className="font-semibold text-slate-200 block">
                              {candidate.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {candidate.registrationId} | {candidate.grade}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              {candidate.stage}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1",
                                regStatus === "Paid"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : regStatus === "Verification"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              )}
                            >
                              {regStatus === "Paid" ? "Lunas (Rp 250rb)" : regStatus === "Verification" ? "Verifikasi" : "Belum Bayar"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1",
                                tuiStatus === "Paid"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : tuiStatus === "Partial"
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : "bg-slate-800 text-slate-400 border border-slate-700"
                              )}
                            >
                              {tuiStatus === "Paid" ? "Lunas" : tuiStatus === "Partial" ? "Sebagian" : "Belum"}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {regStatus === "Paid" && (
                                <button
                                  onClick={() => onOpenReceipt(candidate, "registration")}
                                  className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 transition-colors"
                                  title="Cetak Kwitansi Pendaftaran"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedCandidateId(candidate.id);
                                  setActiveTab("record");
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium transition-colors"
                              >
                                Catat Bayar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
