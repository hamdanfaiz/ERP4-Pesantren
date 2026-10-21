import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import { QRCodeCanvas } from 'qrcode.react';
import { Scanner } from '@yudiel/react-qr-scanner';
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, query, where, writeBatch } from 'firebase/firestore';

import { 
  Library, BookOpen, Clock, Users, BookMarked, BarChart2, 
  Search, Filter, Plus, BookUp, RefreshCcw, AlertTriangle, Download, 
  QrCode, CheckCircle2, ChevronRight, FileText, Smartphone, MoreVertical,
  Settings, Trash2, Printer, Edit3, X, Upload
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

type Tab = 'dashboard' | 'catalog' | 'circulation' | 'digital';

const borrowingTrends = [
  { month: 'Jan', physical: 420, digital: 150 },
  { month: 'Feb', physical: 450, digital: 180 },
  { month: 'Mar', physical: 510, digital: 220 },
  { month: 'Apr', physical: 480, digital: 250 },
  { month: 'May', physical: 550, digital: 290 },
  { month: 'Jun', physical: 600, digital: 340 },
];

const popularCategories = [
  { name: 'Islamic Studies', value: 45 },
  { name: 'Fiction', value: 25 },
  { name: 'Science', value: 15 },
  { name: 'History', value: 10 },
  { name: 'Others', value: 5 },
];

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#64748b'];

const initialCategories = ['Islamic Studies', 'Science', 'History', 'Computer Science', 'Fiction', 'Others'];

const initialCatalog = [
  { id: 'B001', title: 'Riyadhus Shalihin', author: 'Imam an-Nawawi', category: 'Islamic Studies', isbn: '978-602-123-456-7', totalCopies: 12, shelf: 'A-01' },
  { id: 'B002', title: 'Calculus Early Transcendentals', author: 'James Stewart', category: 'Science', isbn: '978-130-527-237-8', totalCopies: 2, shelf: 'C-12' },
  { id: 'B003', title: 'Sejarah Peradaban Islam', author: 'Dr. Badri Yatim', category: 'History', isbn: '978-979-421-337-1', totalCopies: 5, shelf: 'B-05' },
  { id: 'B004', title: 'Clean Code', author: 'Robert C. Martin', category: 'Computer Science', isbn: '978-013-235-088-4', totalCopies: 2, shelf: 'D-02' },
];

const mockCirculation = [
  { id: 'CIR-1001', student: 'Ahmad Rafiq', bookId: 'B004', bookTitle: 'Clean Code', borrowDate: '2024-06-01', dueDate: '2024-06-15', status: 'Active', fine: 0 },
  { id: 'CIR-1002', student: 'Budi Santoso', bookId: 'B002', bookTitle: 'Calculus Early Transcendentals', borrowDate: '2024-05-20', dueDate: '2024-06-03', status: 'Overdue', fine: 25000 },
  { id: 'CIR-1003', student: 'Fatimah Az-Zahra', bookId: 'B003', bookTitle: 'Sejarah Peradaban Islam', borrowDate: '2024-06-10', dueDate: '2024-06-24', status: 'Active', fine: 0 },
  { id: 'CIR-1004', student: 'Umar', bookId: 'B002', bookTitle: 'Calculus Early Transcendentals', borrowDate: '2024-06-10', dueDate: '2024-06-24', status: 'Active', fine: 0 },
];

const mockDigitalRefs: any[] = [
  { id: 'D001', title: 'Journal of Islamic Economics', format: 'PDF', size: '2.4 MB', downloads: 1240, type: 'Academic Journal' },
  { id: 'D002', title: 'Tafsir Ibnu Katsir Vol 1', format: 'EPUB', size: '15.1 MB', downloads: 3500, type: 'E-Book' },
  { id: 'D003', title: 'Interactive Periodic Table', format: 'HTML5', size: 'N/A', downloads: 850, type: 'Interactive Media' },
];

export function LibraryManager() {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [students, setStudents] = useState<any[]>([]);
  const [books, setBooks] = useState(initialCatalog);
  const [circulations, setCirculations] = useState(mockCirculation);
  const [masterCategories, setMasterCategories] = useState(initialCategories);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [circulationSearchQuery, setCirculationSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'catalog' | 'checkout-student' | 'checkout-book' | null>(null);
  const [viewQrBook, setViewQrBook] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [checkoutData, setCheckoutData] = useState({ student: '', bookId: '' });
  const [receiptData, setReceiptData] = useState<any>(null);
  const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '', author: '', category: 'Uncategorized', isbn: '', totalCopies: 1, shelf: ''
  });

  const [digitalAssets, setDigitalAssets] = useState(mockDigitalRefs);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [viewingAsset, setViewingAsset] = useState<any>(null);
  const [assetFormData, setAssetFormData] = useState<any>({
    title: '', format: 'PDF', size: '0 MB', type: 'E-Book', fileData: null
  });

  const canManageLibraryRecords = ['Admin', 'SuperAdmin', 'Ustadz'].includes(role) && user?.modulePermissions?.library !== false;
  const uniqueCategories = ['All', ...masterCategories, 'Uncategorized'];

  useEffect(() => {
    const canReadSantriList = ['Admin', 'SuperAdmin', 'Ustadz'].includes(role) && user?.modulePermissions?.library !== false;
    let unsubSantri: () => void = () => {};
    if (canReadSantriList) {
      const qSantri = tenantScopedQuery(collection(db, "entityRecords"), user?.tenantId, where("type", "==", "Santri"));
      unsubSantri = onSnapshot(qSantri, (snapshot) => {
        setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })));
      });
    } else {
      setStudents([]);
    }

    let isBooksSeeded = false;
    let isCircSeeded = false;

    const unsubBooks = onSnapshot(tenantScopedQuery(collection(db, 'library_books'), user?.tenantId), async (snapshot) => {
      if (!snapshot.empty) {
        setBooks(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as any)));
      } else if (!isBooksSeeded && canManageLibraryRecords) {
        isBooksSeeded = true;
        try {
          // Seed books
          for (const book of initialCatalog) {
            const scopedId = `${user?.tenantId || '__tenant_scope_unavailable__'}__${book.id}`;
            await setDoc(doc(db, 'library_books', scopedId), tenantRecord(user?.tenantId, { ...book, id: scopedId }));
          }
        } catch(e) {}
      }
    });

    const unsubCirc = canManageLibraryRecords ? onSnapshot(tenantScopedQuery(collection(db, 'library_circulations'), user?.tenantId), async (snapshot) => {
      if (!snapshot.empty) {
        setCirculations(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as any)));
      } else if (!isCircSeeded && canManageLibraryRecords) {
        isCircSeeded = true;
        try {
          for (const circ of mockCirculation) {
            const scopedId = `${user?.tenantId || '__tenant_scope_unavailable__'}__${circ.id}`;
            const scopedBookId = circ.bookId ? `${user?.tenantId || '__tenant_scope_unavailable__'}__${circ.bookId}` : '';
            await setDoc(doc(db, 'library_circulations', scopedId), tenantRecord(user?.tenantId, { ...circ, id: scopedId, bookId: scopedBookId }));
          }
        } catch(e) {}
      }
    }) : (() => { setCirculations([]); return () => {}; })();
    
    let isAssetsSeeded = false;
    const unsubAssets = onSnapshot(tenantScopedQuery(collection(db, 'library_digital_assets'), user?.tenantId), async (snapshot) => {
      if (!snapshot.empty) {
        setDigitalAssets(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as any)));
      } else if (!isAssetsSeeded && canManageLibraryRecords) {
        isAssetsSeeded = true;
        try {
          for (const asset of mockDigitalRefs) {
            const scopedId = `${user?.tenantId || '__tenant_scope_unavailable__'}__${asset.id}`;
            await setDoc(doc(db, 'library_digital_assets', scopedId), tenantRecord(user?.tenantId, { ...asset, id: scopedId }));
          }
        } catch(e) {}
      }
    });
    
    return () => {
      unsubBooks();
      unsubCirc();
      unsubAssets();
    };
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.library, user?.linkedSantriId]);


  const handleViewAsset = async (asset: any) => {
    setViewingAsset(asset);
    try {
      const updated = { ...asset, downloads: (asset.downloads || 0) + 1 };
      setDigitalAssets(digitalAssets.map(a => a.id === asset.id ? updated : a));
      await setDoc(doc(db, 'library_digital_assets', asset.id), tenantRecord(user?.tenantId, updated), { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAssetModal = (asset?: any) => {
    if (asset) {
      setEditingAsset(asset);
      setAssetFormData({
        title: asset.title, format: asset.format, size: asset.size, type: asset.type
      });
    } else {
      setEditingAsset(null);
      setAssetFormData({
        title: '', format: 'PDF', size: '0 MB', type: 'E-Book'
      });
    }
    setIsAssetModalOpen(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAsset) {
        const updated = { ...editingAsset, ...assetFormData };
        setDigitalAssets(digitalAssets.map(a => a.id === editingAsset.id ? updated : a));
        await setDoc(doc(db, 'library_digital_assets', editingAsset.id), tenantRecord(user?.tenantId, updated), { merge: true });
      } else {
        const newAssetId = `${user?.tenantId || '__tenant_scope_unavailable__'}__D${String(digitalAssets.length + 1).padStart(3, '0')}`;
        const newAsset = {
          id: newAssetId,
          ...assetFormData,
          downloads: 0
        };
        setDigitalAssets([...digitalAssets, newAsset]);
        await setDoc(doc(db, 'library_digital_assets', newAssetId), tenantRecord(user?.tenantId, newAsset));
      }
      setIsAssetModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this asset?')) {
      setDigitalAssets(digitalAssets.filter(a => a.id !== id));
      try {
        await deleteDoc(doc(db, 'library_digital_assets', id));
      } catch(e) {}
    }
  };

  const handleOpenModal = (book?: any) => {
    if (book) {
      setEditingBook(book);
      setFormData({
        title: book.title, author: book.author, category: book.category, 
        isbn: book.isbn, totalCopies: book.totalCopies, shelf: book.shelf
      });
    } else {
      setEditingBook(null);
      setFormData({
        title: '', author: '', category: 'Uncategorized', isbn: '', totalCopies: 1, shelf: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBook) {
        const updated = { ...editingBook, ...formData };
        setBooks(books.map(b => b.id === editingBook.id ? updated : b));
        await setDoc(doc(db, 'library_books', editingBook.id), tenantRecord(user?.tenantId, formData), { merge: true });
      } else {
        const newBookId = `${user?.tenantId || '__tenant_scope_unavailable__'}__B${String(books.length + 1).padStart(3, '0')}`;
        const newBook = {
          id: newBookId,
          ...formData
        };
        setBooks([...books, newBook]);
        await setDoc(doc(db, 'library_books', newBookId), tenantRecord(user?.tenantId, formData));
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBook = async (id: string) => {
    setBooks(books.filter(b => b.id !== id));
    try {
      await deleteDoc(doc(db, 'library_books', id));
    } catch(e) {}
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategoryName.trim() && !masterCategories.includes(newCategoryName.trim())) {
      setMasterCategories([...masterCategories, newCategoryName.trim()]);
      setNewCategoryName('');
    }
  };

  const handleDeleteCategory = (category: string) => {
    setMasterCategories(masterCategories.filter(c => c !== category));
    if (categoryFilter === category) setCategoryFilter('All');
  };
  const handleReturnBook = async (id: string) => {
    const target = circulations.find(c => c.id === id);
    if (target) {
      setCirculations(circulations.map(c => c.id === id ? { ...c, status: 'Returned', fine: 0 } : c));
      try {
        await setDoc(doc(db, 'library_circulations', id), tenantRecord(user?.tenantId, { ...target, status: 'Returned', fine: 0 }), { merge: true });
      } catch (e) {}
    }
  };

  const handlePayFine = async (id: string) => {
    const target = circulations.find((item) => item.id === id);
    if (!target || Number(target.fine) <= 0) return;
    if (!user?.tenantId || !user.uid || !['Admin', 'SuperAdmin'].includes(role) || user.modulePermissions?.finance === false) {
      alert('Pembayaran denda harus dicatat oleh Admin yang memiliki akses modul Keuangan.');
      return;
    }

    const financeId = `LIB-FINE-${encodeURIComponent(user.tenantId)}-${encodeURIComponent(id)}`;
    const paidAt = new Date().toISOString();
    const billRef = doc(db, 'financeBillings', financeId);
    const ledgerRef = doc(db, 'financeTransactions', financeId);
    const circulationRef = doc(db, 'library_circulations', id);
    const batch = writeBatch(db);
    batch.update(circulationRef, tenantRecord(user.tenantId, { ...target, fine: 0, finePaidAt: paidAt, financeBillingId: financeId }));
    batch.set(billRef, tenantRecord(user.tenantId, {
      id: financeId, type: 'Denda Perpustakaan', period: paidAt.slice(0, 10),
      santriName: target.student, amount: Number(target.fine), paidAmount: Number(target.fine),
      status: 'Paid', paymentMethod: 'Perpustakaan', createdAt: paidAt, paidAt, createdByUid: user.uid,
    }));
    batch.set(ledgerRef, tenantRecord(user.tenantId, {
      id: financeId, type: 'income', sourceType: 'billing', sourceId: financeId,
      description: `Pembayaran denda perpustakaan: ${target.bookTitle} (${target.student})`,
      amount: Number(target.fine), paymentMethod: 'Perpustakaan', createdByUid: user.uid, createdAt: paidAt,
    }));

    try {
      await batch.commit();
      setCirculations((current) => current.map((item) => item.id === id ? { ...item, fine: 0, finePaidAt: paidAt, financeBillingId: financeId } : item));
    } catch (error) {
      console.error('Gagal mencatat denda perpustakaan ke buku keuangan tenant:', error);
      alert('Denda belum ditandai lunas. Pastikan buku keuangan terbuka dan akun memiliki izin Keuangan.');
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    const book = books.find(b => b.id === checkoutData.bookId || b.isbn === checkoutData.bookId);
    if (!book) {
      alert('Book not found!');
      return;
    }
    const activeBorrows = circulations.filter(c => c.bookId === book.id && (c.status === 'Active' || c.status === 'Overdue')).length;
    if (book.totalCopies - activeBorrows <= 0) {
      alert('Book is out of stock!');
      return;
    }
    const newId = `${user?.tenantId || '__tenant_scope_unavailable__'}__CIR-${1000 + circulations.length + 1}`;
    const newCirc = {
      id: newId,
      student: checkoutData.student,
      bookId: book.id,
      bookTitle: book.title,
      borrowDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Active',
      fine: 0
    };
    setCirculations([...circulations, newCirc]);
    setIsCheckoutModalOpen(false);
    setCheckoutData({ student: '', bookId: '' });
    setReceiptData(newCirc);
    
    try {
      await setDoc(doc(db, 'library_circulations', newId), tenantRecord(user?.tenantId, newCirc));
    } catch(err) {}
  };

  const handleDownloadQR = (id: string, title: string) => {
    const canvas = document.getElementById(`qr-${id}`) as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR-${id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Compute available stock
  const getBookStatus = (bookId: string, totalCopies: number) => {
    const activeBorrows = circulations.filter(c => c.bookId === bookId && (c.status === 'Active' || c.status === 'Overdue')).length;
    const available = totalCopies - activeBorrows;
    return {
      availableCopies: available,
      status: available > 0 ? 'Available' : 'Borrowed'
    };
  };

  const filteredBooks = books.filter(book => {
    const matchesSearch = 
      (book.title || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (book.author || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      book.isbn.includes(searchQuery);
    const matchesCategory = categoryFilter === 'All' || book.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Total Collections', value: '15,240', icon: BookMarked, color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-500/20', trend: 'Physical & Digital' },
          { title: 'Active Borrowers', value: '842', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20', trend: '+15% this month' },
          { title: 'Currently Borrowed', value: '1,120', icon: BookUp, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20', trend: 'Items out' },
          { title: 'Overdue Items', value: '45', icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-500/20', trend: 'Needs attention' }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <p className="text-slate-500 text-sm font-medium">{stat.title}</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">{stat.value}</h3>
            <p className="text-xs text-slate-400 mt-2">{stat.trend}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-indigo-500" /> Borrowing & Access Trends
              </h3>
              <div className="flex gap-4 text-xs font-medium text-slate-500">
                 <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500"></span> Physical Books</div>
                 <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500"></span> Digital Access</div>
              </div>
           </div>
           <div className="h-72">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={borrowingTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <defs>
                    <linearGradient id="colorPhysical" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDigital" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                 <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                 <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                 <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                 <Area type="monotone" dataKey="physical" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorPhysical)" />
                 <Area type="monotone" dataKey="digital" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorDigital)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
         </div>
         
         <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
             <Library className="w-5 h-5 text-emerald-500" /> Popular Categories
           </h3>
           <p className="text-xs text-slate-500 mb-4">Distribution of borrowed items by genre</p>
           <div className="flex-1 min-h-[200px]">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={popularCategories}
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={5}
                   dataKey="value"
                 >
                   {popularCategories.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                   ))}
                 </Pie>
                 <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
               </PieChart>
             </ResponsiveContainer>
           </div>
           <div className="grid grid-cols-2 gap-2 mt-4">
              {popularCategories.map((cat, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                   <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                   <span className="text-slate-600 dark:text-slate-400">{cat.name}</span>
                </div>
              ))}
           </div>
         </div>
      </div>
    </div>
  );

  const renderCatalog = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
         <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search books by title, author, or ISBN..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200"
            />
         </div>
         <div className="flex gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button 
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors border border-slate-200 dark:border-slate-700"
            >
               <Settings className="w-4 h-4" /> Categories
            </button>
            <button 
              onClick={() => setScannerMode('catalog')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors border border-slate-200 dark:border-slate-700"
            >
               <QrCode className="w-4 h-4" /> Scan QR
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
               <Plus className="w-4 h-4" /> Add Book
            </button>
         </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">Title & Author</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold text-center">Barcode/ID</th>
                  <th className="px-6 py-4 font-semibold">Location</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBooks.map((book) => {
                  const { availableCopies, status } = getBookStatus(book.id, book.totalCopies);
                  return (
                    <tr key={book.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                       <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                             <div className="w-10 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800/50">
                               <BookOpen className="w-5 h-5 text-indigo-500" />
                             </div>
                             <div>
                               <p className="font-bold text-slate-800 dark:text-slate-200">{book.title}</p>
                               <p className="text-slate-500 text-xs mt-0.5">{book.author}</p>
                             </div>
                          </div>
                       </td>
                       <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-xs font-medium">
                            {book.category}
                          </span>
                       </td>
                       <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <QrCode className="w-6 h-6 text-slate-400" />
                            <span className="text-[10px] font-mono text-slate-500">{book.id}</span>
                            <span className="text-[10px] text-slate-400">ISBN: {book.isbn}</span>
                          </div>
                       </td>
                       <td className="px-6 py-4 text-slate-600 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                         Shelf {book.shelf}
                       </td>
                       <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              status === 'Available' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                            )}>
                              {status}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">{availableCopies} / {book.totalCopies} available</span>
                          </div>
                       </td>
                       <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setViewQrBook(book)}
                              className="text-slate-600 hover:text-slate-700 dark:text-slate-400 font-medium text-xs px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 transition-colors"
                            >
                              QR
                            </button>
                            <button 
                              onClick={() => handleOpenModal(book)}
                              className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium text-xs px-3 py-1.5 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 transition-colors"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDeleteBook(book.id)}
                              className="text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium text-xs px-3 py-1.5 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 transition-colors"
                            >
                              Delete
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
    </div>
  );

  const filteredCirculations = circulations.filter(c => 
    (c.student || "").toLowerCase().includes(circulationSearchQuery.toLowerCase()) || 
    (c.bookTitle || "").toLowerCase().includes(circulationSearchQuery.toLowerCase()) ||
    (c.id || "").toLowerCase().includes(circulationSearchQuery.toLowerCase())
  );

  const renderCirculation = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-1 space-y-6 print:hidden">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
               <QrCode className="absolute -right-4 -bottom-4 w-32 h-32 text-indigo-500/20" />
               <h3 className="font-bold text-xl mb-2 relative z-10">Smart Check-out</h3>
               <p className="text-indigo-200 text-sm mb-6 relative z-10">Scan student ID card and book RFID tag to automatically process borrowing.</p>
               <button 
                 onClick={() => setIsCheckoutModalOpen(true)}
                 className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 backdrop-blur-md transition-colors relative z-10"
               >
                 <QrCode className="w-5 h-5" /> Start Scanning
               </button>
            </div>
            
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
               <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
                 <AlertTriangle className="w-5 h-5 text-rose-500" /> Overdue Fines Summary
               </h4>
               <div className="flex items-end gap-2 mb-2">
                 <h2 className="text-3xl font-black text-slate-800 dark:text-slate-200">Rp {circulations.reduce((sum, c) => sum + (c.fine || 0), 0).toLocaleString()}</h2>
               </div>
               <p className="text-slate-500 text-sm mb-6">Total outstanding fines from overdue items across all library patrons.</p>
               <button onClick={() => setIsFinesModalOpen(true)} className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium py-2 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
                 Manage Fines
               </button>
            </div>
         </div>
         
         <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col print:shadow-none print:border-none print:col-span-3">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center print:bg-transparent print:border-b-2 print:border-slate-800">
               <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                 <RefreshCcw className="w-5 h-5 text-emerald-500 print:text-black" /> Active Circulation
               </h3>
               <div className="flex items-center gap-2">
                 <button onClick={() => window.print()} className="print:hidden flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                   <Download className="w-4 h-4" /> Print Report
                 </button>
                 <div className="relative w-64 print:hidden">
                   <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input 
                     type="text" 
                     value={circulationSearchQuery}
                     onChange={(e) => setCirculationSearchQuery(e.target.value)}
                     placeholder="Search ID, Student, or Book" 
                     className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                   />
                 </div>
               </div>
            </div>
            <div className="overflow-x-auto flex-1">
               <table className="w-full text-sm text-left">
                 <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                   <tr>
                     <th className="px-4 py-3 font-semibold">Borrower</th>
                     <th className="px-4 py-3 font-semibold">Item Details</th>
                     <th className="px-4 py-3 font-semibold text-center">Due Date</th>
                     <th className="px-4 py-3 font-semibold text-center">Status</th>
                     <th className="px-4 py-3 font-semibold text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                   {filteredCirculations.map((cir, i) => (
                     <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3">
                           <div className="font-bold text-slate-800 dark:text-slate-200">{cir.student}</div>
                           <div className="text-xs text-slate-500 font-mono mt-0.5">{cir.id}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">
                           {cir.bookTitle}
                        </td>
                        <td className="px-4 py-3 text-center">
                           <div className={cn(
                             "font-bold text-xs",
                             cir.status === 'Overdue' ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"
                           )}>{cir.dueDate}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                           <div className="flex flex-col items-center gap-1">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                cir.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 
                                cir.status === 'Returned' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30'
                              )}>
                                {cir.status}
                              </span>
                              {(cir.fine || 0) > 0 && <span className="text-[10px] font-bold text-rose-500">Fine: Rp {cir.fine.toLocaleString()}</span>}
                           </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                           {cir.status !== 'Returned' && (
                             <div className="flex justify-end gap-2">
                               <button 
                                 onClick={() => setReceiptData(cir)}
                                 className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                               >
                                 <Printer className="w-3 h-3" /> Print
                               </button>
                               <button 
                                 onClick={() => handleReturnBook(cir.id)}
                                 className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-medium px-3 py-1.5 rounded transition-colors"
                               >
                                 Return
                               </button>
                             </div>
                           )}
                        </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
         </div>
      </div>
    </div>
  );

  const renderDigitalRefs = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>
         <div className="z-10 max-w-2xl text-center md:text-left">
           <Smartphone className="w-12 h-12 text-blue-200 mb-4 mx-auto md:mx-0" />
           <h2 className="text-3xl font-black mb-2 flex items-center justify-center md:justify-start gap-3">
             <span className="bg-white/20 text-blue-50 px-3 py-1 rounded-full text-sm font-bold uppercase tracking-widest backdrop-blur-sm border border-white/20">Digital Lib</span>
             E-Library Portal
           </h2>
           <p className="text-blue-100 text-sm leading-relaxed mb-6">
             Manage and distribute thousands of digital journals, e-books, and scholarly references directly to student devices. Integrated with secure document viewers to prevent unauthorized downloads.
           </p>
           <button onClick={() => handleOpenAssetModal()} className="bg-white text-indigo-700 font-bold px-6 py-2.5 rounded-lg shadow-lg hover:bg-blue-50 transition-colors flex items-center gap-2 mx-auto md:mx-0">
             <Plus className="w-5 h-5" /> Upload Digital Asset
           </button>
         </div>
         <div className="z-10 grid grid-cols-2 gap-4 w-full md:w-auto">
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 p-4 rounded-xl text-center">
               <div className="text-2xl font-black mb-1">{digitalAssets.length}</div>
               <div className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Digital Items</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 p-4 rounded-xl text-center">
               <div className="text-2xl font-black mb-1">
                 {digitalAssets.reduce((sum, asset) => sum + (asset.downloads || 0), 0).toLocaleString()}
               </div>
               <div className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Total Downloads</div>
            </div>
         </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {digitalAssets.map((doc, i) => (
           <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm group hover:border-indigo-500/50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                 <div className={cn(
                   "w-12 h-12 rounded-lg flex items-center justify-center shrink-0 shadow-inner overflow-hidden relative",
                   !doc.fileData && (doc.format === 'PDF' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-500' :
                   doc.format === 'EPUB' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500' :
                   'bg-amber-100 dark:bg-amber-900/30 text-amber-500')
                 )}>
                   {doc.fileData && doc.fileData.startsWith('data:image') ? (
                     <img src={doc.fileData} className="w-full h-full object-cover" alt="Thumbnail" />
                   ) : (
                     doc.format === 'PDF' ? <FileText className="w-6 h-6" /> : 
                     doc.format === 'EPUB' ? <BookOpen className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />
                   )}
                 </div>
                 <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                   {(doc.downloads || 0).toLocaleString()} accesses
                 </span>
              </div>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1 leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {doc.title}
              </h4>
              <p className="text-xs text-slate-500 mb-4">{doc.type} • {doc.size}</p>
              <div className="flex gap-2">
                 <button onClick={() => handleViewAsset(doc)} className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium py-2 rounded-lg text-sm transition-colors border border-slate-200 dark:border-slate-700 flex justify-center items-center gap-2">
                   View
                 </button>
                 <button onClick={() => handleOpenAssetModal(doc)} className="w-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
                   <Edit3 className="w-4 h-4" />
                 </button>
                 <button onClick={() => handleDeleteAsset(doc.id)} className="w-10 flex items-center justify-center bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-800 transition-colors">
                   <Trash2 className="w-4 h-4" />
                 </button>
              </div>
           </div>
         ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Library className="w-8 h-8 text-emerald-600" />
            Library & E-References
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Manage library catalogs, book circulation, and diverse digital references globally.
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto w-full md:w-auto hide-scrollbar print:hidden">
          {(['dashboard', 'catalog', 'circulation', 'digital'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap",
                activeTab === tab 
                  ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              {tab === 'digital' ? 'Digital Lib' : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
         {activeTab === 'dashboard' && renderDashboard()}
         {activeTab === 'catalog' && renderCatalog()}
         {activeTab === 'circulation' && renderCirculation()}
         {activeTab === 'digital' && renderDigitalRefs()}
      </div>

      {/* Book CRUD Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                {editingBook ? 'Edit Book' : 'Add New Book'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveBook} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                <input 
                  type="text" 
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Author</label>
                <input 
                  type="text" 
                  required
                  value={formData.author}
                  onChange={e => setFormData({ ...formData, author: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select 
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="Uncategorized">Uncategorized</option>
                    {masterCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ISBN</label>
                  <input 
                    type="text" 
                    value={formData.isbn}
                    onChange={e => setFormData({ ...formData, isbn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Total Copies</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={formData.totalCopies}
                    onChange={e => setFormData({ ...formData, totalCopies: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Shelf Location</label>
                  <input 
                    type="text" 
                    required
                    value={formData.shelf}
                    onChange={e => setFormData({ ...formData, shelf: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                >
                  {editingBook ? 'Save Changes' : 'Add Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Settings Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                Category Settings
              </h2>
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name..."
                  className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                />
                <button 
                  type="submit"
                  disabled={!newCategoryName.trim() || masterCategories.includes(newCategoryName.trim())}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </form>
              
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {masterCategories.map(cat => (
                  <div key={cat} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{cat}</span>
                    <button 
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {masterCategories.length === 0 && (
                  <div className="text-center py-4 text-slate-500">No categories found.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {scannerMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                {scannerMode === 'checkout-book' ? 'Scan Book for Checkout' : 'Scan Book QR'}
              </h2>
              <button 
                onClick={() => {
                  if (scannerMode === 'checkout-book') {
                    setIsCheckoutModalOpen(true);
                  }
                  setScannerMode(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-6">
              <div className="w-full aspect-square bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden relative">
                <Scanner
                  onScan={(result) => {
                    if (result && result.length > 0) {
                      const text = result[0].rawValue;
                      if (scannerMode === 'catalog') {
                        setSearchQuery(text);
                        setScannerMode(null);
                      } else if (scannerMode === 'checkout-book') {
                        setCheckoutData({ ...checkoutData, bookId: text });
                        setScannerMode(null);
                        setIsCheckoutModalOpen(true);
                      }
                    }
                  }}
                />
              </div>
              <p className="text-center text-sm text-slate-500 mt-4">Point your camera at the QR Code</p>
            </div>
          </div>
        </div>
      )}

      {/* View/Download QR Modal */}
      {viewQrBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-xs overflow-hidden flex flex-col items-center p-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Book ID QR Code</h2>
            <p className="text-sm text-slate-500 mb-6 text-center">{viewQrBook.title}</p>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6">
              <QRCodeCanvas 
                id={`qr-${viewQrBook.id}`}
                value={viewQrBook.id} 
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>
            
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setViewQrBook(null)}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => handleDownloadQR(viewQrBook.id, viewQrBook.title)}
                className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Checkout Modal */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                Smart Check-out
              </h2>
              <button 
                onClick={() => setIsCheckoutModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleCheckout} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Student</label>
                <select 
                  required
                  value={checkoutData.student}
                  onChange={e => setCheckoutData({ ...checkoutData, student: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="">Select a student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.name}>{s.id} - {s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Book ID / ISBN</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    required
                    value={checkoutData.bookId}
                    onChange={e => setCheckoutData({ ...checkoutData, bookId: e.target.value })}
                    placeholder="Enter Book ID or ISBN"
                    className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 dark:text-slate-200"
                  />
                  <button 
                    type="button"
                    onClick={() => { setScannerMode('checkout-book'); setIsCheckoutModalOpen(false); }}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <QrCode className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
                >
                  Process Checkout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      
      {/* Asset Viewer Modal */}
      {viewingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  {viewingAsset.format === 'PDF' ? <FileText className="w-5 h-5" /> : 
                   viewingAsset.format === 'EPUB' ? <BookOpen className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 dark:text-slate-200">{viewingAsset.title}</h2>
                  <p className="text-xs text-slate-500">{viewingAsset.format} • {viewingAsset.size}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingAsset(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 flex items-center justify-center relative overflow-hidden">
               {viewingAsset.fileData ? (
                   viewingAsset.fileData.startsWith('data:image') ? (
                     <div className="w-full h-full flex items-center justify-center p-8 bg-black/5">
                        <img src={viewingAsset.fileData} className="max-w-full max-h-full object-contain drop-shadow-md" alt={viewingAsset.title} />
                     </div>
                   ) : (
                     <iframe src={viewingAsset.fileData} className="w-full h-full border-0 bg-white" title={viewingAsset.title} />
                   )
               ) : (
                 <div className="text-center p-8 max-w-md">
                   <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto mb-6">
                      {viewingAsset.format === 'PDF' ? <FileText className="w-10 h-10 text-rose-500" /> : 
                       viewingAsset.format === 'EPUB' ? <BookOpen className="w-10 h-10 text-emerald-500" /> : <Smartphone className="w-10 h-10 text-amber-500" />}
                   </div>
                   <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Secure Viewer Ready</h3>
                   <p className="text-slate-500 text-sm mb-6">
                     No file content available for preview. Upload a document to view it here.
                   </p>
                   <button onClick={() => setViewingAsset(null)} className="bg-indigo-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors">
                     Close Viewer
                   </button>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Asset Modal */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                {editingAsset ? 'Edit Digital Asset' : 'Upload Digital Asset'}
              </h2>
              <button 
                onClick={() => setIsAssetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveAsset} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                <input 
                  type="text" 
                  value={assetFormData.title}
                  onChange={(e) => setAssetFormData({...assetFormData, title: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Format</label>
                  <select 
                    value={assetFormData.format}
                    onChange={(e) => setAssetFormData({...assetFormData, format: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option>PDF</option>
                    <option>EPUB</option>
                    <option>HTML5</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                  <input 
                    type="text" 
                    value={assetFormData.type}
                    onChange={(e) => setAssetFormData({...assetFormData, type: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">File Size</label>
                <input 
                  type="text" 
                  value={assetFormData.size}
                  onChange={(e) => setAssetFormData({...assetFormData, size: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. 2.4 MB"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Upload File</label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative">
                  <Upload className="w-6 h-6 text-slate-400 mb-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-indigo-600 font-medium">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PDF, EPUB up to 50MB</p>
                  <input type="file" accept=".pdf,.epub,image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => {
                      if(e.target.files && e.target.files[0]) {
                         const file = e.target.files[0];
                         const reader = new FileReader();
                         reader.onloadend = () => {
                           setAssetFormData({...assetFormData, size: (file.size / (1024*1024)).toFixed(2) + ' MB', fileData: reader.result});
                         };
                         reader.readAsDataURL(file);
                      }
                  }} />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAssetModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fines Modal */}
      {isFinesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" /> Manage Fines
              </h2>
              <button 
                onClick={() => setIsFinesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
              <table className="w-full text-sm text-left">
                 <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 sticky top-0">
                   <tr>
                     <th className="px-6 py-4 font-semibold">Student</th>
                     <th className="px-6 py-4 font-semibold">Book</th>
                     <th className="px-6 py-4 font-semibold text-right">Fine Amount</th>
                     <th className="px-6 py-4 font-semibold text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                   {circulations.filter(c => c.fine > 0).length === 0 ? (
                     <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No active fines.</td></tr>
                   ) : circulations.filter(c => c.fine > 0).map((cir, i) => (
                     <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{cir.student}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">{cir.bookTitle}</td>
                        <td className="px-6 py-4 text-right font-bold text-rose-500">Rp {cir.fine.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                           <button 
                             onClick={() => handlePayFine(cir.id)}
                             className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-medium px-3 py-1.5 rounded transition-colors"
                           >
                             Mark Paid
                           </button>
                        </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm print:bg-white print:p-0 print:block">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col print:border-none print:shadow-none print:rounded-none">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800 shrink-0 print:hidden">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-500" /> Loan Receipt
              </h2>
              <button 
                onClick={() => setReceiptData(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-8 text-center print:pt-4">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 print:hidden">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-1">Library Receipt</h3>
              <p className="text-slate-500 text-sm mb-8">Keep this receipt for your records.</p>
              
              <div className="text-left space-y-4 mb-8">
                <div className="border-b border-dashed border-slate-200 dark:border-slate-700 pb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Borrower</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{receiptData.student}</p>
                </div>
                <div className="border-b border-dashed border-slate-200 dark:border-slate-700 pb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Item Title</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{receiptData.bookTitle}</p>
                  <p className="text-sm text-slate-500 font-mono mt-1">{receiptData.bookId}</p>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Borrow Date</p>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{receiptData.borrowDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Due Date</p>
                    <p className="font-bold text-rose-600 dark:text-rose-400">{receiptData.dueDate}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center mb-6">
                <QRCodeCanvas 
                  value={receiptData.id} 
                  size={120}
                  level="L"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-slate-400 font-mono mb-6">{receiptData.id}</p>
              
              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 print:hidden">
                <button 
                  onClick={() => window.print()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
                >
                  <Printer className="w-5 h-5" /> Print Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

