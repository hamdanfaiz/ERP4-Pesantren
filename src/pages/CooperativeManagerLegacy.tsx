import React, { useState, useEffect } from 'react';
import { Store, ShoppingCart, Package, Users, Wallet, Plus, Search, Filter, CreditCard, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Trash2, X, Truck, Phone, Building2, History, Receipt, ScanLine, Shield, AlertTriangle, BarChart3, TrendingUp, TrendingDown, DollarSign, Upload, Calendar } from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Scanner } from '@yudiel/react-qr-scanner';

const WALLETS = [
  { id: 'W-001', student: 'Ahmad Muzakki', grade: 'VII-A', balance: 150000, limit: 50000, lastTransaction: '2023-11-20 10:15', status: 'Active' },
  { id: 'W-002', student: 'Budi Santoso', grade: 'VII-A', balance: 25000, limit: 50000, lastTransaction: '2023-11-20 12:30', status: 'Warning' },
  { id: 'W-003', student: 'Syamil Al-Farizi', grade: 'VIII-B', balance: 350000, limit: 100000, lastTransaction: '2023-11-19 14:00', status: 'Active' }
];

const INVENTORY = [
  { id: 'ITM-01', name: 'Buku Tulis Sidu 58', category: 'Alat Tulis', stock: 120, costPrice: 3500, price: 4500, reorderPoint: 50 },
  { id: 'ITM-02', name: 'Pulpen Faster', category: 'Alat Tulis', stock: 45, costPrice: 2000, price: 3000, reorderPoint: 50 },
  { id: 'ITM-03', name: 'Seragam Pramuka (L)', category: 'Seragam', stock: 12, costPrice: 120000, price: 150000, reorderPoint: 15 },
  { id: 'ITM-04', name: 'Susu UHT Coklat 250ml', category: 'Kantin', stock: 24, costPrice: 4000, price: 5000, reorderPoint: 30, expiryDate: '2026-06-10' },
  { id: 'ITM-05', name: 'Roti Bakar Bandung', category: 'Kantin', stock: 15, costPrice: 5000, price: 8000, reorderPoint: 20, expiryDate: '2026-06-08' },
  { id: 'ITM-06', name: 'Air Mineral 600ml', category: 'Kantin', stock: 50, costPrice: 2000, price: 3000, reorderPoint: 20, expiryDate: '2026-12-31' }
];

const MOCK_SUPPLIERS = [
  { id: 'SUP-001', name: 'CV. Berkah Pangan', category: 'Kantin', contact: '081234567890', pic: 'Bpk. Ahmad', status: 'Active' },
  { id: 'SUP-002', name: 'Toko Seragam Mulia', category: 'Seragam', contact: '085678901234', pic: 'Ibu Siti', status: 'Active' },
  { id: 'SUP-003', name: 'ATK Grosir Jaya', category: 'Alat Tulis', contact: '081122334455', pic: 'Koh Ali', status: 'Inactive' },
];

const MOCK_TRANSACTIONS = [
  { id: 'TX-101', walletId: 'W-001', date: '2023-11-20 10:15', items: [{ name: 'Susu UHT Coklat 250ml', qty: 2, price: 5000 }], total: 10000, status: 'Success' },
  { id: 'TX-102', walletId: 'W-001', date: '2023-11-19 12:30', items: [{ name: 'Roti Bakar Bandung', qty: 1, price: 8000 }, { name: 'Pulpen Faster', qty: 1, price: 3000 }], total: 11000, status: 'Success' },
  { id: 'TX-103', walletId: 'W-002', date: '2023-11-20 12:30', items: [{ name: 'Buku Tulis Sidu 58', qty: 1, price: 4500 }], total: 4500, status: 'Success' },
];

const WEEKLY_SALES_DATA = [
  { day: 'Senin', revenue: 450000, profit: 125000 },
  { day: 'Selasa', revenue: 520000, profit: 160000 },
  { day: 'Rabu', revenue: 480000, profit: 145000 },
  { day: 'Kamis', revenue: 610000, profit: 190000 },
  { day: 'Jumat', revenue: 380000, profit: 110000 },
  { day: 'Sabtu', revenue: 250000, profit: 75000 },
];

const FUNDING_DATA = [
  { name: 'Snacks & Drinks', value: 400 },
  { name: 'Stationery', value: 300 },
  { name: 'Uniforms', value: 300 },
];
const COLORS = ['#f97316', '#3b82f6', '#10b981'];

export function CooperativeManager() {
  const [currentUserRole, setCurrentUserRole] = useState<'Cashier' | 'Canteen Staff'>('Canteen Staff');
  const [activeTab, setActiveTab] = useState('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    if (currentUserRole === 'Cashier' && (activeTab === 'inventory' || activeTab === 'suppliers')) {
      setActiveTab('pos');
    }
  }, [currentUserRole, activeTab]);

  // Cart state
  const [cart, setCart] = useState<{id: string, name: string, qty: number, price: number}[]>([]);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // Track mock wallet balances locally so we can update them on purchase
  const [walletsState, setWalletsState] = useState(WALLETS);

  const [inventoryState, setInventoryState] = useState(INVENTORY);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const [newProduct, setNewProduct] = useState({
    name: '',
    category: 'Kantin',
    stock: 0,
    costPrice: 0,
    price: 0,
    reorderPoint: 20,
    expiryDate: ''
  });

  const [suppliersState, setSuppliersState] = useState(MOCK_SUPPLIERS);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    category: 'Kantin',
    contact: '',
    pic: '',
    status: 'Active'
  });

  const [transactionsState, setTransactionsState] = useState(MOCK_TRANSACTIONS);
  const [selectedWalletHistory, setSelectedWalletHistory] = useState<any>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<any>(null);

  const handleScan = (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const barcode = detectedCodes[0].rawValue;
      const item = inventoryState.find(i => i.id === barcode || i.name.toLowerCase().includes(barcode.toLowerCase()));
      if (item) {
        addToCart(item);
        setIsScannerOpen(false);
        setScanError('');
      } else {
        setScanError(`Item with barcode ${barcode} not found.`);
      }
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          const lines = text.split('\n');
          // skip header
          const newItems: any[] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            // Assuming format: id,name,category,stock,costPrice,price,reorderPoint
            const parts = line.split(',');
            if (parts.length >= 6) {
              const [id, name, category, stock, costPrice, price, reorderPoint] = parts.map(p => p.trim());
              newItems.push({
                id: id || `ITM-BU-${Date.now()}-${i}`,
                name: name.replace(/^"|"$/g, ''),
                category: category || 'General',
                stock: parseInt(stock) || 0,
                costPrice: parseInt(costPrice) || 0,
                price: parseInt(price) || 0,
                reorderPoint: parseInt(reorderPoint) || 20
              });
            }
          }
          if (newItems.length > 0) {
            setInventoryState(prev => [...prev, ...newItems]);
            alert(`Successfully imported ${newItems.length} items`);
          } else {
             alert('No valid items found to import.');
          }
        }
      };
      reader.onerror = () => {
         alert('Error reading file');
      };
      reader.readAsText(file);
    }
    // reset input
    if (event.target) {
      event.target.value = '';
    }
  };

  const addToCart = (item: any) => {
    if (item.stock <= 0) return; // Prevent adding if out of stock

    setCart(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) {
        if (exists.qty >= item.stock) return prev; // Prevent adding more than stock
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setPaymentError('');
  }

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  const handleStartPayment = () => {
    if (cart.length === 0) return;
    setPaymentError('');
    setShowScanModal(true);
  };

  const handleProcessPayment = (studentWallet: any) => {
    if (studentWallet.balance < subtotal) {
      setPaymentError(`Insufficient balance for ${studentWallet.student}. Balance: Rp ${studentWallet.balance.toLocaleString('id-ID')}`);
      return;
    }

    // Check limit
    if (subtotal > studentWallet.limit) {
      setPaymentError(`Transaction exceeds daily limit for ${studentWallet.student}. Limit: Rp ${studentWallet.limit.toLocaleString('id-ID')}`);
      return;
    }

    if (studentWallet.status !== 'Active' && studentWallet.status !== 'Warning') {
      setPaymentError(`Card is inactive or blocked for ${studentWallet.student}.`);
      return;
    }

    setPaymentError('');
    setIsProcessingPayment(true);

    setTimeout(() => {
      // Deduct balance
      setWalletsState(prev => prev.map(w => w.id === studentWallet.id ? { ...w, balance: w.balance - subtotal, lastTransaction: new Date().toISOString().slice(0, 16).replace('T', ' ') } : w));

      // Deduct stock
      setInventoryState(prev => prev.map(item => {
        const cartItem = cart.find(c => c.id === item.id);
        if (cartItem) {
          return { ...item, stock: Math.max(0, item.stock - cartItem.qty) };
        }
        return item;
      }));

      // Add transaction history
      const newTx = {
        id: generateUniqueId('Transaction', []),
        walletId: studentWallet.id,
        studentName: studentWallet.student,
        grade: studentWallet.grade,
        date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        items: [...cart],
        total: subtotal,
        status: 'Success'
      };

      setTransactionsState(prev => [newTx, ...prev]);
      setCurrentReceipt(newTx);

      setIsProcessingPayment(false);
      setPaymentSuccess(true);
    }, 1500);
  };

  const closeReceipt = () => {
    setPaymentSuccess(false);
    setShowScanModal(false);
    setCurrentReceipt(null);
    clearCart();
  };

  const handleSaveProduct = () => {
    if (editingProduct) {
      setInventoryState(prev => prev.map(item => item.id === editingProduct.id ? { ...item, ...newProduct } : item));
    } else {
      const id = `ITM-${(inventoryState.length + 1).toString().padStart(2, '0')}`;
      setInventoryState(prev => [...prev, { id, ...newProduct }]);
    }
    setIsProductModalOpen(false);
  };

  const handleSaveSupplier = () => {
    if (editingSupplier) {
      setSuppliersState(prev => prev.map(item => item.id === editingSupplier.id ? { ...item, ...newSupplier } : item));
    } else {
      const id = `SUP-${(suppliersState.length + 1).toString().padStart(3, '0')}`;
      setSuppliersState(prev => [...prev, { id, ...newSupplier }]);
    }
    setIsSupplierModalOpen(false);
  };

  const filteredInventory = inventoryState.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSuppliers = suppliersState.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.pic.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderPOS = () => (
    <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 space-y-4">
        {filteredInventory.length === 0 ? (
           <div className="text-center py-10 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl">
             <Package className="w-10 h-10 text-slate-400 mx-auto mb-3" />
             <p className="text-slate-500 dark:text-slate-400">No items found matching "{searchQuery}"</p>
           </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredInventory.map(item => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl text-left hover:border-orange-500/50 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-all group flex flex-col h-full relative"
              >
                {item.expiryDate && new Date(item.expiryDate).getTime() - new Date().getTime() <= 7 * 24 * 60 * 60 * 1000 && (
                  <div className="absolute top-2 right-2">
                    <Calendar className={cn("w-3.5 h-3.5", new Date(item.expiryDate).getTime() <= new Date().getTime() ? "text-red-500 animate-[pulse_2s_ease-in-out_infinite]" : "text-orange-500")} />
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">{item.category}</div>
                <div className="font-medium text-sm text-slate-800 dark:text-slate-200 mb-2 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors line-clamp-2 pr-4">{item.name}</div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Rp {item.price.toLocaleString('id-ID')}</span>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded", item.stock <= (item.reorderPoint || 20) ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400")}>{item.stock}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-full lg:w-[400px] bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl flex flex-col h-[600px] shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Current Order</h3>
          {cart.length > 0 && (
             <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 bg-red-50 dark:bg-red-500/10 rounded">
               Clear
             </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs text-slate-500 mt-1">Select items to add</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex gap-3 group">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">{item.name}</div>
                  <div className="flex items-center gap-3">
                     <span className="text-xs text-slate-500">{item.qty} x Rp {item.price.toLocaleString('id-ID')}</span>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end justify-between">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Rp {(item.qty * item.price).toLocaleString('id-ID')}</span>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Tax (0%)</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">Rp 0</span>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 my-2 pt-2 flex items-center justify-between text-xl font-bold">
            <span className="text-slate-800 dark:text-slate-200">Total</span>
            <span className="text-orange-600 dark:text-orange-400">Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>

          <button
            disabled={cart.length === 0 || isProcessingPayment || paymentSuccess}
            onClick={handleStartPayment}
            className={cn(
              "w-full py-3 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 mt-4",
              cart.length === 0 ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed" :
              paymentSuccess ? "bg-emerald-500 text-white shadow-emerald-500/20" :
              "bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/20"
            )}
          >
            {paymentSuccess ? (
              <><CheckCircle2 className="w-5 h-5" /> Payment Success!</>
            ) : isProcessingPayment ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processing...</>
            ) : (
              <><CreditCard className="w-5 h-5" /> Pay with Santri Card</>
            )}
          </button>
        </div>
      </div>

      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                   <CreditCard className="w-5 h-5" />
                 </div>
                 <div>
                   <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Menunggu Tap Kartu...</h3>
                   <p className="text-xs text-slate-500">Silakan tap Santri Card atau pilih akun di bawah (Mock)</p>
                 </div>
              </div>
              <button
                disabled={isProcessingPayment}
                onClick={() => paymentSuccess ? closeReceipt() : setShowScanModal(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {paymentError && (
                 <div className="p-3 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-500/20">
                   {paymentError}
                 </div>
              )}
              {isProcessingPayment && !paymentSuccess && (
                <div className="py-8 flex flex-col justify-center items-center gap-4 text-orange-600 dark:text-orange-400">
                  <div className="w-8 h-8 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin"></div>
                  <span className="text-sm font-medium">Memproses Pembayaran...</span>
                </div>
              )}
              {paymentSuccess && currentReceipt && (
                <div className="py-6 flex flex-col gap-4 animate-in fade-in">
                  <div className="flex flex-col items-center text-emerald-600 dark:text-emerald-400 mb-2">
                    <CheckCircle2 className="w-12 h-12 mb-2" />
                    <span className="text-lg font-bold">Pembayaran Berhasil!</span>
                  </div>

                  <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl p-4 font-mono text-sm max-h-60 overflow-y-auto custom-scrollbar">
                    <div className="text-center mb-4 border-b border-dashed border-slate-300 dark:border-slate-700 pb-2">
                      <div className="font-bold text-slate-800 dark:text-slate-200">KOPERASI AL-ITTIHAD</div>
                      <div className="text-xs text-slate-500">Bukti Pembayaran Digital</div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Waktu:</span>
                      <span>{currentReceipt.date}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>No. Transaksi:</span>
                      <span>{currentReceipt.id}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mb-3">
                      <span>Santri:</span>
                      <span>{currentReceipt.studentName} ({currentReceipt.grade})</span>
                    </div>
                    <div className="border-t border-dashed border-slate-300 dark:border-slate-700 py-2 space-y-1">
                      {currentReceipt.items.map((item: any, idx: number) => (
                         <div key={idx} className="flex justify-between text-slate-700 dark:text-slate-300">
                           <span>{item.name} x{item.qty}</span>
                           <span>Rp {(item.price * item.qty).toLocaleString('id-ID')}</span>
                         </div>
                      ))}
                    </div>
                    <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 flex justify-between font-bold text-base text-slate-800 dark:text-slate-200">
                      <span>TOTAL</span>
                      <span>Rp {currentReceipt.total.toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => window.print()}
                      className="flex-1 py-2 border border-slate-200 dark:border-white/10 bg-white dark:bg-black/40 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg text-slate-700 dark:text-slate-300 font-medium transition-colors border-dashed"
                    >
                      Print Receipt
                    </button>
                    <button
                      onClick={closeReceipt}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                    >
                      Selesai
                    </button>
                  </div>
                </div>
              )}
              {!isProcessingPayment && !paymentSuccess && walletsState.map(w => (
                 <button
                   key={w.id}
                   onClick={() => handleProcessPayment(w)}
                   className="w-full text-left p-3 border border-slate-200 dark:border-white/10 rounded-xl hover:border-orange-500/50 hover:bg-orange-50/50 dark:hover:bg-orange-900/20 transition-all flex justify-between items-center"
                 >
                   <div>
                     <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{w.student} <span className="text-xs font-normal text-slate-500">({w.grade})</span></div>
                     <div className="text-xs text-slate-500">Memiliki Saldo: Rp {w.balance.toLocaleString('id-ID')}</div>
                   </div>
                   <div className="text-orange-600 dark:text-orange-400 text-xs font-bold bg-orange-100 dark:bg-orange-500/10 px-2 py-1 rounded">
                     TAP
                   </div>
                 </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderInventory = () => {
    const expiringItems = inventoryState.filter(item => item.expiryDate && new Date(item.expiryDate).getTime() - new Date().getTime() <= 7 * 24 * 60 * 60 * 1000);

    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {expiringItems.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-300">Attention: Expiring Stock</h3>
              <p className="text-sm text-orange-700/80 dark:text-orange-400/80 mt-1">There {expiringItems.length === 1 ? 'is' : 'are'} {expiringItems.length} item(s) nearing or past their expiration date. Please review the inventory.</p>
            </div>
          </div>
        )}
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm">
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse whitespace-nowrap">
           <thead>
             <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60">
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Item ID</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Harga Beli</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Harga Jual</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Expiry Date</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100 dark:divide-white/5">
             {filteredInventory.map(item => (
               <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                 <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">{item.id}</td>
                 <td className="p-4 font-medium text-slate-800 dark:text-slate-200">{item.name}</td>
                 <td className="p-4 text-sm text-slate-600 dark:text-slate-400">
                   <span className="px-2 py-1 bg-slate-100 dark:bg-white/5 rounded-md text-xs">{item.category}</span>
                 </td>
                 <td className="p-4">
                   <div className="flex items-center gap-2">
                     <span className={cn("px-2 py-1 rounded text-xs font-bold", item.stock <= (item.reorderPoint || 20) ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400")}>
                       {item.stock} / {item.reorderPoint || 20}
                     </span>
                     {item.stock <= (item.reorderPoint || 20) && (
                       <div className="group relative flex items-center">
                         <AlertTriangle className="w-4 h-4 text-red-500 animate-[pulse_2s_ease-in-out_infinite]" />
                         <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-10 font-medium tracking-wide">
                           Below Reorder Point
                         </div>
                       </div>
                     )}
                   </div>
                 </td>
                 <td className="p-4 text-right text-slate-800 dark:text-slate-300 font-medium">{item.costPrice?.toLocaleString('id-ID') || '-'}</td>
                 <td className="p-4 text-right text-slate-800 dark:text-slate-300 font-medium">{item.price.toLocaleString('id-ID')}</td>
                 <td className="p-4">
                   {item.expiryDate ? (
                     <div className="flex items-center gap-2">
                       <span className={cn(
                         "text-xs font-semibold px-2 py-1 rounded",
                         new Date(item.expiryDate).getTime() - new Date().getTime() <= 7 * 24 * 60 * 60 * 1000 && new Date(item.expiryDate).getTime() > new Date().getTime() ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" :
                         new Date(item.expiryDate).getTime() <= new Date().getTime() ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                         "bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300"
                       )}>
                         {new Date(item.expiryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                       </span>
                       {new Date(item.expiryDate).getTime() - new Date().getTime() <= 7 * 24 * 60 * 60 * 1000 && (
                         <div className="group relative flex items-center">
                           <Calendar className={cn("w-4 h-4", new Date(item.expiryDate).getTime() <= new Date().getTime() ? "text-red-500 animate-[pulse_2s_ease-in-out_infinite]" : "text-orange-500")} />
                           <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-10 font-medium tracking-wide">
                             {new Date(item.expiryDate).getTime() <= new Date().getTime() ? 'Expired' : 'Expiring Soon'}
                           </div>
                         </div>
                       )}
                     </div>
                   ) : '-'}
                 </td>
                 <td className="p-4 text-right">
                   <button
                     onClick={() => {
                       setEditingProduct(item);
                       setNewProduct(item as any);
                       setIsProductModalOpen(true);
                     }}
                     className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-semibold mr-3"
                   >
                     Edit
                   </button>
                   <button
                     onClick={() => {
                       setInventoryState(prev => prev.map(invItem => invItem.id === item.id ? { ...invItem, stock: invItem.stock + 50 } : invItem));
                     }}
                     className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 text-sm font-semibold"
                   >
                     Restock Quick +50
                   </button>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
      </div>
    </div>
    );
  };

  const renderWallets = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm">
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-3">
             <div className="p-2 bg-orange-100 dark:bg-orange-500/10 rounded-lg">
               <Wallet className="w-5 h-5 text-orange-600 dark:text-orange-400" />
             </div>
             <span className="text-sm font-semibold">Total Wallet Balance</span>
           </div>
           <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">Rp 12.5M</div>
         </div>
         <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm">
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-3">
             <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg">
               <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
             </div>
             <span className="text-sm font-semibold">Today's Transactions</span>
           </div>
           <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">145 Tx</div>
         </div>
         <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm">
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-3">
             <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg">
               <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
             </div>
             <span className="text-sm font-semibold">Active Cards</span>
           </div>
           <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">520</div>
         </div>
      </div>

      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
           <div className="flex items-center gap-2">
             <h3 className="font-semibold text-slate-800 dark:text-slate-200">Santri Wallets</h3>
             <span className="px-2 py-0.5 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400 text-xs rounded-full font-medium">{walletsState.length} records</span>
           </div>
           <button className="text-sm bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20 px-4 py-2 rounded-lg font-medium flex gap-2 items-center transition-colors">
             <ArrowDownToLine className="w-4 h-4" /> Top-Up Selected
           </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
           <thead>
             <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60">
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Santri ID</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name / Grade</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Balance (Rp)</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Daily Limit</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Tx</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100 dark:divide-white/5">
             {walletsState.map(wallet => (
               <tr key={wallet.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                 <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">{wallet.id}</td>
                 <td className="p-4">
                   <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{wallet.student}</div>
                   <div className="text-xs text-slate-500 mt-0.5">{wallet.grade}</div>
                 </td>
                 <td className="p-4">
                   <span className={cn("font-bold text-sm", wallet.balance < wallet.limit ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400")}>
                     {wallet.balance.toLocaleString('id-ID')}
                   </span>
                 </td>
                 <td className="p-4 text-slate-600 dark:text-slate-400 text-sm">{wallet.limit.toLocaleString('id-ID')}</td>
                 <td className="p-4 text-slate-500 dark:text-slate-400 text-xs">{wallet.lastTransaction}</td>
                 <td className="p-4">
                   <span className={cn("px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider", wallet.status === 'Active' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400")}>
                     {wallet.status}
                   </span>
                 </td>
                 <td className="p-4 text-right">
                   <button
                     onClick={() => {
                       setSelectedWalletHistory(wallet);
                       setIsHistoryModalOpen(true);
                     }}
                     className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-semibold flex items-center gap-1 justify-end ml-auto"
                   >
                     <History className="w-4 h-4" /> History
                   </button>
                 </td>
               </tr>
             ))}
           </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSuppliers = () => (
    <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="overflow-x-auto">
         <table className="w-full text-left border-collapse whitespace-nowrap">
           <thead>
             <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60">
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Supplier ID</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name / Company</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact / PIC</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
               <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100 dark:divide-white/5">
             {filteredSuppliers.map(supplier => (
               <tr key={supplier.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                 <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">{supplier.id}</td>
                 <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-2">
                       <Building2 className="w-4 h-4 text-slate-400" />
                       {supplier.name}
                    </div>
                 </td>
                 <td className="p-4 text-sm text-slate-600 dark:text-slate-400">
                   <span className="px-2 py-1 bg-slate-100 dark:bg-white/5 rounded-md text-xs">{supplier.category}</span>
                 </td>
                 <td className="p-4">
                   <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{supplier.pic}</div>
                   <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {supplier.contact}</div>
                 </td>
                 <td className="p-4">
                   <span className={cn("px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider", supplier.status === 'Active' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400")}>
                     {supplier.status}
                   </span>
                 </td>
                 <td className="p-4 text-right">
                   <button
                     onClick={() => {
                       setEditingSupplier(supplier);
                       setNewSupplier(supplier);
                       setIsSupplierModalOpen(true);
                     }}
                     className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-semibold"
                   >
                     Edit
                   </button>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
    </div>
  );

  const renderParentMonitor = () => (
    <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="w-full lg:w-1/3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 shadow-sm rounded-2xl p-6">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-6">Spending Composition</h3>
          <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={FUNDING_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {FUNDING_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ backgroundColor: 'var(--tw-colors-slate-900)', borderColor: 'var(--tw-colors-slate-700)', borderRadius: '8px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
       </div>
       <div className="w-full lg:w-2/3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 shadow-sm rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
             <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2"><Users className="w-5 h-5 text-blue-500" /> Parent App Integration</h3>
                <p className="text-slate-500 text-sm">Parents can view daily expenditures via the mobile app.</p>
             </div>
          </div>
          <div className="p-5 bg-orange-50 dark:bg-orange-500/5 text-orange-800 dark:text-orange-200/80 border border-orange-200 dark:border-orange-500/20 rounded-xl text-sm leading-relaxed mb-6">
            Parents have the ability to explicitly block purchases in the POS system. When they scan the Santri Card, the POS alerts <strong className="font-semibold">"Pembelian Dibatasi: [Item Name]"</strong>. Parent notifications for low balance are automatically triggered.
          </div>

          <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-4 text-sm uppercase tracking-wider">Features</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="p-4 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5">
                <h5 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Set Daily Limits</h5>
                <p className="text-xs text-slate-500">Parents can restrict how much money can be spent per day to manage allowances.</p>
             </div>
             <div className="p-4 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5">
                <h5 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Real-time Notifications</h5>
                <p className="text-xs text-slate-500">Instant push notifications for every transaction made by the student.</p>
             </div>
             <div className="p-4 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5">
                <h5 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Nutrition Tracking</h5>
                <p className="text-xs text-slate-500">View what kind of snacks the student is purchasing to monitor health.</p>
             </div>
             <div className="p-4 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5">
                <h5 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Auto Top-Up</h5>
                <p className="text-xs text-slate-500">Automatically reload the wallet when balance falls below a certain threshold.</p>
             </div>
          </div>
       </div>
    </div>
  );

  const renderAnalytics = () => {
    const totalWeeklyRevenue = WEEKLY_SALES_DATA.reduce((acc, curr) => acc + curr.revenue, 0);
    const totalWeeklyProfit = WEEKLY_SALES_DATA.reduce((acc, curr) => acc + curr.profit, 0);
    const avgMargin = (totalWeeklyProfit / totalWeeklyRevenue) * 100;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col shadow-sm">
             <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
                 <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                   <DollarSign className="w-4 h-4" />
                 </div>
                 <span className="text-sm font-semibold">Total Revenue (Minggu ini)</span>
             </div>
             <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">Rp {totalWeeklyRevenue.toLocaleString('id-ID')}</div>
             <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1">
               <TrendingUp className="w-3 h-3" /> +12.5% dari minggu lalu
             </div>
          </div>

          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col shadow-sm">
             <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
                 <div className="p-2 bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-lg">
                   <BarChart3 className="w-4 h-4" />
                 </div>
                 <span className="text-sm font-semibold">Total Profit (Minggu ini)</span>
             </div>
             <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">Rp {totalWeeklyProfit.toLocaleString('id-ID')}</div>
             <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1">
               <TrendingUp className="w-3 h-3" /> +8.2% dari minggu lalu
             </div>
          </div>

          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col shadow-sm">
             <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
                 <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                   <PieChart className="w-4 h-4" />
                 </div>
                 <span className="text-sm font-semibold">Average Margin</span>
             </div>
             <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{avgMargin.toFixed(1)}%</div>
             <div className="text-xs text-slate-500 font-medium mt-1">
               Healthy profit margin
             </div>
          </div>

          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col shadow-sm">
             <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
                 <div className="p-2 bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                   <Receipt className="w-4 h-4" />
                 </div>
                 <span className="text-sm font-semibold">Transactions</span>
             </div>
             <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">142</div>
             <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1">
               <TrendingUp className="w-3 h-3" /> +5.4% dari minggu lalu
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <div className="lg:col-span-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6">Revenue & Profit Overview</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={WEEKLY_SALES_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `Rp${value / 1000}k`} />
                    <RechartsTooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`Rp ${value.toLocaleString('id-ID')}`, '']}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
           </div>

           <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6">Sales by Category</h3>
              <div className="h-[250px] w-full mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={FUNDING_DATA}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {FUNDING_DATA.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`${value} Items`, 'Sales']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {FUNDING_DATA.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                       <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.value}</span>
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* Profit Margin Heatmap */}
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
           <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6">Profit Margin Heatmap (Canteen)</h3>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
             {inventoryState
               .filter(item => item.category === 'Kantin' && item.costPrice && item.price)
               .map(item => {
                  const profitMargin = (((item.price - (item.costPrice || 0)) / item.price) * 100);
                  const profitAbsolute = item.price - (item.costPrice || 0);

                  let colorClass = "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
                  if (profitMargin >= 40) colorClass = "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
                  else if (profitMargin >= 25) colorClass = "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
                  else if (profitMargin >= 15) colorClass = "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20";

                  return (
                    <div key={item.name} className={cn("p-3 rounded-lg border flex flex-col justify-between h-[100px] transition-all hover:scale-105 cursor-pointer shadow-sm", colorClass)}>
                      <div className="text-xs font-semibold line-clamp-2 leading-tight">{item.name}</div>
                      <div className="mt-2">
                        <div className="text-lg font-bold tracking-tight">{profitMargin.toFixed(1)}%</div>
                        <div className="text-[10px] opacity-80 font-medium">Rp {profitAbsolute.toLocaleString('id-ID')} / unit</div>
                      </div>
                    </div>
                  );
               })}
           </div>
           <div className="flex flex-wrap gap-4 mt-6 text-xs text-slate-600 dark:text-slate-400 justify-center">
             <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500/50"></div>&gt; 40% (Excellent)</div>
             <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500/50"></div>25% - 40% (Good)</div>
             <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-500/50"></div>15% - 25% (Average)</div>
             <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500/50"></div>&lt; 15% (Poor)</div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif text-slate-800 dark:text-slate-100 flex items-center gap-3">
             <Store className="w-6 h-6 text-orange-500" />
             Koperasi & Canteen
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage POS, inventory, and student digital wallets</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-1 mr-2 border border-slate-200 dark:border-white/10">
            <button
              onClick={() => setCurrentUserRole('Cashier')}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all",
                currentUserRole === 'Cashier'
                  ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              Cashier
            </button>
            <button
              onClick={() => setCurrentUserRole('Canteen Staff')}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all",
                currentUserRole === 'Canteen Staff'
                  ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              <Shield className="w-3 h-3 text-orange-500" />
              Staff
            </button>
          </div>
          {activeTab === 'inventory' && (
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-white/20 transition-colors border border-slate-200 dark:border-white/5 space-x-1">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Bulk Upload</span>
              </button>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setNewProduct({ name: '', category: 'Kantin', stock: 0, costPrice: 0, price: 0, reorderPoint: 20, expiryDate: '' });
                  setIsProductModalOpen(true);
                }}
                className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-orange-500 transition-colors shadow-sm shadow-orange-500/20">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Product</span>
              </button>
            </div>
          )}
          {activeTab === 'suppliers' && (
            <button
              onClick={() => {
                setEditingSupplier(null);
                setNewSupplier({ name: '', category: 'Kantin', contact: '', pic: '', status: 'Active' });
                setIsSupplierModalOpen(true);
              }}
              className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-orange-500 transition-colors shadow-sm shadow-orange-500/20">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Supplier</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-black/20 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 overflow-x-auto custom-scrollbar">
          <div className="flex p-2 gap-2 min-w-max">
            {[
              { id: 'pos', label: 'POS System', icon: <ShoppingCart className="w-4 h-4" /> },
              { id: 'inventory', label: 'Inventory', icon: <Package className="w-4 h-4" />, roles: ['Canteen Staff'] },
              { id: 'suppliers', label: 'Suppliers', icon: <Truck className="w-4 h-4" />, roles: ['Canteen Staff'] },
              { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, roles: ['Canteen Staff'] },
              { id: 'wallets', label: 'Santri Wallets', icon: <Wallet className="w-4 h-4" /> },
              { id: 'parent-monitor', label: 'Parent Monitoring', icon: <Users className="w-4 h-4" /> },
            ].filter(tab => !tab.roles || tab.roles.includes(currentUserRole)).map(tab => (
              <button
                key={tab.id}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn("erp-tab-control",
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all relative",
                  activeTab === tab.id
                    ? "bg-white dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200 dark:border-orange-500/20"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-black/20 border-b border-slate-200 dark:border-white/5">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 ring-orange-500/50 border border-slate-200 dark:border-white/10 w-full bg-slate-50 dark:bg-black/40 text-slate-700 dark:text-slate-300 transition-all font-medium"
              />
            </div>
            <button
              onClick={() => {
                setScanError('');
                setIsScannerOpen(true);
              }}
              className="p-2 rounded-lg border border-orange-200 dark:border-orange-500/20 bg-orange-50 hover:bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 dark:text-orange-400 flex items-center gap-2 transition-colors">
              <ScanLine className="w-4 h-4" />
              <span className="text-sm font-medium hidden lg:inline">Scan Barcode</span>
            </button>
            <button className="p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 flex items-center gap-2 transition-colors">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium hidden lg:inline">Filter Category</span>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-slate-50/50 dark:bg-transparent">
          {activeTab === 'pos' && renderPOS()}
          {activeTab === 'inventory' && renderInventory()}
          {activeTab === 'suppliers' && renderSuppliers()}
          {activeTab === 'analytics' && renderAnalytics()}
          {activeTab === 'wallets' && renderWallets()}
          {activeTab === 'parent-monitor' && renderParentMonitor()}
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 dark:bg-black/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                   <ScanLine className="w-5 h-5 flex-shrink-0" />
                 </div>
                 <div>
                   <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Scan Product Barcode</h3>
                   <p className="text-xs text-slate-500">Center the barcode in the frame</p>
                 </div>
              </div>
              <button onClick={() => setIsScannerOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 relative bg-black aspect-square flex items-center justify-center">
               <Scanner
                 onScan={handleScan}
               />
               <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                 <div className="w-full h-full border-2 border-orange-500/80 rounded relative">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-orange-500/50 -translate-y-1/2 animate-[pulse_2s_ease-in-out_infinite]" />
                 </div>
               </div>
            </div>

            {scanError && (
              <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-red-50 dark:bg-red-500/5">
                <div className="text-sm text-red-600 dark:text-red-400 font-medium">
                  {scanError}
                </div>
              </div>
            )}
            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <p className="text-xs text-slate-500 text-center">Support standard barcodes (EAN, UPC) and QR Codes.</p>
            </div>
          </div>
        </div>
      )}

      {/* Product Management Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                   <Package className="w-5 h-5 flex-shrink-0" />
                 </div>
                 <div>
                   <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                   <p className="text-xs text-slate-500">Manage inventory details</p>
                 </div>
              </div>
              <button onClick={() => setIsProductModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Product Name</label>
                <input
                  type="text"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  placeholder="e.g. Buku Tulis"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="Kantin">Kantin</option>
                    <option value="Alat Tulis">Alat Tulis</option>
                    <option value="Seragam">Seragam</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Stock</label>
                  <input
                    type="number"
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Harga Beli (Rp)</label>
                  <input
                    type="number"
                    value={newProduct.costPrice}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, costPrice: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Harga Jual (Rp)</label>
                  <input
                    type="number"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Reorder Point</label>
                  <input
                    type="number"
                    value={newProduct.reorderPoint}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, reorderPoint: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  />
                </div>
                {newProduct.category === 'Kantin' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={newProduct.expiryDate || ''}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, expiryDate: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveProduct}
                disabled={!newProduct.name || newProduct.price <= 0}
                className="w-full py-2.5 mt-4 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
              >
                Save Product
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Supplier Management Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                   <Truck className="w-5 h-5 flex-shrink-0" />
                 </div>
                 <div>
                   <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                   <p className="text-xs text-slate-500">Manage supplier details</p>
                 </div>
              </div>
              <button onClick={() => setIsSupplierModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Company Name</label>
                <input
                  type="text"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  placeholder="e.g. CV. Makmur Jaya"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={newSupplier.category}
                    onChange={(e) => setNewSupplier(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="Kantin">Kantin</option>
                    <option value="Makanan Ringan">Makanan Ringan</option>
                    <option value="Alat Tulis">Alat Tulis</option>
                    <option value="Seragam">Seragam</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={newSupplier.status}
                    onChange={(e) => setNewSupplier(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">PIC Name</label>
                  <input
                    type="text"
                    value={newSupplier.pic}
                    onChange={(e) => setNewSupplier(prev => ({ ...prev, pic: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                    placeholder="e.g. Bpk. Budi"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Contact Number</label>
                  <input
                    type="text"
                    value={newSupplier.contact}
                    onChange={(e) => setNewSupplier(prev => ({ ...prev, contact: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                    placeholder="e.g. 0812..."
                  />
                </div>
              </div>

              <button
                onClick={handleSaveSupplier}
                disabled={!newSupplier.name || !newSupplier.pic}
                className="w-full py-2.5 mt-4 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
              >
                Save Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && selectedWalletHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10 max-h-[85vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                   <Receipt className="w-5 h-5 flex-shrink-0" />
                 </div>
                 <div>
                   <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Purchase History</h3>
                   <p className="text-xs text-slate-500">{selectedWalletHistory.student} ({selectedWalletHistory.grade})</p>
                 </div>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="space-y-4">
                {transactionsState.filter(tx => tx.walletId === selectedWalletHistory.id).length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <History className="w-8 h-8 opacity-20 mx-auto mb-3" />
                    <p className="text-sm">No transaction history found.</p>
                  </div>
                ) : (
                  transactionsState.filter(tx => tx.walletId === selectedWalletHistory.id).map(tx => (
                    <div key={tx.id} className="border border-slate-200 dark:border-white/10 rounded-xl p-4 bg-slate-50/50 dark:bg-white/[0.02]">
                      <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-200 dark:border-white/10">
                        <div>
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{tx.date}</div>
                          <div className="text-xs font-mono text-slate-400 mt-0.5">{tx.id}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Rp {tx.total.toLocaleString('id-ID')}</div>
                          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">{tx.status}</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {tx.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <div className="flex gap-2">
                              <span className="text-slate-500 dark:text-slate-400">{item.qty}x</span>
                              <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
                            </div>
                            <span className="text-slate-600 dark:text-slate-400">Rp {(item.price * item.qty).toLocaleString('id-ID')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
