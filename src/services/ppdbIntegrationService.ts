import { Candidate } from "../types";
import { generatePpdbFinanceBillings, listPpdbFinanceBillings, recordPpdbFinancePayment, updatePpdbCandidate } from "./ppdbApi";

export interface PPDBPaymentRecord {
  candidateId: string;
  candidateName: string;
  registrationId: string;
  grade: string;
  paymentType: "registration" | "tuition";
  typeLabel: string;
  amount: number;
  paidAmount?: number;
  method: string;
  status: "Unpaid" | "Verification" | "Paid" | "Partial";
  date: string;
  receiptNo: string;
  invoiceId: string;
  proofFile?: string;
}

export function terbilangRupiah(nominal: number): string {
  const bilangan = [
    "", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"
  ];

  function toKata(n: number): string {
    if (n < 12) return bilangan[n];
    if (n < 20) return toKata(n - 10) + " Belas";
    if (n < 100) return toKata(Math.floor(n / 10)) + " Puluh " + toKata(n % 10);
    if (n < 200) return "Seratus " + toKata(n - 100);
    if (n < 1000) return toKata(Math.floor(n / 100)) + " Ratus " + toKata(n % 100);
    if (n < 2000) return "Seribu " + toKata(n - 1000);
    if (n < 1000000) return toKata(Math.floor(n / 1000)) + " Ribu " + toKata(n % 1000);
    if (n < 1000000000) return toKata(Math.floor(n / 1000000)) + " Juta " + toKata(n % 1000000);
    return toKata(Math.floor(n / 1000000000)) + " Milyar " + toKata(n % 1000000000);
  }

  const result = toKata(Math.floor(Math.abs(nominal))).replace(/\s+/g, " ").trim();
  return (result ? result : "Nol") + " Rupiah";
}

export const ppdbIntegrationService = {
  // --- FINANCE MODULE INTEGRATION ---

  async recordCandidatePayment(
    candidate: Candidate,
    paymentType: 'registration' | 'tuition',
    details: {
      amount: number;
      paidAmount?: number;
      method: string;
      status: 'Paid' | 'Verification' | 'Partial' | 'Unpaid';
      proofFile?: string;
      notes?: string;
    }
  ): Promise<{ receiptNo: string; invoiceId: string }> {
    const tenantId = (candidate as any).tenantId;
    if (!tenantId || !candidate.id || !candidate.registrationId) throw new Error('Kandidat belum memiliki tenant dan identitas PPDB yang valid.');
    if (!Number.isFinite(details.amount) || details.amount <= 0) throw new Error('Nominal pembayaran harus lebih besar dari nol.');

    const generated = await generatePpdbFinanceBillings([candidate.id], paymentType, details.amount);
    if (generated.failedCount > 0) {
      throw new Error(generated.errors[0]?.error || 'Tagihan PPDB gagal diterbitkan pada Supabase.');
    }

    const bills = await listPpdbFinanceBillings();
    const existing = bills.find((bill) => bill.candidateId === candidate.id && bill.paymentType === paymentType);
    if (!existing) throw new Error('Supabase belum mengembalikan tagihan PPDB yang baru diterbitkan.');
    if (existing.status === 'Paid') {
      if (details.status === 'Paid' && Number(existing.paidAmount) === Number(details.paidAmount ?? details.amount)) {
        return { receiptNo: existing.receiptNo || '', invoiceId: existing.id };
      }
      throw new Error('Tagihan sudah lunas dan tidak dapat dicatat ulang.');
    }

    const nextPaidAmount = details.paidAmount ?? (details.status === 'Paid' ? details.amount : Number(existing.paidAmount || 0));
    const receiptNo = 'KWT/PPDB/' + new Date().getFullYear() + '/' + candidate.registrationId.slice(-4) + '-' + Date.now();
    const result = await recordPpdbFinancePayment(candidate.id, {
      paymentType,
      paidAmount: nextPaidAmount,
      status: details.status,
      method: details.method,
      receiptNo,
    });
    return { receiptNo: result.receiptNo || receiptNo, invoiceId: result.id };
  },

  async batchGenerateRegistrationBills(candidates: Candidate[], feeAmount: number = 250000, requestedTenantId?: string): Promise<number> {
    const tenantId = requestedTenantId || (candidates[0] as any)?.tenantId;
    if (!tenantId) throw new Error('Tenant aktif wajib disertakan saat menerbitkan tagihan PPDB.');
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) throw new Error('Nominal tagihan pendaftaran tidak valid.');
    const candidateIds = Array.from(new Set(candidates
      .filter((candidate) => (candidate as any).tenantId === tenantId && candidate.id && candidate.registrationId)
      .map((candidate) => candidate.id)));
    const result = await generatePpdbFinanceBillings(candidateIds, 'registration', feeAmount);
    if (result.failedCount > 0) {
      throw new Error(result.errors[0]?.error || result.failedCount + ' tagihan PPDB gagal diterbitkan.');
    }
    return result.createdCount;
  },

  async batchGenerateAcceptedTuitionBills(acceptedCandidates: Candidate[], tuitionAmount: number = 5000000, requestedTenantId?: string): Promise<number> {
    const tenantId = requestedTenantId || (acceptedCandidates[0] as any)?.tenantId;
    if (!tenantId) throw new Error('Tenant aktif wajib disertakan saat menerbitkan tagihan daftar ulang.');
    if (!Number.isFinite(tuitionAmount) || tuitionAmount <= 0) throw new Error('Nominal daftar ulang tidak valid.');
    const candidateIds = Array.from(new Set(acceptedCandidates
      .filter((candidate) => (candidate as any).tenantId === tenantId && candidate.id && candidate.registrationId && candidate.stage === 'Accepted')
      .map((candidate) => candidate.id)));
    const result = await generatePpdbFinanceBillings(candidateIds, 'tuition', tuitionAmount);
    if (result.failedCount > 0) {
      throw new Error(result.errors[0]?.error || result.failedCount + ' tagihan daftar ulang gagal diterbitkan.');
    }
    return result.createdCount;
  },

  async syncPaymentsFromFinance(candidates: Candidate[], requestedTenantId?: string): Promise<number> {
    const tenantId = requestedTenantId || (candidates[0] as any)?.tenantId;
    if (!tenantId) throw new Error('Tenant aktif wajib disertakan untuk sinkronisasi pembayaran.');
    // Supabase RPCs update the candidate payment snapshot atomically with each billing mutation.
    // This call verifies the source list; it does not mirror data back to Firestore.
    const bills = await listPpdbFinanceBillings();
    const candidateIds = new Set(candidates
      .filter((candidate) => (candidate as any).tenantId === tenantId)
      .map((candidate) => candidate.id));
    return bills.filter((bill) => bill.candidateId && candidateIds.has(bill.candidateId)).length;
  },

  // --- CBT MODULE INTEGRATION ---

  /**
   * Synchronizes CBT exam test scores to PPDB candidates.
   * Pulls existing CBT results and computes multi-subject assessment.
   */
  async syncCBTScoresToPPDB(
    _candidates: Candidate[]
  ): Promise<{ syncedCount: number; passedCount: number }> {
    throw new Error(
      "Sinkronisasi CBT PPDB dinonaktifkan: hasil ujian resmi dari sesi tersimpan belum tersedia. Tidak ada skor kandidat yang diubah."
    );
  },

  /**
   * Saves religious & tahfidz assessment for a candidate.
   */
  async saveReligiousEvaluation(
    candidateId: string,
    scores: {
      quranFluency: number;
      tajweedMastery: number;
      memorizedJuz: string;
      worshipPractice: number;
      notes?: string;
      evaluator?: string;
    }
  ): Promise<number> {
    const totalScore = Math.round(
      (scores.quranFluency + scores.tajweedMastery + scores.worshipPractice) / 3
    );
    const religiousScores = {
      ...scores,
      totalScore,
      evaluatedAt: new Date().toISOString().split("T")[0],
    };

    await updatePpdbCandidate(candidateId, { religiousScores });

    return totalScore;
  },

  /**
   * Formats WhatsApp invitation link with polite personalized Islamic invitation.
   */
  generateWhatsAppInterviewInvitation(
    candidate: Candidate,
    slot: { label: string; interviewer: string },
    schoolName: string = "Pesantren Modern Al-Hikmah"
  ): { phone: string; message: string; waUrl: string } {
    let rawPhone = (candidate.phone || "").replace(/[^0-9]/g, "");
    if (rawPhone.startsWith("0")) {
      rawPhone = "62" + rawPhone.slice(1);
    } else if (rawPhone.startsWith("8")) {
      rawPhone = "62" + rawPhone;
    }
    if (!rawPhone || rawPhone.length < 9) {
      rawPhone = "6281234567890";
    }

    const message = `Assalamu'alaikum Warahmatullahi Wabarakatuh.\n\nYth. Orang Tua / Wali Calon Santri:\n👤 *${candidate.name}* (No. Registrasi: ${candidate.registrationId})\nJenjang Pilihan: *${candidate.grade}*\n\nDengan ini Panitia PPDB *${schoolName}* mengundang Ananda untuk mengikuti *Sesi Wawancara & Uji Standar Seleksi Pesantren (Tahfidz, Al-Qur'an & Kepribadian)*:\n\n📅 Waktu Sesi: *${slot.label}*\n👳 Asatidz / Penguji: *${slot.interviewer}*\n📍 Lokasi: Gedung PPDB Pesantren / Ruang Seleksi Wawancara\n\n📌 *Catatan Penting:*\n1. Mohon hadir 15 menit sebelum sesi dimulai.\n2. Membawa kelengkapan berkas fisik (Ijazah/Rapor, Akta Kelahiran, KK asli).\n3. Calon santri mengenakan busana muslim/muslimah rapi dan sopan.\n\nJazakumullah Khairan Katsiran atas perhatian dan kerja sama Bapak/Ibu.\n\nWassalamu'alaikum Wr. Wb.\n*Panitia Seleksi Masuk PPDB ${schoolName}*`;

    const waUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`;

    return {
      phone: rawPhone,
      message,
      waUrl,
    };
  },

  /**
   * Automatically synchronizes CBT scores from CBTManager directly to PPDB candidates without manual entry.
   */
  async autoSyncCBTResults(
    _candidates: Candidate[]
  ): Promise<{ updatedCount: number; passedCount: number; details: any[] }> {
    throw new Error(
      "Sinkronisasi CBT PPDB dinonaktifkan: hasil ujian resmi dari sesi tersimpan belum tersedia. Tidak ada skor kandidat yang diubah."
    );
  },

  /**
   * Simulates CBT exam completion for candidates who are in Entry Exam or have an exam slot.
   */
  async simulateCBTExamSessions(_candidates: Candidate[]): Promise<number> {
    throw new Error(
      "Simulasi CBT dinonaktifkan pada data operasional. Gunakan hasil ujian tersimpan dari sesi CBT resmi."
    );
  },
};
