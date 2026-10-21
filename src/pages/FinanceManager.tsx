import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, Wallet, FileText, CheckCircle2, Search, Filter, 
  Plus, History, DollarSign, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Check, X, Clock, ArrowLeftRight,
  Download, AlertTriangle, Lock, Unlock, ShieldAlert, Send,
  Upload, User, Users, CheckCircle
} from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import { collection, onSnapshot, query, where, getDocs, updateDoc, doc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getAccessToken, getAuthSession } from '../authSession';
import { db } from '../firebase';
import { ppdbIntegrationService } from '../services/ppdbIntegrationService';

type Tab = 'billing' | 'expenses' | 'reports' | 'pocket_money';

export const STANDARD_BILLING_CATALOG = [
  { id: 'spp_smp', type: 'SPP Bulanan SMP', amount: 150000 },
  { id: 'spp_sd', type: 'SPP Bulanan SD', amount: 60000 },
  { id: 'uang_pangkal', type: 'Uang Pangkal Gedung', amount: 2500000 },
  { id: 'iuran_outing', type: 'Kegiatan Outbound Tahunan', amount: 350000 },
  { id: 'seragam', type: 'Pengadaan Seragam & Buku', amount: 850000 },
  { id: 'uang_makan', type: 'Uang Makan / Konsumsi', amount: 450000 },
  { id: 'laundry_air', type: 'Iuran Sarana Asrama (Laundry & Air)', amount: 120000 },
];


// Core Type Rules
interface BillingItem {
  id: string;
  santriName: string;
  grade: string;
  type: string;
  period: string;
  amount: number;
  paidAmount?: number;
  status: 'Paid' | 'Unpaid' | 'Partial' | 'Verification' | 'Overdue';
  date: string;
  paymentMethod: string | null;
  proofFile: string | null;
  proofStoragePath?: string;
  paymentType?: 'registration' | 'tuition';
  uploadedAt?: string;
  rejectionReason?: string;
  tenantId?: string;
  santriId?: string;
  candidateId?: string;
  candidateRegistrationId?: string;
  receiptNo?: string;
  paidAt?: string;
  createdByUid?: string;
}

interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  department: string;
  requester: string;
  rejectionReason?: string;
  tenantId?: string;
  requesterUid?: string;
  approvedByUid?: string;
  approvedAt?: any;
}

export function FinanceManager() {
  const { user, role } = useAuth();
  
  const isFinanceAdmin = role === 'SuperAdmin' || role === 'Admin';

  const [activeTab, setActiveTab] = useState<Tab>('billing');
  
  useEffect(() => {
    if (role === 'Santri') setActiveTab('pocket_money');
    else if (activeTab === 'pocket_money' && role !== 'Walisantri') setActiveTab('billing');
  }, [role]);
  const [searchQuery, setSearchQuery] = useState('');
  const [billingCategoryFilter, setBillingCategoryFilter] = useState<'all' | 'spp' | 'ppdb' | 'verification' | 'unpaid'>('all');
  const [isPullingPPDB, setIsPullingPPDB] = useState(false);
  
  // Modals & Forms
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedPayBill, setSelectedPayBill] = useState<BillingItem | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  
  // PDF Invoice Generator State
  const [pdfCohort, setPdfCohort] = useState('VII - A');
  const [pdfMonth, setPdfMonth] = useState('');
  const [pdfDueDate, setPdfDueDate] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Rejection Modals
  const [rejectingItemType, setRejectingItemType] = useState<'billing' | 'expense' | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionInput, setRejectionInput] = useState('');

  // Bulk Generator State
  const [bulkClass, setBulkClass] = useState('');
  const [bulkType, setBulkType] = useState(STANDARD_BILLING_CATALOG[0].type);
  const [bulkPeriod, setBulkPeriod] = useState('Desember 2023');
  const [bulkAmount, setBulkAmount] = useState(STANDARD_BILLING_CATALOG[0].amount.toString());
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkStepMsg, setBulkStepMsg] = useState('');

  // Payment proof simulation data State
  const [payChannel, setPayChannel] = useState('BSI');
  const [paymentProofFileName, setPaymentProofFileName] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const paymentProofInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // General state
  const [formData, setFormData] = useState<any>({});
  const [financeToast, setFinanceToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showFinanceToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFinanceToast({ message, type });
    setTimeout(() => setFinanceToast(null), 4000);
  };
  const selectPaymentProofFile = (file: File | null) => {
    if (!file) return;
    const validType = ['image/png', 'image/jpeg', 'application/pdf'].includes(file.type);
    if (!validType || file.size > 3 * 1024 * 1024) {
      setPaymentProofFile(null); setPaymentProofFileName('');
      showFinanceToast('Pilih PNG/JPG/PDF berukuran maksimal 3 MB.', 'error');
      return;
    }
    setPaymentProofFile(file); setPaymentProofFileName(file.name);
  };

  const handleConfirmBillPayment = async (bill: BillingItem, method: string = 'Transfer Manual (BSI)') => {
    if (!user?.tenantId || !user?.uid || !isFinanceAdmin) { showFinanceToast('Akses konfirmasi hanya untuk admin tenant aktif.', 'error'); return; }
    if (financeLocked) { showFinanceToast('Buku keuangan sedang ditutup.', 'error'); return; }
    try {
      const billRef = doc(db, 'financeBillings', bill.id);
      const ledgerRef = doc(collection(db, 'financeTransactions'));
      const receiptNo = 'KWT/FIN/' + new Date().getFullYear() + '/' + Date.now();
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(billRef);
        if (!snapshot.exists()) throw new Error('Tagihan tidak ditemukan.');
        const data = snapshot.data();
        if (data.tenantId !== user.tenantId) throw new Error('Tagihan bukan milik tenant aktif.');
        if (data.status === 'Paid') throw new Error('Tagihan sudah lunas; transaksi ganda ditolak.');
        if (!['Unpaid', 'Overdue', 'Partial', 'Verification'].includes(data.status)) throw new Error('Status tagihan tidak dapat dikonfirmasi.');
        if (data.status === 'Verification' && !data.proofStoragePath) throw new Error('Bukti transfer belum tersimpan pada Storage.');
        const amount = Math.max(0, Number(data.amount || 0) - Number(data.paidAmount || 0));
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Sisa tagihan tidak valid.');
        let candidateRef: any = null;
        let candidateSnapshot: any = null;
        if (data.candidateId && user.modulePermissions?.ppdb !== false) {
          candidateRef = doc(db, 'candidates', String(data.candidateId));
          candidateSnapshot = await transaction.get(candidateRef);
          if (!candidateSnapshot.exists() || candidateSnapshot.data().tenantId !== user.tenantId) throw new Error('Kandidat PPDB tidak ditemukan pada tenant aktif.');
        }
        const paidAt = new Date().toISOString().slice(0, 10);
        transaction.update(billRef, { status: 'Paid', paidAmount: Number(data.amount), paymentMethod: method, proofFile: null, receiptNo, paidAt, updatedAt: serverTimestamp(), updatedByUid: user.uid });
        transaction.set(ledgerRef, tenantRecord(user?.tenantId, { tenantId: user.tenantId, type: 'income', sourceType: 'billing', sourceId: bill.id, description: 'Pelunasan tagihan ' + bill.id, amount, paymentMethod: method, receiptNo, createdByUid: user.uid, createdAt: serverTimestamp() }));
        if (candidateRef && candidateSnapshot) {
          const payment = candidateSnapshot.data().payment || {};
          const feeKey = data.paymentType === 'registration' ? 'registrationFee' : 'tuitionFee';
          const fee = { ...(payment[feeKey] || {}), amount: Number(data.amount), paidAmount: Number(data.amount), status: 'Paid', paidAt, method, receiptNo, invoiceId: bill.id };
          const nextPayment = { ...payment, [feeKey]: fee };
          const registrationPaid = nextPayment.registrationFee?.status === 'Paid' ? Number(nextPayment.registrationFee.paidAmount ?? nextPayment.registrationFee.amount ?? 0) : 0;
          const tuitionPaid = nextPayment.tuitionFee?.status === 'Paid' ? Number(nextPayment.tuitionFee.paidAmount ?? nextPayment.tuitionFee.amount ?? 0) : 0;
          nextPayment.totalPaid = registrationPaid + tuitionPaid;
          transaction.update(candidateRef, { payment: nextPayment, updatedAt: serverTimestamp() });
        }
      });
      showFinanceToast('Pembayaran ' + bill.id + ' tercatat atomik; kuitansi ' + receiptNo + ' dibuat.', 'success');
    } catch (error: any) {
      console.error('Konfirmasi pembayaran gagal:', error);
      showFinanceToast(error?.message || 'Pembayaran gagal disimpan.', 'error');
    }
  };

  const handlePullPPDBInvoices = async () => {
    if (!user?.tenantId || !isFinanceAdmin) { showFinanceToast('Akses impor tagihan PPDB hanya tersedia untuk admin tenant aktif.', 'error'); return; }
    setIsPullingPPDB(true);
    try {
      const candidatesQuery = query(collection(db, 'candidates'), where('tenantId', '==', user.tenantId));
      const snapshot = await getDocs(candidatesQuery);
      const candidates = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as any));
      const count = await ppdbIntegrationService.batchGenerateRegistrationBills(candidates, 250000, user.tenantId);
      showFinanceToast('Berhasil menerbitkan ' + count + ' tagihan PPDB baru di tenant ini.', 'success');
      setBillingCategoryFilter('ppdb');
    } catch (error: any) {
      console.error('Impor tagihan PPDB gagal:', error);
      showFinanceToast(error?.message || 'Gagal menarik tagihan PPDB.', 'error');
    } finally {
      setIsPullingPPDB(false);
    }
  };

  const [billings, setBillings] = useState<BillingItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [financeLocked, setFinanceLocked] = useState(false);
  const [masterSantri, setMasterSantri] = useState<any[]>([]);

  useEffect(() => {
    setBillings([]);
    if (!user?.tenantId || !user?.uid) return;
    const filters: any[] = [];
    if (role === 'Walisantri') {
      const linkedSantriId = (user as any).linkedSantriId;
      if (!linkedSantriId) return;
      filters.push(where('santriId', '==', linkedSantriId));
    } else if (!isFinanceAdmin) return;
    return onSnapshot(tenantScopedQuery(collection(db, 'financeBillings'), user?.tenantId, ...filters), snapshot => {
      setBillings(snapshot.docs.map(item => ({ ...(item.data() as Record<string, any>), id: item.id } as BillingItem)));
    }, error => {
      setBillings([]);
      console.error('Gagal memuat tagihan tenant:', error);
      showFinanceToast('Data tagihan tidak dapat dimuat. Periksa akses tenant dan migrasi data.', 'error');
    });
  }, [user?.tenantId, user?.uid, role]);

  useEffect(() => {
    setExpenses([]);
    if (!user?.tenantId || !user?.uid || (!isFinanceAdmin && role !== 'Ustadz')) return;
    const filters: any[] = [];
    if (!isFinanceAdmin) filters.push(where('requesterUid', '==', user.uid));
    return onSnapshot(tenantScopedQuery(collection(db, 'financeExpenses'), user?.tenantId, ...filters), snapshot => {
      setExpenses(snapshot.docs.map(item => ({ ...(item.data() as Record<string, any>), id: item.id } as ExpenseItem)));
    }, error => {
      setExpenses([]);
      console.error('Gagal memuat pengeluaran tenant:', error);
      showFinanceToast('Data pengeluaran tidak dapat dimuat. Periksa akses tenant dan migrasi data.', 'error');
    });
  }, [user?.tenantId, user?.uid, role]);

  useEffect(() => {
    setMasterSantri([]);
    if (!user?.tenantId || !isFinanceAdmin) return;
    const studentsQuery = query(collection(db, 'entityRecords'), where('tenantId', '==', user.tenantId), where('type', '==', 'Santri'));
    return onSnapshot(studentsQuery, snapshot => {
      setMasterSantri(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
    }, error => {
      setMasterSantri([]);
      console.error('Gagal memuat master santri:', error);
    });
  }, [user?.tenantId, role]);

  useEffect(() => {
    setFinanceLocked(false);
    if (!user?.tenantId) return;
    const controlRef = doc(db, 'tenants', user.tenantId, 'settings', 'financeControl');
    return onSnapshot(controlRef, snapshot => setFinanceLocked(snapshot.exists() && snapshot.data().financeLocked === true), error => {
      console.error('Gagal memuat status penutupan buku:', error);
      setFinanceLocked(true);
    });
  }, [user?.tenantId]);

  // Compute dynamic lists based on Master Data
  const dynamicStudentsByClass = useMemo(() => {
    const map: Record<string, string[]> = {};
    masterSantri.forEach(s => {
      const g = typeof s.grade === 'string' ? s.grade.trim() : '';
      if (!g || typeof s.name !== 'string' || !s.name.trim()) return;
      if (!map[g]) map[g] = [];
      map[g].push(s.name);
    });
    return map;
  }, [masterSantri]);

  const uniqueClasses = useMemo(() => {
    return Object.keys(dynamicStudentsByClass).sort();
  }, [dynamicStudentsByClass]);

  const walisantriChildren = useMemo(() => {
    if (role !== 'Walisantri' || !user) return [];
    const profile = user as any;
    const names = [profile.linkedSantriName, ...(Array.isArray(profile.linkedSantriNames) ? profile.linkedSantriNames : [])]
      .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0);
    return [...new Set(names)];
  }, [role, user]);

  const handleToggleFinanceLock = async () => {
    if (!user?.tenantId || !user?.uid || !isFinanceAdmin) { showFinanceToast('Hanya admin tenant aktif yang dapat menutup buku.', 'error'); return; }
    const nextLocked = !financeLocked;
    try {
      await setDoc(doc(db, 'tenants', user.tenantId, 'settings', 'financeControl'), tenantRecord(user?.tenantId, {
        tenantId: user.tenantId, financeLocked: nextLocked, updatedByUid: user.uid, updatedAt: serverTimestamp()
      }), { merge: true });
      showFinanceToast(nextLocked ? 'Buku keuangan tenant berhasil ditutup.' : 'Buku keuangan tenant dibuka kembali.', nextLocked ? 'error' : 'success');
    } catch (error: any) {
      console.error('Perubahan status buku gagal:', error);
      showFinanceToast(error?.message || 'Status buku gagal disimpan.', 'error');
    }
  };

  const monthlyFinanceData = useMemo(() => {
    const buckets = new Map<string, { month: string; income: number; expense: number }>();
    const bucketFor = (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      if (!buckets.has(key)) buckets.set(key, { month: new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(date), income: 0, expense: 0 });
      return buckets.get(key)!;
    };
    billings.forEach(bill => {
      const bucket = bucketFor(bill.paidAt || bill.date);
      if (bucket && (bill.status === 'Paid' || bill.status === 'Partial')) bucket.income += Number(bill.paidAmount ?? bill.amount ?? 0);
    });
    expenses.forEach(expense => {
      const bucket = bucketFor(expense.approvedAt || expense.date);
      if (bucket && expense.status === 'Approved') bucket.expense += Number(expense.amount || 0);
    });
    return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-6).map(([, value]) => value);
  }, [billings, expenses]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR', 
      minimumFractionDigits: 0 
    }).format(amount);
  };

  // Finance mutations are written to Firestore; tenant snapshots drive the UI.
  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenantId || !user?.uid) { showFinanceToast('Sesi tenant tidak aktif.', 'error'); return; }
    if (financeLocked) { showFinanceToast('Buku keuangan sedang ditutup.', 'error'); return; }
    const amount = Number(formData.amount);
    if (!Number.isFinite(amount) || amount <= 0) { showFinanceToast('Nominal harus lebih besar dari nol.', 'error'); return; }
    try {
      if (activeTab === 'billing') {
        if (!isFinanceAdmin) { showFinanceToast('Penerbitan tagihan hanya untuk admin tenant.', 'error'); return; }
        const student = masterSantri.find(item => item.name === formData.santriName && item.grade === formData.grade);
        if (!student?.id || !student.name) { showFinanceToast('Pilih santri yang terdaftar pada tenant aktif.', 'error'); return; }
        const id = encodeURIComponent(JSON.stringify(['BILL', user.tenantId, student.id, String(formData.type || '').trim(), String(formData.period || '').trim()]));
        const newBill: BillingItem = {
          id, tenantId: user.tenantId, santriId: student.id, createdByUid: user.uid,
          santriName: student.name, grade: student.grade, type: String(formData.type || '').trim(),
          period: String(formData.period || '').trim(), amount, status: 'Unpaid',
          date: new Date().toISOString().slice(0, 10), paymentMethod: null, proofFile: null
        };
        if (!newBill.type || !newBill.period) { showFinanceToast('Jenis dan periode tagihan wajib diisi.', 'error'); return; }
        const billRef = doc(db, 'financeBillings', id);
        await runTransaction(db, async (transaction) => {
          const existingBill = await transaction.get(billRef);
          if (existingBill.exists()) {
            throw new Error('Tagihan untuk santri, jenis, dan periode ini sudah pernah diterbitkan.');
          }
          transaction.set(billRef, tenantRecord(user?.tenantId, { ...newBill, createdAt: serverTimestamp() }));
        });
        showFinanceToast('Tagihan untuk ' + student.name + ' berhasil diterbitkan.', 'success');
      } else if (activeTab === 'expenses') {
        if (!isFinanceAdmin && role !== 'Ustadz') { showFinanceToast('Akses pengajuan pengeluaran ditolak.', 'error'); return; }
        const id = generateUniqueId('Expense', []);
        const newExpense: ExpenseItem = {
          id, tenantId: user.tenantId, requesterUid: user.uid,
          category: String(formData.category || '').trim(), description: String(formData.description || '').trim(),
          amount, date: new Date().toISOString().slice(0, 10), status: 'Pending',
          department: String(formData.department || '').trim(), requester: user.name || 'Pengguna'
        };
        if (!newExpense.category || !newExpense.description || !newExpense.department) { showFinanceToast('Kategori, uraian, dan unit wajib diisi.', 'error'); return; }
        await setDoc(doc(db, 'financeExpenses', id), tenantRecord(user?.tenantId, { ...newExpense, createdAt: serverTimestamp() }));
        showFinanceToast('Pengajuan pengeluaran tersimpan dan menunggu persetujuan admin.', 'success');
      }
      setIsModalOpen(false);
      setFormData({});
    } catch (error: any) {
      console.error('Penyimpanan finance gagal:', error);
      showFinanceToast(error?.message || 'Data keuangan gagal disimpan.', 'error');
    }
  };

  const handleBulkGenerate = async () => {
    if (!user?.tenantId || !user?.uid || !isFinanceAdmin) { showFinanceToast('Bulk tagihan hanya tersedia untuk admin tenant.', 'error'); return; }
    if (financeLocked) { showFinanceToast('Buku keuangan sedang ditutup.', 'error'); return; }
    const amount = Number(bulkAmount);
    const period = bulkPeriod.trim();
    const students = masterSantri.filter(item => item.grade === bulkClass && item.id && item.name);
    if (!students.length) { showFinanceToast('Tidak ada santri pada rombel tenant ini.', 'error'); return; }
    if (!Number.isFinite(amount) || amount <= 0 || !period || !bulkType) { showFinanceToast('Periksa periode, jenis, dan nominal tagihan.', 'error'); return; }
    setIsGeneratingBulk(true);
    setBulkProgress(0);
    setBulkStepMsg('Menerbitkan tagihan tenant secara idempoten...');
    let created = 0;
    try {
      for (let index = 0; index < students.length; index++) {
        const student = students[index];
        const id = ['BULK', user.tenantId, student.id, bulkType, period].map(part => encodeURIComponent(String(part))).join('__');
        const billRef = doc(db, 'financeBillings', id);
        const didCreate = await runTransaction(db, async transaction => {
          const existing = await transaction.get(billRef);
          if (existing.exists()) return false;
          transaction.set(billRef, tenantRecord(user?.tenantId, {
            id, tenantId: user.tenantId, santriId: student.id, createdByUid: user.uid,
            santriName: student.name, grade: student.grade, type: bulkType, period, amount,
            status: 'Unpaid', date: new Date().toISOString().slice(0, 10), paymentMethod: null,
            proofFile: null, createdAt: serverTimestamp()
          }));
          return true;
        });
        if (didCreate) created++;
        setBulkProgress(Math.round(((index + 1) / students.length) * 100));
      }
      setBulkStepMsg('Tagihan tersimpan pada tenant aktif.');
      setIsBulkModalOpen(false);
      showFinanceToast(created + ' tagihan baru diterbitkan; ' + (students.length - created) + ' duplikat dilewati.', 'success');
    } catch (error: any) {
      console.error('Bulk tagihan gagal:', error);
      showFinanceToast(error?.message || 'Bulk tagihan gagal disimpan.', 'error');
    } finally {
      setIsGeneratingBulk(false);
    }
  };

  const handleApproveExpense = async (expense: ExpenseItem) => {
    if (!user?.tenantId || !user?.uid || !isFinanceAdmin) { showFinanceToast('Hanya admin tenant yang dapat menyetujui pengeluaran.', 'error'); return; }
    if (financeLocked) { showFinanceToast('Buku keuangan sedang ditutup.', 'error'); return; }
    if (expense.requesterUid === user.uid) { showFinanceToast('Pengaju tidak boleh menyetujui pengeluarannya sendiri.', 'error'); return; }
    try {
      const expenseRef = doc(db, 'financeExpenses', expense.id);
      const ledgerRef = doc(collection(db, 'financeTransactions'));
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(expenseRef);
        if (!snapshot.exists() || snapshot.data().tenantId !== user.tenantId) throw new Error('Pengeluaran tidak ditemukan pada tenant aktif.');
        const data = snapshot.data();
        if (data.status !== 'Pending' || data.requesterUid === user.uid) throw new Error('Status pengeluaran berubah atau pemisahan tugas gagal.');
        transaction.update(expenseRef, { status: 'Approved', approvedByUid: user.uid, approvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        transaction.set(ledgerRef, tenantRecord(user?.tenantId, { tenantId: user.tenantId, type: 'expense', sourceType: 'expense', sourceId: expense.id, description: data.description, amount: Number(data.amount), createdByUid: user.uid, createdAt: serverTimestamp() }));
      });
      showFinanceToast('Pengeluaran disetujui dan dicatat pada ledger tenant.', 'success');
    } catch (error: any) {
      console.error('Persetujuan pengeluaran gagal:', error);
      showFinanceToast(error?.message || 'Pengeluaran gagal disetujui.', 'error');
    }
  };

  const handleOpenPaymentProof = async (bill: BillingItem) => {
    if (!bill.proofStoragePath) { showFinanceToast('File bukti transfer tidak tersedia.', 'error'); return; }
    const proofWindow = window.open('about:blank', '_blank');
    if (!proofWindow) { showFinanceToast('Izinkan pop-up agar bukti transfer dapat dibuka.', 'error'); return; }
    proofWindow.opener = null;
    try {
      const currentAuthUser = getAuthSession();
      if (!currentAuthUser || currentAuthUser.uid !== user?.uid) throw new Error('Sesi login tidak cocok. Masuk ulang sebelum membuka bukti.');
      const token = await getAccessToken();
      const response = await fetch('/api/finance/payment-proofs/' + encodeURIComponent(bill.id), {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Bukti transfer tidak dapat diakses oleh tenant ini.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      proofWindow.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
    } catch (error: any) {
      proofWindow.close();
      console.error('Bukti transfer gagal dibuka:', error);
      showFinanceToast(error?.message || 'Bukti transfer tidak dapat diakses oleh tenant ini.', 'error');
    }
  };

  const handleConfirmManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayBill || !user?.tenantId || !user?.uid) return;
    if (!paymentProofFile) { showFinanceToast('Pilih bukti transfer yang benar-benar akan diunggah.', 'error'); return; }
    const linkedSantriId = (user as any).linkedSantriId;
    if (role === 'Walisantri' && (!linkedSantriId || selectedPayBill.santriId !== linkedSantriId)) {
      showFinanceToast('Tagihan tidak terhubung ke akun wali ini.', 'error'); return;
    }
    try {
      const currentAuthUser = getAuthSession();
      if (!currentAuthUser || currentAuthUser.uid !== user.uid) throw new Error('Sesi login tidak cocok. Masuk ulang sebelum mengunggah bukti.');
      const token = await getAccessToken();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Berkas tidak dapat dibaca.'));
        reader.onerror = () => reject(new Error('Berkas tidak dapat dibaca.'));
        reader.readAsDataURL(paymentProofFile);
      });
      const separatorIndex = dataUrl.indexOf(',');
      const base64 = separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : '';
      if (!base64) throw new Error('Format berkas tidak valid.');
      const response = await fetch('/api/finance/payment-proofs', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingId: selectedPayBill.id,
          fileName: paymentProofFile.name,
          mimeType: paymentProofFile.type,
          base64,
          payChannel,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Bukti pembayaran gagal diunggah.');
      setIsPayModalOpen(false); setSelectedPayBill(null); setPaymentProofFileName(''); setPaymentProofFile(null);
      showFinanceToast('Bukti transfer diunggah dan pengajuan menunggu verifikasi bendahara.', 'success');
    } catch (error: any) {
      console.error('Pengajuan pembayaran gagal:', error);
      showFinanceToast(error?.message || 'Bukti pembayaran gagal diunggah.', 'error');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    selectPaymentProofFile(e.dataTransfer.files?.[0] || null);
  };

  // 5. Audit Close / Tutorial PDF mock trigger
  const handleExportLegerCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'ID Mutasi,Tanggal,Deskripsi/Entitas,Kategori,Tipe,Arus Masuk (Debit),Arus Keluar (Kredit),Status\n';

    // Append Invoices (Income)
    billings.forEach(bill => {
      const debit = bill.status === 'Paid' ? bill.amount : (bill.paidAmount || 0);
      csvContent += `${bill.id},${bill.date},"${bill.santriName} - ${bill.grade}",${bill.type},Debit,${debit},0,${bill.status}\n`;
    });

    // Append Expenses (Outcome)
    expenses.forEach(exp => {
      const credit = exp.status === 'Approved' ? exp.amount : 0;
      csvContent += `${exp.id},${exp.date},"${exp.description} (${exp.requester})",${exp.category},Kredit,0,${credit},${exp.status}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `LEGER_UTAMA_PESANTREN_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFinanceToast('📊 Leger Finansial Utama berhasil diekspor ke file CSV Spreadsheet!', 'success');
  };

  const handleOpenRejection = (type: 'billing' | 'expense', id: string) => {
    setRejectingItemType(type);
    setRejectingId(id);
    setRejectionInput('');
  };

  const handleConfirmRejection = async () => {
    if (!rejectionInput.trim() || !rejectingId || !user?.tenantId || !user?.uid || !isFinanceAdmin) { showFinanceToast('Alasan penolakan dan akses admin tenant diperlukan.', 'error'); return; }
    if (financeLocked) { showFinanceToast('Buku keuangan sedang ditutup.', 'error'); return; }
    try {
      if (rejectingItemType === 'billing') {
        await runTransaction(db, async transaction => {
          const ref = doc(db, 'financeBillings', rejectingId);
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists() || snapshot.data().tenantId !== user.tenantId) throw new Error('Tagihan tidak ditemukan pada tenant aktif.');
          if (snapshot.data().status !== 'Verification') throw new Error('Bukti tidak lagi menunggu verifikasi.');
          transaction.update(ref, { status: 'Unpaid', rejectionReason: rejectionInput.trim(), reviewedByUid: user.uid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        });
        showFinanceToast('Bukti pembayaran ditolak dengan alasan tercatat.', 'info');
      } else if (rejectingItemType === 'expense') {
        await runTransaction(db, async transaction => {
          const ref = doc(db, 'financeExpenses', rejectingId);
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists() || snapshot.data().tenantId !== user.tenantId) throw new Error('Pengeluaran tidak ditemukan pada tenant aktif.');
          if (snapshot.data().status !== 'Pending' || snapshot.data().requesterUid === user.uid) throw new Error('Status berubah atau pemisahan tugas gagal.');
          transaction.update(ref, { status: 'Rejected', rejectionReason: rejectionInput.trim(), reviewedByUid: user.uid, reviewedAt: serverTimestamp() });
        });
        showFinanceToast('Pengajuan dana ditolak dengan alasan tercatat.', 'info');
      }
      setRejectingItemType(null); setRejectingId(null); setRejectionInput('');
    } catch (error: any) {
      console.error('Penolakan finance gagal:', error);
      showFinanceToast(error?.message || 'Penolakan gagal disimpan.', 'error');
    }
  };

  // Math Metrics
  const computedInvoiceMetrics = () => {
    let totalTarget = 0;
    let actualPaid = 0;
    let pendingVerification = 0;

    billings.forEach(b => {
      totalTarget += b.amount;
      if (b.status === 'Paid') {
        actualPaid += b.amount;
      } else if (b.status === 'Partial') {
        actualPaid += (b.paidAmount || 0);
      } else if (b.status === 'Verification') {
        pendingVerification += b.amount;
      }
    });

    const totalApprovedExpenses = expenses
      .filter(e => e.status === 'Approved')
      .reduce((sum, e) => sum + e.amount, 0);

    const pendingExpenses = expenses
      .filter(e => e.status === 'Pending')
      .reduce((sum, e) => sum + e.amount, 0);

    const netCashFlow = actualPaid - totalApprovedExpenses;

    return { totalTarget, actualPaid, pendingVerification, totalApprovedExpenses, pendingExpenses, netCashFlow };
  };

  const metrics = computedInvoiceMetrics();

  // Filter list results
  const filteredBillings = billings.filter(b => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = b.santriName.toLowerCase().includes(term) || b.id.toLowerCase().includes(term) || b.type.toLowerCase().includes(term);
    
    let matchesCategory = true;
    if (billingCategoryFilter === 'ppdb') {
      matchesCategory = b.id.startsWith('INV-PPDB-') || b.type.toLowerCase().includes('ppdb') || b.type.toLowerCase().includes('pendaftaran') || b.grade.toLowerCase().includes('ppdb');
    } else if (billingCategoryFilter === 'spp') {
      matchesCategory = !b.id.startsWith('INV-PPDB-') && !b.type.toLowerCase().includes('ppdb') && !b.grade.toLowerCase().includes('ppdb');
    } else if (billingCategoryFilter === 'verification') {
      matchesCategory = b.status === 'Verification';
    } else if (billingCategoryFilter === 'unpaid') {
      matchesCategory = b.status === 'Unpaid' || b.status === 'Overdue' || b.status === 'Partial';
    }

    // If Parent/Walisantri is logged in, ONLY show billing matching their child
    if (role === 'Walisantri') {
      const linkedId = (user as any)?.linkedSantriId;
      return matchesSearch && matchesCategory && !!linkedId && b.santriId === linkedId;
    }
    return matchesSearch && matchesCategory;
  });

  const filteredExpenses = expenses.filter(e => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = e.description.toLowerCase().includes(term) || e.category.toLowerCase().includes(term) || e.id.toLowerCase().includes(term);
    
    // If general Ustadz is active, only show their academic/requisition expenses or list
    if (role === 'Ustadz') {
      return matchesSearch && (e.requester === 'Ust. Hidayat Lc.' || e.department === 'Kurikulum/Akademik');
    }
    return matchesSearch;
  });

  // Render Section 1: Billing Panel
  const renderBilling = () => {
    const isWalisantri = role === 'Walisantri';
    const hasVerificationQueue = billings.some(b => b.status === 'Verification');

    return (
      <div className="space-y-6">
        {/* Dashboard Walisantri (Single-View Billing Summary) */}
        {isWalisantri && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Total Tagihan Tertunggak</h4>
              <p className="text-2xl font-black text-red-500">
                {formatCurrency(filteredBillings.filter(b => b.status === 'Overdue' || b.status === 'Unpaid').reduce((sum, b) => sum + b.amount, 0))}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Menunggu Verifikasi Bank</h4>
              <p className="text-2xl font-black text-amber-500">
                {formatCurrency(filteredBillings.filter(b => b.status === 'Verification').reduce((sum, b) => sum + b.amount, 0))}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Total Lunas (Tahun Ini)</h4>
              <p className="text-2xl font-black text-emerald-500">
                {formatCurrency(filteredBillings.filter(b => b.status === 'Paid').reduce((sum, b) => sum + b.amount, 0))}
              </p>
            </div>
          </div>
        )}

        {/* Verification Queue (Admins only) */}
        {!isWalisantri && (role === 'SuperAdmin' || role === 'Admin') && hasVerificationQueue && (
          <div className="bg-amber-950/20 border border-amber-500/20 rounded-2xl p-5 space-y-4 animate-pulse">
            <div className="flex items-center gap-2 text-amber-400 font-sans">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <div>
                <h3 className="text-xs font-black tracking-widest uppercase">Pemberitahuan: Antrean Verifikasi Transfer Wali Santri</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Berikut adalah pembayaran mandiri yang memerlukan pencocokan mutasi rekening bank pesantren.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {billings.filter(b => b.status === 'Verification').map(bill => (
                <div key={bill.id} className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between font-sans">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-[10.5px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">{bill.id}</span>
                      <span className="text-[10px] text-amber-400 italic">Menunggu Approval</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-2">{bill.santriName}</h4>
                    <p className="text-xs text-slate-400">{bill.type} - {bill.period}</p>
                    
                    <div className="mt-3 py-1.5 px-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.03] rounded-lg space-y-1">
                      <p className="text-[11px] text-slate-400 font-medium">Channel: <span className="text-slate-800 dark:text-slate-200 font-bold">{bill.paymentMethod}</span></p>
                      <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200">Jumlah Transfer: {formatCurrency(bill.amount)}</p>
                      {bill.proofFile && (
                        <button type="button" onClick={() => void handleOpenPaymentProof(bill)} disabled={!bill.proofStoragePath} className="text-[10.5px] text-emerald-400 underline font-mono cursor-pointer disabled:text-slate-500 disabled:no-underline flex items-center gap-1 mt-1">
                          📎 {bill.proofFile || 'Bukti transfer tidak tersedia'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2.5 mt-4">
                    <button
                      onClick={() => handleConfirmBillPayment(bill, bill.paymentMethod || 'Transfer')}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Konfirmasi Sah
                    </button>
                    <button
                      onClick={() => handleOpenRejection('billing', bill.id)}
                      className="py-1.5 px-3 bg-red-950/50 hover:bg-red-900/40 text-red-400 border border-red-950 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {isWalisantri ? 'Tagihan Madrasah Ananda' : 'Kuitansi & Buku Piutang Santri'}
            </h3>
            <p className="text-xs text-slate-500">
              {isWalisantri ? 'Daftar iuran kas bulanan, makan asrama, denda kepesantrenan ananda.' : 'Daftar seluruh santri yang berpiutang, lunas, maupun tertunggak.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isWalisantri && (role === 'SuperAdmin' || role === 'Admin') && (
              <>
                <button
                  onClick={() => setIsPdfModalOpen(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/20 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-indigo-650/10"
                >
                  <FileText className="w-3.5 h-3.5" /> Cetak Tagihan PDF
                </button>
                <button
                  onClick={() => {
                    setBulkType(STANDARD_BILLING_CATALOG[0].type);
                    setBulkAmount(STANDARD_BILLING_CATALOG[0].amount.toString());
                    setIsBulkModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/20 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-indigo-650/10"
                >
                  <Users className="w-3.5 h-3.5" /> Bulk Release SPP
                </button>
                <button
                  onClick={() => showFinanceToast('Pengingat belum terhubung ke layanan notifikasi; belum ada pesan yang dikirim.', 'info')}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/20 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-650/10"
                >
                  <Send className="w-3.5 h-3.5" /> Pengingat (belum aktif)
                </button>
                <button
                  onClick={handlePullPPDBInvoices}
                  disabled={isPullingPPDB}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/20 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-650/10 disabled:opacity-50"
                >
                  <DollarSign className="w-3.5 h-3.5" /> {isPullingPPDB ? 'Menarik...' : 'Tarik Tagihan PPDB'}
                </button>
                <button
                  onClick={() => {
                    setFormData({
                      type: STANDARD_BILLING_CATALOG[0].type,
                      amount: STANDARD_BILLING_CATALOG[0].amount.toString()
                    });
                    setIsModalOpen(true);
                  }}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Buat Tagihan Tunggal
                </button>
              </>
            )}
          </div>
        </div>

        {/* Regular Billing Matrix Table */}
        <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-black/60">
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Invoice / Tanggal</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Santri / Kelas</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Jenis Tagihan</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Jumlah Piutang</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Metode / Status</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredBillings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 text-xs font-sans">
                      Tidak ada tagihan yang cocok dengan kata pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredBillings.map(bill => (
                    <tr key={bill.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="text-sm font-bold text-indigo-400 font-mono">{bill.id}</div>
                        <div className="text-[10.5px] text-slate-500 font-mono mt-0.5">{bill.date}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{bill.santriName}</div>
                        <div className="text-xs text-slate-500">Kelas: {bill.grade}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-slate-300 font-medium">{bill.type}</div>
                        <div className="text-[11px] text-indigo-300 font-mono bg-indigo-900/20 border border-indigo-900/50 px-1 py-0.5 rounded-md inline-block mt-1">{bill.period}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-black text-slate-800 dark:text-slate-200">{formatCurrency(bill.amount)}</div>
                        {bill.paidAmount && (
                          <div className="text-[11px] text-emerald-400 mt-1 font-sans">Telah terbayar: {formatCurrency(bill.paidAmount)}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className={cn(
                            "px-2.5 py-1 rounded-md text-[10px] uppercase font-mono font-black tracking-wider border",
                            bill.status === 'Paid' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            bill.status === 'Unpaid' ? "bg-slate-500/20 text-slate-400 border-slate-600/30" :
                            bill.status === 'Verification' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                            bill.status === 'Partial' ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" :
                            "bg-red-500/20 text-red-500 dark:text-red-400 border-red-500/30"
                          )}>
                            {bill.status === 'Verification' ? 'Menunggu Approval' : bill.status}
                          </span>
                          {bill.paymentMethod && (
                            <span className="text-[10px] text-slate-400 font-mono">{bill.paymentMethod}</span>
                          )}
                          {bill.rejectionReason && (
                            <span className="text-[9.5px] text-red-400 max-w-[150px] leading-tight italic font-sans" title={bill.rejectionReason}>
                              Revisi: "{bill.rejectionReason}"
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {isWalisantri && (bill.status === 'Unpaid' || bill.status === 'Overdue') && (
                          <button 
                            onClick={() => {
                              setSelectedPayBill(bill);
                              setPaymentProofFile(null);
                              setPaymentProofFileName('');
                              setIsPayModalOpen(true);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            Kirim Bukti Pembayaran
                          </button>
                        )}
                        
                        {!isWalisantri && (role === 'SuperAdmin' || role === 'Admin') && (bill.status === 'Unpaid' || bill.status === 'Overdue' || bill.status === 'Partial') && (
                          <>
                            <button 
                              onClick={() => {
                                if (financeLocked) {
                                  showFinanceToast('🔒 Jurnal Keuangan Terkunci! Silakan buka kunci untuk mengedit mutasi.', 'error');
                                  return;
                                }
                                handleConfirmBillPayment(bill, 'Tunai Kasir');
                              }}
                              className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/20 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                            >
                              Lunas Tunai
                            </button>
                            <button 
                              onClick={() => {
                                showFinanceToast('Pengiriman pengingat belum terhubung ke layanan notifikasi; belum ada pesan yang dikirim.', 'info');
                              }}
                              className="ml-2 bg-amber-500/20 hover:bg-amber-500/40 text-amber-500 dark:text-amber-400 border border-amber-500/20 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                            >
                              <Send className="w-3 h-3 inline-block mr-1 mb-0.5" /> Reminder
                            </button>
                          </>
                        )}

                        {bill.status === 'Paid' && (
                          <button 
                            onClick={() => {
                              showFinanceToast(`🖨️ Mengunduh lembar kuitansi resmi madrasah untuk invoice ${bill.id}...`, 'info');
                              const printContent = `KUITANSI RESMI MADRASAH\nID: ${bill.id}\nNama: ${bill.santriName}\nKelas: ${bill.grade}\nHal: ${bill.type} (${bill.period})\nJumlah: ${formatCurrency(bill.amount)}\nStatus: LUNAS SAH`;
                              const blob = new Blob([printContent], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `RECEIPT_${bill.id}.txt`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="text-indigo-400 hover:text-indigo-300 font-extrabold text-[11px] underline cursor-pointer"
                          >
                            Unduh Kuitansi PDF
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Render Section 2: Requisition & Expense Board
  const renderExpenses = () => {
    const isUstadz = role === 'Ustadz';
    const pendingRequisitions = expenses.filter(e => e.status === 'Pending');
    const approvedExpenses = expenses.filter(e => e.status === 'Approved' || e.status === 'Rejected');

    return (
      <div className="space-y-6">
        {/* Banner Informasional */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {isUstadz ? 'Pengajuan Operational Budget & Reimbursement Staff' : 'Persetujuan Pengeluaran, Reimbursement & Pencairan Dana'}
            </h3>
            <p className="text-xs text-slate-500 font-sans">
              {isUstadz ? 'Riwayat dana taktis ustadz pengampu materi, penanggungjawab asrama & klaim reimbursement.' : 'Validasi aliran dana operational untuk klaim staff, catering, asrama, dan bisyarah.'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setFormData({});
                setIsModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/20 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-indigo-650/10"
            >
              <Plus className="w-4 h-4" /> {isUstadz ? 'Ajukan Reimbursement / Anggaran' : 'Catat Pengeluaran Baru'}
            </button>
          </div>
        </div>

        {/* Dashboard sub-panels based on role */}
        {!isUstadz && (role === 'SuperAdmin' || role === 'Admin') ? (
          <div className="grid grid-cols-1 gap-6">
            
            {/* 2A. PENDING REQUISITIONS WORKFLOW */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500 flex items-center gap-1">
                <Clock className="w-4 h-4" /> Menunggu Persetujuan Klaim / Pengeluaran ({pendingRequisitions.length})
              </h4>
              
              {pendingRequisitions.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.04] rounded-xl p-6 text-center text-xs text-slate-400 font-sans">
                  Sempurna! Seluruh pengajuan klaim staff & anggaran operasional telah diproses.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingRequisitions.map(exp => (
                    <div key={exp.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 font-sans hover:border-slate-300 dark:hover:border-slate-800 transition-all flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="text-[10.5px] font-mono text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-md font-bold">{exp.id}</span>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-[#3b82f6] px-2 py-0.5 bg-blue-500/10 rounded-full">{exp.category}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-2.5 leading-tight">{exp.description}</h4>
                        
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200 dark:border-white/[0.02]">
                          <div>
                            <span className="text-slate-500 block text-[10px]">DIREKUT OLEH:</span>
                            <p className="font-bold text-slate-300">{exp.requester}</p>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">DIVISI/UNIT:</span>
                            <p className="font-bold text-slate-300">{exp.department}</p>
                          </div>
                        </div>

                        <div className="mt-3.5 flex justify-between items-baseline">
                          <span className="text-[10px] text-slate-550">NOMINAL ANGGARAN:</span>
                          <span className="text-base font-black text-red-400">{formatCurrency(exp.amount)}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-slate-900 mt-2">
                        <button
                          onClick={() => {
                            if (financeLocked) {
                              showFinanceToast('🔒 Jurnal Keuangan Terkunci! Buka kunci terlebih dahulu.', 'error');
                              return;
                            }
                            void handleApproveExpense(exp);
                          }}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Setujui & Cairkan
                        </button>
                        <button
                          onClick={() => handleOpenRejection('expense', exp.id)}
                          className="px-3 bg-red-950/40 text-red-400 hover:bg-red-950/60 font-bold border border-red-950 rounded-lg text-xs transition-colors cursor-pointer"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2B. COMPOSITE LEDGER TABLE OF EXPENSES */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                Riwayat & Log Status Keuangan Operasional
              </h4>
              <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-black/60">
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID / Tanggal</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deskripsi Pembayaran</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pemohon / Devisi</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nominal Kredit</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {approvedExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-xs text-slate-500">
                          Belum ada historikal transaksi pengeluaran.
                        </td>
                      </tr>
                    ) : (
                      approvedExpenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-4">
                            <div className="text-xs font-bold text-slate-400 font-mono">{exp.id}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{exp.date}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{exp.description}</div>
                            <span className="inline-block px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] rounded text-slate-500 dark:text-slate-400 mt-1">{exp.category}</span>
                          </td>
                          <td className="p-4">
                            <div className="text-xs font-bold text-slate-300">{exp.requester}</div>
                            <div className="text-[10px] text-slate-500">{exp.department}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-sm font-bold text-red-400">{formatCurrency(exp.amount)}</div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono tracking-wider border",
                                exp.status === 'Approved' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
                              )}>
                                {exp.status}
                              </span>
                              {exp.rejectionReason && (
                                <span className="text-[9.5px] text-red-300 leading-tight italic font-sans max-w-[150px]">
                                  Revisi: "{exp.rejectionReason}"
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        ) : (
          /* 2C. TEACHER/STAFF WORKSPACE */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
            {/* Left sidebar: Bisyarah & Salary logs */}
            <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
                <Wallet className="w-4 h-4" /> LEMBAR REKAP BISYARAH USTADZ
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Anda login sebagai <span className="text-slate-800 dark:text-white font-bold">{role}</span>. Berikut detail honorarium mengajar bulanan dan tunjangan wali asrama yang sah divalidasi yayasan.
              </p>

              <div className="space-y-2.5">
                {[
                  { month: 'November 2023', role: 'Honor Mengajar Utama', amount: 3500000, status: 'Cair' },
                  { month: 'Oktober 2023', role: 'Honor Mengajar Utama', amount: 3500000, status: 'Cair' },
                  { month: 'September 2023', role: 'Tunjangan Beras & Asrama', amount: 1000000, status: 'Cair' },
                ].map((sal, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-500">{sal.month}</span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{sal.role}</p>
                      <p className="text-xs font-black text-emerald-400 mt-0.5">{formatCurrency(sal.amount)}</p>
                    </div>
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[9px] font-bold">CAIR</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right container: Personal budget submissions history */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                Pelacak Pengajuan Dana Taktis & Kegiatan Anda
              </h4>

              <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-black/60">
                      <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400">ID / Date</th>
                      <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400">Keperluan Pembayaran</th>
                      <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400">Nominal</th>
                      <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400 text-right">Status Evaluasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-xs text-slate-500">
                          Anda belum pernah mengajukan operational budget. Klik tombol di atas untuk mengajukan.
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-white/[0.01]">
                          <td className="p-3 text-xs font-mono text-slate-400">
                            <strong>{exp.id}</strong>
                            <p className="text-[9.5px] mt-0.5">{exp.date}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{exp.description}</p>
                            <span className="text-[9.5px] text-slate-500 bg-white dark:bg-slate-950 px-1 py-0.2 rounded border border-slate-200 dark:border-slate-800 mt-1 inline-block">{exp.category}</span>
                          </td>
                          <td className="p-3 text-xs font-bold text-slate-800 dark:text-slate-200">
                            {formatCurrency(exp.amount)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[9.5px] font-black uppercase font-mono tracking-wider border",
                                exp.status === 'Approved' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                exp.status === 'Pending' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                "bg-red-500/10 text-red-400 border-red-500/20"
                              )}>
                                {exp.status}
                              </span>
                              {exp.rejectionReason && (
                                <p className="text-[9px] text-red-300 italic max-w-[150px]">
                                  T Treasurer: "{exp.rejectionReason}"
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Section 3: Leger Utama Financial Report
  const renderReports = () => {
    // Breakdowns
    const totalActualIncome = metrics.actualPaid;
    const totalApprovedLoss = metrics.totalApprovedExpenses;

    const incomeBreakdown = [
      { name: 'Kas Syahriyah SPP', percent: 82, icon: <CreditCard className="w-3.5 h-3.5" />, color: 'bg-indigo-500' },
      { name: 'Wakaf, Infaq & Donasi', percent: 12, icon: <DollarSign className="w-3.5 h-3.5" />, color: 'bg-emerald-500' },
      { name: 'Hasil Niaga Koperasi', percent: 6, icon: <Wallet className="w-3.5 h-3.5" />, color: 'bg-teal-500' },
    ];

    const expenseBreakdown = [
      { name: 'Honor & Bisyarah Guru', percent: 45, icon: <Users className="w-3.5 h-3.5" />, color: 'bg-purple-500' },
      { name: 'Bahan Dapur Makanan', percent: 35, icon: <Wallet className="w-3.5 h-3.5" />, color: 'bg-red-500' },
      { name: 'Listrik, Air & Sarana', percent: 15, icon: <Plus className="w-3.5 h-3.5" />, color: 'bg-emerald-500' },
      { name: 'Suku Cadang & Atribut', percent: 5, icon: <History className="w-3.5 h-3.5" />, color: 'bg-amber-500' },
    ];

    const actualPercentCollected = metrics.totalTarget > 0 ? Math.round((metrics.actualPaid / metrics.totalTarget) * 100) : 0;

    return (
      <div className="space-y-6 animate-in fade-in duration-400 font-sans">
        
        {/* Action Header Panel */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Laporan Pertanggungjawaban Bulanan & Kas Audit
            </h3>
            <p className="text-xs text-slate-500">Rekapitulasi keuangan agregat, rasio likuidasi SPP, dan pembekuan transaksi bulanan.</p>
          </div>

          <div className="flex gap-2.5">
            {['SuperAdmin', 'Admin'].includes(role) && (
              <button
                onClick={handleToggleFinanceLock}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 border transition-all cursor-pointer",
                  financeLocked
                    ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                )}
              >
                {financeLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5 animate-pulse text-red-500" /> Book Closed: TUTUP BUKU AKTIF
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" /> Book Opened: REKAP AKTIF
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleExportLegerCSV}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Ekspor File (.CSV)
            </button>
          </div>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block">TARGET POTENSI TERIMA</span>
            <div className="text-lg font-black text-indigo-300 mt-1">{formatCurrency(metrics.totalTarget)}</div>
            <div className="text-[11px] text-slate-400 mt-2">Iuran terbit bulan berjalan</div>
          </div>

          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block">REALISASI KAS DITERIMA</span>
            <div className="text-lg font-black text-emerald-400 mt-1">{formatCurrency(metrics.actualPaid)}</div>
            <div className="mt-2.5 w-full bg-slate-900 rounded-full h-1.5">
              <div 
                className="bg-emerald-400 h-1.5 rounded-full" 
                style={{ width: `${Math.min(actualPercentCollected, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-emerald-400 mt-1 block font-bold font-mono">{actualPercentCollected}% Rasio Penagihan SPP</span>
          </div>

          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block">LEGER KAS TERBAYAR</span>
            <div className="text-lg font-black text-red-400 mt-1">{formatCurrency(metrics.totalApprovedExpenses)}</div>
            <div className="text-[11px] text-slate-400 mt-2">Approved Operational</div>
          </div>

          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block">SALDO UTAMA REKENING</span>
            <div className="text-lg font-black text-white mt-1">{formatCurrency(metrics.netCashFlow)}</div>
            <div className={cn(
              "text-[10.5px] font-bold mt-2 flex items-center gap-0.5",
              metrics.netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              {metrics.netCashFlow >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {metrics.netCashFlow >= 0 ? 'Surplus Operasional' : 'Defisit Kas Yayasan'}
            </div>
          </div>
          
        </div>

        {/* Dynamic breakups and chart grids */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Recharts Graphical Line chart */}
          <div className="lg:col-span-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              KOMPARASI ARUS KAS DEBIT vs KREDIT (RUPIAH)
            </h4>
            
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyFinanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={10} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickFormatter={(val) => `Rp ${(val / 1000000).toFixed(0)}M`}
                  />
                  <Tooltip 
                    cursor={{ stroke: 'rgba(255,255,255,0.06)' }}
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: '12px', fontSize: '11px', color: '#cbd5e1' }}
                    formatter={(val) => [`Rp ${Number(val).toLocaleString()}`, '']}
                  />
                  <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} name="Uang Masuk (Debit)" />
                  <Line type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} dot={{ fill: '#f43f5e', r: 4 }} activeDot={{ r: 6 }} name="Uang Keluar (Kredit)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdown percentage targets list */}
          <div className="lg:col-span-1 space-y-5">
            
            {/* Income breakdown bar distribution */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5">
              <h4 className="text-[10px] font-black text-indigo-400 tracking-wider uppercase">SUMBER PENERIMAAN (REVENUE MIX)</h4>
              
              <div className="space-y-2.5">
                {incomeBreakdown.map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                        {item.icon} {item.name}
                      </div>
                      <span className="font-mono font-bold text-slate-500 dark:text-slate-400">{item.percent}%</span>
                    </div>
                    <div className="w-full bg-slate-900/40 h-1.5 rounded-full overflow-hidden border border-white/[0.02]">
                      <div className={cn("h-1.5 rounded-full", item.color)} style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expense breakdown distribution */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5">
              <h4 className="text-[10px] font-black text-red-400 tracking-wider uppercase font-sans">ALOKASI PENGELUARAN (BUDGET SPEND)</h4>
              
              <div className="space-y-2.5">
                {expenseBreakdown.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 font-sans">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                        {item.icon} {item.name}
                      </div>
                      <span className="font-mono font-bold text-slate-500 dark:text-slate-400">{item.percent}%</span>
                    </div>
                    <div className="w-full bg-slate-900/40 h-1.5 rounded-full overflow-hidden border border-white/[0.02]">
                      <div className={cn("h-1.5 rounded-full", item.color)} style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>
    );
  };

  // Render Section 4: Pocket Money/E-Wallet (Walisantri Only)
  const renderPocketMoney = () => (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Modul uang saku belum aktif</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">Saldo, batas belanja, status kartu, dan mutasi kantin belum terhubung ke ledger operasional. Data tidak ditampilkan sampai sumber transaksi resmi tersedia.</p>
          <p className="text-xs text-slate-500 mt-3">Top up dan pemblokiran kartu belum dapat diproses dari aplikasi ini.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12 relative">
      {financeToast && (
        <div className={cn(
          "fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 animate-in slide-in-from-top-3",
          financeToast.type === 'success' && "bg-emerald-950/90 border-emerald-500/40 text-emerald-200",
          financeToast.type === 'error' && "bg-rose-950/90 border-rose-500/40 text-rose-200",
          financeToast.type === 'info' && "bg-indigo-950/90 border-indigo-500/40 text-indigo-200"
        )}>
          {financeToast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
          {financeToast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {financeToast.type === 'info' && <ShieldAlert className="w-5 h-5 text-indigo-400 shrink-0" />}
          <span>{financeToast.message}</span>
        </div>
      )}
      
      {/* Main Title and Locked Indicator Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-indigo-500 pb-1 inline-block">
              Finance & Billing System
            </h1>
            {financeLocked && (
              <span className="bg-red-500/20 text-red-500 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3 h-3" /> Tutup Buku Aktif
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm mt-2">Pengendalian arus kas pesantren, bulk-billing SPP asrama, dan klaim bisyarah pengajar.</p>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-lg w-max mb-6 border border-slate-200 dark:border-white/5">
        {[
          { id: 'billing', label: role === 'Walisantri' ? 'Tagihan Anda & Kuitansi (SPP)' : 'Informasi Tagihan & SPP', icon: <CreditCard className="w-4 h-4" />, badge: role === 'Walisantri' ? billings.filter(b => b.status === 'Unpaid' && walisantriChildren.some(child => b.santriName.toLowerCase().includes(child.toLowerCase()))).length : billings.filter(b => b.status === 'Verification').length, visible: role !== 'Santri' },
          { id: 'pocket_money', label: role === 'Santri' ? 'Kartu Santri & Kantin' : 'E-Wallet Uang Saku & Kantin', icon: <Wallet className="w-4 h-4" />, badge: 0, visible: role === 'Walisantri' || role === 'Santri' },
          { id: 'expenses', label: role === 'Ustadz' ? 'Reimbursement & Operational Dana' : 'Reimbursement & Persetujuan Dana', icon: <Wallet className="w-4 h-4" />, badge: role === 'Ustadz' ? 0 : expenses.filter(e => e.status === 'Pending').length, visible: role !== 'Walisantri' && role !== 'Santri' },
          { id: 'reports', label: 'E-Leger Utama & Closing Kontrol', icon: <FileText className="w-4 h-4" />, badge: 0, visible: role !== 'Walisantri' && role !== 'Santri' },
        ].filter(t => t.visible).map(tab => (
          <button aria-pressed={activeTab === tab.id}
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as Tab);
              setSearchQuery('');
            }}
            className={`erp-tab-control flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id 
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/5"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ml-1",
                activeTab === tab.id ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300" : "bg-slate-200 dark:bg-black/50 text-slate-700 dark:text-slate-500"
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Primary Content Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden min-h-[600px] relative">
        {/* CONTROLS AREA WITH LOCAL SEARCH (PRE-TAB SPECIFIC) */}
        {activeTab !== 'reports' && (
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Cari ID transaksi, nama santri, perihal..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-colors"
                />
              </div>
              {searchQuery && (
                <button 
                  id="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                >
                  Reset
                </button>
              )}
            </div>

            {activeTab === 'billing' && (
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: 'Semua Tagihan' },
                  { id: 'spp', label: 'SPP Santri' },
                  { id: 'ppdb', label: 'PPDB / Calon Santri' },
                  { id: 'verification', label: 'Menunggu Verifikasi' },
                  { id: 'unpaid', label: 'Tertunggak' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setBillingCategoryFilter(cat.id as any)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                      billingCategoryFilter === cat.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Primary Screen Area Content */}
        <div className="p-6">
          {activeTab === 'billing' && renderBilling()}
          {activeTab === 'expenses' && renderExpenses()}
          {activeTab === 'reports' && renderReports()}
          {activeTab === 'pocket_money' && renderPocketMoney()}
        </div>

      </div>

      {/* 4. MODAL DETAILED SINGLE ENTRY FORM (ADD EXPENSE / SINGLE BILLING) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans select-none animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-700 dark:text-slate-200">
                {activeTab === 'billing' ? 'BUAT INVOICE TAGIHAN BARU (SINGLE)' : 'AJUKAN KLAIM REIMBURSEMENT / OPERASIONAL'}
              </h3>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 text-slate-400 hover:text-white rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleAddRecord} className="p-5 space-y-4 text-left">
              {activeTab === 'billing' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Sektor Rombel / Kelas</label>
                      <select 
                          value={formData.grade || uniqueClasses[0] || ''}
                          onChange={e => setFormData({...formData, grade: e.target.value, santriName: ''})}
                         className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                         {uniqueClasses.length > 0 ? uniqueClasses.map(c => (
                           <option key={c} value={c}>Kelas {c}</option>
                         )) : (
                           <option value="" disabled>Belum ada rombel pada tenant ini</option>
                         )}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Nama Lengkap Santri</label>
                      <select 
                        required 
                        value={formData.santriName || ''} 
                        onChange={e => setFormData({...formData, santriName: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="" disabled>Pilih Santri...</option>
                        {(dynamicStudentsByClass[formData.grade || uniqueClasses[0] || ''] || []).map((st: string) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Sektor Tagihan</label>
                    <select 
                        value={formData.type || STANDARD_BILLING_CATALOG[0].type} 
                        onChange={e => {
                          const selected = STANDARD_BILLING_CATALOG.find(i => i.type === e.target.value);
                          setFormData({...formData, type: e.target.value, amount: selected ? selected.amount : formData.amount});
                        }}
                       className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                       {STANDARD_BILLING_CATALOG.map(item => (
                         <option key={item.id} value={item.type}>{item.type}</option>
                       ))}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Target Periode</label>
                      <input 
                         type="text" required placeholder="Misal: November 2023"
                        value={formData.period || ''} 
                        onChange={e => setFormData({...formData, period: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Jumlah Tagihan (Rupiah)</label>
                      <input 
                         type="number" required min="10000" placeholder="1500000"
                        value={formData.amount || ''} 
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Mata Pengeluaran / Perihal</label>
                    <input 
                      type="text" required placeholder="Contoh: Belanja bahan masakan santri Mingguan"
                      value={formData.description || ''} 
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Kategori Alokasi</label>
                      <select 
                          value={formData.category || 'Operational'} 
                          onChange={e => setFormData({...formData, category: e.target.value})}
                         className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                         <option value="Operational">Operasional Asrama</option>
                         <option value="Catering">Konsumsi & Dapur</option>
                         <option value="Maintenance">Perbaikan Sarana</option>
                         <option value="Salary">Bisyarah & Honor</option>
                         <option value="Reimbursement">Reimbursement Lainnya</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Sektor/Departemen</label>
                      <select 
                          value={formData.department || 'Operasional Umum'} 
                          onChange={e => setFormData({...formData, department: e.target.value})}
                         className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                         <option value="Operasional Umum">Operasional Umum</option>
                         <option value="Sarana Prasarana">Sarana Prasarana</option>
                         <option value="Dapur Utama">Dapur Utama</option>
                         <option value="Kurikulum/Akademik">Kurikulum/Akademik</option>
                         <option value="Bina Santri">Bina Santri</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Nominal (Rupiah)</label>
                    <input 
                       type="number" required min="5000" placeholder="500000"
                      value={formData.amount || ''} 
                      onChange={e => setFormData({...formData, amount: e.target.value})}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}
              
              <div className="pt-4 flex justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-500/20 flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" /> {activeTab === 'billing' ? 'Terbitkan Tagihan' : 'Ajukan Klaim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GENERATE INVOICE PDF */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200 select-none">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-700 dark:text-slate-200">Kios Cetak Invoice PDF (Batch)</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsPdfModalOpen(false)} 
                className="p-1 text-slate-400 hover:text-white rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col md:flex-row gap-6 overflow-y-auto w-full">
              {/* Form Controls */}
              <div className="flex-1 space-y-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Cetak Untuk Rombel</label>
                  <select 
                     value={pdfCohort || (uniqueClasses[0] || 'VII - A')}
                     onChange={e => setPdfCohort(e.target.value)}
                     className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                     {uniqueClasses.length > 0 ? uniqueClasses.map(c => (
                       <option key={c} value={c}>Kelas {c}</option>
                     )) : (
                       <option value="" disabled>Belum ada rombel pada tenant ini</option>
                     )}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Bulan Tagihan</label>
                  <input 
                    type="text" required placeholder="Misal: Desember 2023"
                    value={pdfMonth}
                    onChange={e => setPdfMonth(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Tenggat Waktu Pembayaran (Due Date)</label>
                  <input 
                    type="text" required placeholder="Misal: 10 Desember 2023"
                    value={pdfDueDate}
                    onChange={e => setPdfDueDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsGeneratingPdf(true)}
                  disabled={!pdfMonth || !pdfDueDate}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Regenerate Preview
                </button>
              </div>

              {/* Preview Window */}
              <div className="flex-1 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[300px]">
                {isGeneratingPdf ? (
                  <div className="w-full h-full bg-white max-w-sm rounded-lg shadow-sm border border-slate-200 p-4 font-sans relative flex flex-col text-slate-800">
                    <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                      <h4 className="font-serif font-bold text-sm">PESANTREN INSAN CENDEKIA</h4>
                      <p className="text-[9px] text-slate-500 leading-tight mt-1">INVOICE SPP & BIAYA PENDIDIKAN</p>
                    </div>
                    
                    <div className="space-y-1 mb-4 text-[10px]">
                      <div className="flex justify-between"><span className="text-slate-500">Kelas:</span><span className="font-bold">{pdfCohort}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Bulan:</span><span className="font-bold">{pdfMonth}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Jatuh Tempo:</span><span className="font-bold text-red-600">{pdfDueDate}</span></div>
                    </div>

                    <div className="flex-1 border border-slate-200 rounded-md p-2">
                       <table className="w-full text-left text-[9px]">
                         <thead>
                           <tr className="border-b border-slate-200">
                             <th className="pb-1">Deskripsi</th>
                             <th className="pb-1 text-right">Jumlah</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                           <tr><td className="py-1">Biaya SPP (Syahriyah)</td><td className="py-1 text-right font-mono">Rp 1.500.000</td></tr>
                           <tr><td className="py-1">Uang Makan Asrama</td><td className="py-1 text-right font-mono">Rp 800.000</td></tr>
                           <tr><td className="py-1">Kegiatan Ekstrakurikuler</td><td className="py-1 text-right font-mono">Rp 200.000</td></tr>
                         </tbody>
                       </table>
                    </div>

                    <div className="mt-4 pt-2 border-t border-slate-300 flex justify-between items-center">
                      <span className="text-[10px] font-bold">TOTAL BAYAR</span>
                      <span className="text-sm font-black font-mono">Rp 2.500.000</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-400 dark:text-slate-500 space-y-2">
                    <FileText className="w-8 h-8 opacity-50 mx-auto" />
                    <p className="text-xs font-medium">Klik Regenerate Preview<br/>untuk melihat rendering PDF</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end gap-3 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => setIsPdfModalOpen(false)} 
                className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                Tutup
              </button>
              <button 
                type="button" 
                disabled={!isGeneratingPdf}
                onClick={() => {
                  showFinanceToast(`📥 Invoice SPP Batch PDF untuk kelas ${pdfCohort} bulan ${pdfMonth} berhasil diunduh!`, 'success');
                  setIsPdfModalOpen(false);
                  setIsGeneratingPdf(false);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF Master Terpusat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL BULK GENERATION FOR CLASS/COHORT */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200 select-none">
          <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/15 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-700 dark:text-slate-200">Automated Bulk Billing Release</h3>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  if (!isGeneratingBulk) setIsBulkModalOpen(false);
                }} 
                className="p-1 text-slate-400 hover:text-white rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isGeneratingBulk ? (
              <div className="p-8 text-center space-y-6">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10 border-t-indigo-500 animate-spin" />
                  <FileText className="w-8 h-8 text-indigo-400" />
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">Mass Invoice Rendering...</h4>
                  <p className="text-xs text-indigo-300 font-bold">{bulkStepMsg}</p>
                </div>

                <div className="w-full bg-slate-950 rounded-full h-2 max-w-xs mx-auto border border-white/[0.04]">
                  <div 
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${bulkProgress}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 font-mono font-bold block">{bulkProgress}% Selesai</span>
              </div>
            ) : (
              <div className="p-5 space-y-4 text-left">
                <div className="bg-indigo-950/20 border border-indigo-500/15 p-3 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[10.5px] text-indigo-300 leading-normal">
                    <strong>Informasi:</strong> Fitur ini menerbitkan kasier-billing massal bagi seluruh santri kelas yang dipilih secara serempak. No Invoice akan terjurnal berurutan.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Pilih Rombel / Cohort Kelas Target</label>
                  <select 
                     value={bulkClass || (uniqueClasses[0] || 'VII - A')}
                     onChange={e => setBulkClass(e.target.value)}
                     className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                     {uniqueClasses.length > 0 ? uniqueClasses.map(c => (
                       <option key={c} value={c}>Kelas {c}</option>
                     )) : (
                       <option value="" disabled>Belum ada rombel pada tenant ini</option>
                     )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Jenis Tagihan Massal</label>
                    <select 
                       value={bulkType}
                       onChange={e => {
                         setBulkType(e.target.value);
                         const selected = STANDARD_BILLING_CATALOG.find(i => i.type === e.target.value);
                         if (selected) {
                           setBulkAmount(selected.amount.toString());
                         }
                       }}
                       className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                       {STANDARD_BILLING_CATALOG.map(item => (
                         <option key={item.id} value={item.type}>{item.type}</option>
                       ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Periode Buku Tagihan</label>
                    <input 
                      type="text" required placeholder="Misal: Desember 2023"
                      value={bulkPeriod}
                      onChange={e => setBulkPeriod(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Besaran Tagihan per Murid (Rupiah)</label>
                  <input 
                    type="number" required placeholder="1500000"
                    value={bulkAmount}
                    onChange={e => setBulkAmount(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-2 text-right border-t border-slate-200 dark:border-slate-800 mt-5">
                  <button 
                    type="button" 
                    onClick={() => setIsBulkModalOpen(false)} 
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Batal
                  </button>
                  <button 
                    type="button" 
                    onClick={handleBulkGenerate}
                    className="bg-indigo-600 hover:bg-indigo-550 text-white font-black px-4.5 py-2 rounded-xl text-xs cursor-pointer shadow-lg shadow-indigo-650/10"
                  >
                    Mulai Bulk Generator Rilis
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. MODAL INTERACTIVE VIRTUAL PAYMENT MANDIRI (WALISANTRI PORTAL ONLY) */}
      {isPayModalOpen && selectedPayBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200 select-none">
          <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/15 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Kios Transfer Keuangan Syariah Mandiri
              </h3>
              <button 
                type="button" 
                onClick={() => {
                  setIsPayModalOpen(false);
                  setSelectedPayBill(null);
                  setPaymentProofFileName('');
                }} 
                className="p-1 text-slate-400 hover:text-white rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmManualPayment} className="p-5 space-y-4 text-left">
              <div className="bg-white dark:bg-slate-950 p-3 rounded-xl space-y-1 relative border border-slate-200 dark:border-slate-800">
                <span className="text-[9px] uppercase font-black text-slate-500">RINGKASAN TARGET PENAGIHAN:</span>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">{selectedPayBill.type}</p>
                <p className="text-xs text-indigo-300 font-bold">Santri: {selectedPayBill.santriName} ({selectedPayBill.grade})</p>
                
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-900 mt-2">
                  <span className="text-[10px] text-slate-400 font-mono font-bold">TOTAL PEMBAYARAN:</span>
                  <span className="text-base font-black text-emerald-400 font-mono">{formatCurrency(selectedPayBill.amount)}</span>
                </div>
              </div>

              {/* Payment Channel selector UI */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Pilih Bank Tujuan Transfer Manual</label>
                
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'BSI', name: 'BSI Syariah', dsc: 'BSI Maslahah/Transfer' },
                    { id: 'Muamalat', name: 'Muamalat', dsc: 'Muamalat VA' },
                    { id: 'MandiriSyariah', name: 'Mandiri-S', dsc: 'E-Mandiri VA' },
                  ].map(chan => (
                    <button
                      key={chan.id}
                      type="button"
                      onClick={() => setPayChannel(chan.id)}
                      className={cn(
                        "p-2 border rounded-xl text-left transition-all cursor-pointer font-sans h-auto flex flex-col justify-between",
                        payChannel === chan.id 
                          ? "bg-indigo-500/10 text-white border-indigo-500" 
                          : "bg-slate-50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                      )}
                    >
                      <span className="text-xs font-black text-slate-100">{chan.name}</span>
                      <span className="text-[9px] text-slate-500 mt-1">{chan.dsc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic generated VA screen */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1 font-mono">
<span className="text-[10px] uppercase font-bold text-slate-500 leading-none">PEMBAYARAN MANUAL</span>
                <p className="text-xs font-bold text-indigo-400 mt-1">Konfirmasi rekening tujuan melalui kanal resmi pesantren.</p>
                <p className="text-[9.5px] text-slate-500">Aplikasi belum terhubung ke virtual account atau payment gateway.</p>
              </div>

              {/* Secure Drag and Drop uploader simulator */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Unggah Rekaman Bukti Pembayaran (.PNG/.JPG/.PDF)</label>
                
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => paymentProofInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer leading-tight h-28",
                    isDragOver ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-600 dark:text-indigo-400" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700"
                  )}
                >
                  <Upload className="w-5 h-5 text-slate-400" />
                  {paymentProofFileName ? (
                    <div className="text-left">
                      <p className="text-xs font-mono font-bold text-emerald-400 text-center flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-emerald-400 inline" /> {paymentProofFileName}
                      </p>
                      <p className="text-[10px] text-slate-500 text-center mt-1">Klik untuk merubah file bukti transfer</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Drag & drop berkas bukti transfer Anda di sini</p>
                      <p className="text-[10px] text-slate-500 text-slate-400">Atau klik untuk memilih berkas dari perangkat Anda</p>
                    </>
                  )}
                </div>
              </div>

              <input ref={paymentProofInputRef} type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onClick={event => event.stopPropagation()} onChange={event => selectPaymentProofFile(event.currentTarget.files?.[0] || null)} />

              <div className="pt-4 flex justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800 mt-5">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsPayModalOpen(false);
                    setSelectedPayBill(null);
                    setPaymentProofFileName('');
                  }} 
                  className="px-4 py-2 text-xs font-bold text-slate-450 hover:text-white cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-600 hover:bg-emerald-555 text-white font-extrabold px-4.5 py-2 rounded-xl text-xs cursor-pointer shadow-lg shadow-emerald-900/10"
                >
                  Kirim & Konfirmasi Pembayaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL CONFLICT/REJECTION DESCRIPTION FEEDBACK FORM */}
      {rejectingItemType && rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-250 select-none">
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/20 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="font-extrabold text-xs uppercase tracking-widest text-red-600 dark:text-red-400 flex items-center gap-1.5 font-sans">
                <AlertTriangle className="w-4 h-4" /> REJECT & MINTA REVISI MUTASI
              </h3>
              <button 
                type="button" 
                onClick={() => {
                  setRejectingItemType(null);
                  setRejectingId(null);
                }} 
                className="p-1 text-slate-450 hover:text-white rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400 leading-normal font-sans">
                Berikan penjelasan perihal alasan administrasi menolak pembayaran atau pengajuan operasional {rejectingId}. Informasi ini akan diteruskan ke pengaju.
              </p>

              <div className="space-y-1 text-left">
                <label className="block text-[10px] uppercase font-bold text-slate-500">Narasi Alasan / Deskripsi Masalah</label>
                <textarea
                  value={rejectionInput}
                  onChange={e => setRejectionInput(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Bukti transfer tidak terbaca nominalnya / Saldo rekening bank tidak sesuai."
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl p-3 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 text-right">
                <button
                  onClick={() => {
                    setRejectingItemType(null);
                    setRejectingId(null);
                  }}
                  className="px-3.5 py-1.5 text-xs text-slate-400 cursor-pointer"
                >
                  Kembali
                </button>
                <button
                  onClick={handleConfirmRejection}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Konfirmasi Tolak Pengajuan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
