import { getAuthSession } from "../authSession";
import { db } from "../firebase";
import { doc, updateDoc, collection, getDocs, query, where, runTransaction, serverTimestamp } from "firebase/firestore";
import { Candidate } from "../types";

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
    const today = new Date().toISOString().slice(0, 10);
    const invoiceId = 'INV-PPDB-' + candidate.registrationId + '-' + (paymentType === 'registration' ? 'REG' : 'SPP');
    const receiptNo = 'KWT/PPDB/' + new Date().getFullYear() + '/' + candidate.registrationId.slice(-4) + '-' + Date.now();
    const typeLabel = paymentType === 'registration' ? 'Biaya Pendaftaran PPDB' : 'Uang Pangkal & SPP Awal PPDB';
    const candidateRef = doc(db, 'candidates', candidate.id);
    const billingRef = doc(db, 'financeBillings', invoiceId);
    const ledgerRef = doc(collection(db, 'financeTransactions'));
    const actorUid = getAuthSession()?.uid;
    if (details.status === 'Paid' && !actorUid) throw new Error('Sesi admin tidak aktif untuk pencatatan pembayaran.');

    await runTransaction(db, async transaction => {
      const candidateSnapshot = await transaction.get(candidateRef);
      const billingSnapshot = await transaction.get(billingRef);
      const previousBilling = billingSnapshot.exists() ? billingSnapshot.data() : {};
      const nextPaidAmount = details.paidAmount ?? (details.status === 'Paid' ? details.amount : 0);
      const previousPaidAmount = Number(previousBilling.paidAmount || 0);
      if (!candidateSnapshot.exists() || candidateSnapshot.data().tenantId !== tenantId) throw new Error('Kandidat tidak ditemukan pada tenant aktif.');
      const payment = { ...(candidateSnapshot.data().payment || {}) };
      const feeKey = paymentType === 'registration' ? 'registrationFee' : 'tuitionFee';
      payment[feeKey] = {
        ...(payment[feeKey] || {}), amount: details.amount, paidAmount: nextPaidAmount,
        status: details.status, paidAt: today, method: details.method, receiptNo, invoiceId, proofUrl: details.proofFile || null
      };
      const regPaid = payment.registrationFee?.status === 'Paid' ? Number(payment.registrationFee.paidAmount ?? payment.registrationFee.amount ?? 0) : 0;
      const tuitionPaid = payment.tuitionFee?.status === 'Paid' ? Number(payment.tuitionFee.paidAmount ?? payment.tuitionFee.amount ?? 0) : 0;
      payment.totalPaid = regPaid + tuitionPaid;
      transaction.update(candidateRef, { payment, updatedAt: serverTimestamp() });
      const billing = {
        id: invoiceId, tenantId, candidateId: candidate.id, candidateRegistrationId: candidate.registrationId,
        paymentType, santriName: candidate.name + ' (Calon Santri)', grade: candidate.grade + ' - PPDB',
        type: typeLabel, period: paymentType === 'registration' ? 'PPDB 2026/2027' : 'Tahun Ajaran 2026/2027',
        amount: details.amount, paidAmount: details.paidAmount ?? (details.status === 'Paid' ? details.amount : 0),
        status: details.status, date: today, paymentMethod: details.method, proofFile: details.proofFile || null,
        receiptNo, updatedAt: serverTimestamp()
      };
      if (billingSnapshot.exists()) transaction.update(billingRef, billing);
      else transaction.set(billingRef, { ...billing, createdAt: serverTimestamp() });
      if (details.status === 'Paid' && nextPaidAmount > previousPaidAmount) {
        transaction.set(ledgerRef, { tenantId, type: 'income', sourceType: 'billing', sourceId: invoiceId, description: typeLabel + ' PPDB', amount: nextPaidAmount - previousPaidAmount, paymentMethod: details.method, receiptNo, createdByUid: actorUid, createdAt: serverTimestamp() });
      }
    });

    return { receiptNo, invoiceId };
  },

  async batchGenerateRegistrationBills(candidates: Candidate[], feeAmount: number = 250000, requestedTenantId?: string): Promise<number> {
    const tenantId = requestedTenantId || (candidates[0] as any)?.tenantId;
    if (!tenantId) throw new Error('Tenant aktif wajib disertakan saat menerbitkan tagihan PPDB.');
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) throw new Error('Nominal tagihan pendaftaran tidak valid.');
    const today = new Date().toISOString().slice(0, 10);
    let addedCount = 0;
    for (const candidate of candidates) {
      if ((candidate as any).tenantId !== tenantId || !candidate.id || !candidate.registrationId) continue;
      const invoiceId = 'INV-PPDB-' + candidate.registrationId + '-REG';
      const candidateRef = doc(db, 'candidates', candidate.id);
      const billingRef = doc(db, 'financeBillings', invoiceId);
      const created = await runTransaction(db, async transaction => {
        const candidateSnapshot = await transaction.get(candidateRef);
        const billingSnapshot = await transaction.get(billingRef);
        if (!candidateSnapshot.exists() || candidateSnapshot.data().tenantId !== tenantId || billingSnapshot.exists()) return false;
        const payment = candidateSnapshot.data().payment || {};
        const fee = payment.registrationFee;
        if (fee?.status && fee.status !== 'Unpaid') return false;
        transaction.set(billingRef, {
          id: invoiceId, tenantId, candidateId: candidate.id, candidateRegistrationId: candidate.registrationId,
          paymentType: 'registration', santriName: candidate.name + ' (Calon Santri)', grade: candidate.grade + ' - PPDB',
          type: 'Biaya Pendaftaran PPDB', period: 'PPDB 2026/2027', amount: feeAmount, paidAmount: 0,
          status: 'Unpaid', date: today, paymentMethod: null, proofFile: null, createdAt: serverTimestamp()
        });
        transaction.update(candidateRef, { payment: { ...payment, registrationFee: { ...(fee || {}), amount: feeAmount, status: 'Unpaid', invoiceId } }, updatedAt: serverTimestamp() });
        return true;
      });
      if (created) addedCount++;
    }
    return addedCount;
  },

  async batchGenerateAcceptedTuitionBills(acceptedCandidates: Candidate[], tuitionAmount: number = 5000000, requestedTenantId?: string): Promise<number> {
    const tenantId = requestedTenantId || (acceptedCandidates[0] as any)?.tenantId;
    if (!tenantId) throw new Error('Tenant aktif wajib disertakan saat menerbitkan tagihan daftar ulang.');
    if (!Number.isFinite(tuitionAmount) || tuitionAmount <= 0) throw new Error('Nominal daftar ulang tidak valid.');
    const today = new Date().toISOString().slice(0, 10);
    let addedCount = 0;
    for (const candidate of acceptedCandidates) {
      if ((candidate as any).tenantId !== tenantId || !candidate.id || !candidate.registrationId) continue;
      const invoiceId = 'INV-PPDB-' + candidate.registrationId + '-SPP';
      const candidateRef = doc(db, 'candidates', candidate.id);
      const billingRef = doc(db, 'financeBillings', invoiceId);
      const created = await runTransaction(db, async transaction => {
        const candidateSnapshot = await transaction.get(candidateRef);
        const billingSnapshot = await transaction.get(billingRef);
        if (!candidateSnapshot.exists() || candidateSnapshot.data().tenantId !== tenantId || billingSnapshot.exists()) return false;
        const payment = candidateSnapshot.data().payment || {};
        const fee = payment.tuitionFee;
        if (fee?.status && fee.status !== 'Unpaid') return false;
        transaction.set(billingRef, {
          id: invoiceId, tenantId, candidateId: candidate.id, candidateRegistrationId: candidate.registrationId,
          paymentType: 'tuition', santriName: candidate.name + ' (Santri Baru)', grade: candidate.grade + ' - Daftar Ulang',
          type: 'Uang Pangkal & SPP Awal PPDB', period: 'Tahun Ajaran 2026/2027', amount: tuitionAmount, paidAmount: 0,
          status: 'Unpaid', date: today, paymentMethod: null, proofFile: null, createdAt: serverTimestamp()
        });
        transaction.update(candidateRef, { payment: { ...payment, tuitionFee: { ...(fee || {}), amount: tuitionAmount, status: 'Unpaid', invoiceId } }, updatedAt: serverTimestamp() });
        return true;
      });
      if (created) addedCount++;
    }
    return addedCount;
  },

  async syncPaymentsFromFinance(candidates: Candidate[], requestedTenantId?: string): Promise<number> {
    const tenantId = requestedTenantId || (candidates[0] as any)?.tenantId;
    if (!tenantId) throw new Error('Tenant aktif wajib disertakan untuk sinkronisasi pembayaran.');
    const snapshot = await getDocs(query(collection(db, 'financeBillings'), where('tenantId', '==', tenantId)));
    const bills = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as any));
    let updatedCount = 0;
    for (const candidate of candidates) {
      if ((candidate as any).tenantId !== tenantId || !candidate.id) continue;
      const registrationBill = bills.find(item => item.paymentType === 'registration' && (item.candidateId === candidate.id || item.candidateRegistrationId === candidate.registrationId));
      const tuitionBill = bills.find(item => item.paymentType === 'tuition' && (item.candidateId === candidate.id || item.candidateRegistrationId === candidate.registrationId));
      if (!registrationBill && !tuitionBill) continue;
      const candidateRef = doc(db, 'candidates', candidate.id);
      const changed = await runTransaction(db, async transaction => {
        const current = await transaction.get(candidateRef);
        if (!current.exists() || current.data().tenantId !== tenantId) return false;
        const payment = { ...(current.data().payment || {}) };
        if (registrationBill) payment.registrationFee = { ...(payment.registrationFee || {}), amount: registrationBill.amount, status: registrationBill.status, paidAmount: registrationBill.paidAmount || 0, paidAt: registrationBill.paidAt || registrationBill.date, method: registrationBill.paymentMethod || 'Transfer', invoiceId: registrationBill.id, proofUrl: registrationBill.proofStoragePath || registrationBill.proofFile || null, receiptNo: registrationBill.receiptNo };
        if (tuitionBill) payment.tuitionFee = { ...(payment.tuitionFee || {}), amount: tuitionBill.amount, status: tuitionBill.status, paidAmount: tuitionBill.paidAmount || 0, paidAt: tuitionBill.paidAt || tuitionBill.date, method: tuitionBill.paymentMethod || 'Transfer', invoiceId: tuitionBill.id, proofUrl: tuitionBill.proofStoragePath || tuitionBill.proofFile || null, receiptNo: tuitionBill.receiptNo };
        const regPaid = payment.registrationFee?.status === 'Paid' ? Number(payment.registrationFee.paidAmount ?? payment.registrationFee.amount ?? 0) : 0;
        const tuitionPaid = payment.tuitionFee?.status === 'Paid' ? Number(payment.tuitionFee.paidAmount ?? payment.tuitionFee.amount ?? 0) : 0;
        payment.totalPaid = regPaid + tuitionPaid;
        transaction.update(candidateRef, { payment, updatedAt: serverTimestamp() });
        return true;
      });
      if (changed) updatedCount++;
    }
    return updatedCount;
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

    await updateDoc(doc(db, "candidates", candidateId), {
      religiousScores,
    });

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
