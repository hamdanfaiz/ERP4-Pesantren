import React, { useState } from 'react';
import { Shirt, WashingMachine, Users, Search, Plus, ListChecks, QrCode, ArrowRight, CheckCircle2, AlertTriangle, ScanLine, Clock, Thermometer, Wind, X, DollarSign, Printer, Tag, FileText, Receipt } from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';
import { Scanner } from '@yudiel/react-qr-scanner';

const MOCK_ORDERS = [
  { id: 'LDY-1001', student: 'Ahmad Muzakki', nis: '1001', room: 'A-101', weight: 3.5, pieces: 12, receivedAt: '2026-06-05 08:00', status: 'Washing' },
  { id: 'LDY-1002', student: 'Budi Santoso', nis: '1002', room: 'A-102', weight: 2.0, pieces: 8, receivedAt: '2026-06-05 09:30', status: 'Received' },
  { id: 'LDY-1003', student: 'Syamil Al-Farizi', nis: '1003', room: 'B-201', weight: 5.1, pieces: 18, receivedAt: '2026-06-04 15:00', status: 'Ready' },
  { id: 'LDY-1004', student: 'Farel Prasetya', nis: '1004', room: 'B-202', weight: 1.5, pieces: 5, receivedAt: '2026-06-06 07:15', status: 'Received' },
];

const MOCK_QUOTAS = [
  { id: 'Q-1001', student: 'Ahmad Muzakki', nis: '1001', room: 'A-101', limit: 20, used: 15.5, extraCharge: 0 },
  { id: 'Q-1002', student: 'Budi Santoso', nis: '1002', room: 'A-102', limit: 20, used: 19.5, extraCharge: 0 },
  { id: 'Q-1003', student: 'Syamil Al-Farizi', nis: '1003', room: 'B-201', limit: 20, used: 22.1, extraCharge: 31500 },
];

const MOCK_HISTORY = [
  { id: 'LDY-0990', student: 'Ahmad Muzakki', nis: '1001', date: '2026-05-30', weight: 4.2, status: 'Delivered' },
  { id: 'LDY-0991', student: 'Farel Prasetya', nis: '1004', date: '2026-05-31', weight: 2.8, status: 'Delivered' },
];

const MOCK_PRICING = {
  defaultMonthlyLimit: 20,
  extraChargePerKg: 15000,
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  'Received': <Clock className="w-4 h-4 text-amber-500" />,
  'Washing': <WashingMachine className="w-4 h-4 text-blue-500 animate-pulse" />,
  'Ready':   <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  'Collected': <CheckCircle2 className="w-4 h-4 text-slate-500" />
};

const NEXT_STATUS: Record<string, string> = {
  'Received': 'Washing',
  'Washing': 'Ready',
  'Ready': 'Collected'
};

export function LaundryManager() {
  const [activeTab, setActiveTab] = useState('orders');
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [quotas, setQuotas] = useState(MOCK_QUOTAS);
  const [history, setHistory] = useState(MOCK_HISTORY);
  const [pricing, setPricing] = useState(MOCK_PRICING);
  
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanType, setScanType] = useState<'receive' | 'deliver' | 'student'>('receive');

  const [newOrder, setNewOrder] = useState({
    student: '', nis: '', room: '', weight: 0, pieces: 0, status: 'Received'
  });
  
  const [editingQuota, setEditingQuota] = useState<any>(null);

  const handleScan = (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const barcode = detectedCodes[0].rawValue;
      if (scanType === 'student') {
        setNewOrder({
          ...newOrder,
          student: `Santri (${barcode})`,
          nis: barcode,
          room: 'A-101'
        });
        setIsScannerOpen(false);
      } else {
        setIsScannerOpen(false);
      }
    }
  };

  const advanceStatus = (id: string, currentStatus: string) => {
    const next = NEXT_STATUS[currentStatus];
    if (!next) return;

    if (next === 'Collected') {
      const order = orders.find(o => o.id === id);
      if (order) {
        setHistory([{ ...order, date: new Date().toISOString().split('T')[0], status: 'Collected' }, ...history]);
        setOrders(orders.filter(o => o.id !== id));
      }
    } else {
      setOrders(orders.map(o => o.id === id ? { ...o, status: next } : o));
    }
  };
  
  const handleCreateOrder = () => {
    if (!newOrder.student || !newOrder.weight) return;
    const newId = generateUniqueId('Laundry', orders);
    setOrders([{
      id: newId,
      student: newOrder.student,
      nis: newOrder.nis || '0000',
      room: newOrder.room || 'TBD',
      weight: newOrder.weight,
      pieces: newOrder.pieces,
      receivedAt: new Date().toISOString().substring(0, 16).replace('T', ' '),
      status: newOrder.status || 'Received'
    }, ...orders]);
    setIsNewOrderModalOpen(false);
    setNewOrder({ student: '', nis: '', room: '', weight: 0, pieces: 0, status: 'Received' });
  };

  const handleSaveQuota = () => {
    if (editingQuota) {
      setQuotas(quotas.map(q => q.id === editingQuota.id ? editingQuota : q));
      setIsQuotaModalOpen(false);
      setEditingQuota(null);
    }
  };

  const renderOrders = () => {
    const filteredOrders = orders.filter(o => o.student.toLowerCase().includes(searchQuery.toLowerCase()) || o.id.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return (
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse whitespace-nowrap">
             <thead>
               <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60">
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Order ID</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Santri Details</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Weight & Pieces</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Received At</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 dark:divide-white/5">
               {filteredOrders.map(order => (
                 <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                   <td className="p-4">
                     <span className="font-mono text-xs font-medium text-purple-600 dark:text-purple-400">{order.id}</span>
                   </td>
                   <td className="p-4">
                     <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{order.student}</div>
                     <div className="text-xs text-slate-500 dark:text-slate-400">NIS: {order.nis} • Room: {order.room}</div>
                   </td>
                   <td className="p-4">
                     <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{order.weight} kg</div>
                     <div className="text-xs text-slate-500 dark:text-slate-400">{order.pieces} pieces</div>
                   </td>
                   <td className="p-4 text-sm text-slate-600 dark:text-slate-400">{order.receivedAt}</td>
                   <td className="p-4">
                     <div className="flex items-center gap-2">
                       {STATUS_ICONS[order.status]}
                       <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{order.status}</span>
                     </div>
                   </td>
                   <td className="p-4 text-right">
                     {NEXT_STATUS[order.status] && (
                       <button 
                         onClick={() => advanceStatus(order.id, order.status)}
                         className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg text-xs font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                       >
                         Next: {NEXT_STATUS[order.status]} <ArrowRight className="w-3 h-3" />
                       </button>
                     )}
                   </td>
                 </tr>
               ))}
               {filteredOrders.length === 0 && (
                 <tr>
                   <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                     No active orders found.
                   </td>
                 </tr>
               )}
             </tbody>
           </table>
         </div>
      </div>
    );
  };

  const renderQuotas = () => {
    const filteredQuotas = quotas.filter(q => q.student.toLowerCase().includes(searchQuery.toLowerCase()) || q.nis.includes(searchQuery.toLowerCase()));

    return (
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse whitespace-nowrap">
             <thead>
               <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60">
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Santri Details</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Monthly Limit</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Used</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Remaining</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Extra Charges</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 dark:divide-white/5">
               {filteredQuotas.map(q => {
                 const remaining = Math.max(0, q.limit - q.used);
                 const usagePercent = Math.min(100, (q.used / q.limit) * 100);
                 const isOverLimit = q.used > q.limit;
                 
                 return (
                   <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                     <td className="p-4">
                       <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{q.student}</div>
                       <div className="text-xs text-slate-500 dark:text-slate-400">NIS: {q.nis} • Room: {q.room}</div>
                     </td>
                     <td className="p-4 text-sm font-medium text-slate-800 dark:text-slate-200">{q.limit} kg</td>
                     <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 min-w-[3rem]">{q.used.toFixed(1)} kg</span>
                          <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full rounded-full", isOverLimit ? "bg-red-500" : usagePercent > 80 ? "bg-orange-500" : "bg-emerald-500")} 
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                        </div>
                     </td>
                     <td className="p-4 text-sm font-medium text-slate-800 dark:text-slate-200">{remaining.toFixed(1)} kg</td>
                     <td className="p-4">
                       {isOverLimit ? (
                         <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded text-xs font-semibold">
                           <AlertTriangle className="w-3 h-3" /> Over Quota
                         </span>
                       ) : usagePercent > 80 ? (
                         <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded text-xs font-semibold">
                           Warning
                         </span>
                       ) : (
                         <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded text-xs font-semibold">
                           Normal
                         </span>
                       )}
                     </td>
                     <td className="p-4 text-right">
                       <span className={cn("text-sm font-bold", q.extraCharge > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400")}>
                         Rp {q.extraCharge.toLocaleString('id-ID')}
                       </span>
                     </td>
                     <td className="p-4 text-right">
                       <button
                         onClick={() => {
                           setEditingQuota(q);
                           setIsQuotaModalOpen(true);
                         }}
                         className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 text-sm font-semibold transition-colors"
                       >
                         Adjust
                       </button>
                     </td>
                   </tr>
                 );
               })}
               {filteredQuotas.length === 0 && (
                 <tr>
                   <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                     No quotas found matching your search.
                   </td>
                 </tr>
               )}
             </tbody>
           </table>
         </div>
      </div>
    );
  };

  const renderHistory = () => {
    return (
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse whitespace-nowrap">
             <thead>
               <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60">
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Order ID</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Santri Details</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Weight</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 dark:divide-white/5">
               {history.map(item => (
                 <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                   <td className="p-4 font-mono text-xs text-slate-500">{item.id}</td>
                   <td className="p-4 text-sm text-slate-600 dark:text-slate-400">{item.date}</td>
                   <td className="p-4">
                     <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{item.student}</div>
                     <div className="text-xs text-slate-500">NIS: {item.nis}</div>
                   </td>
                   <td className="p-4 text-sm text-slate-800 dark:text-slate-200 font-medium">{item.weight} kg</td>
                   <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 rounded text-xs font-semibold">
                         <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                         Collected
                      </span>
                   </td>
                   <td className="p-4 text-right">
                     <button
                       onClick={() => {
                         setReceiptData(item);
                         setIsReceiptModalOpen(true);
                       }}
                       className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                     >
                       <Receipt className="w-3.5 h-3.5" />
                       Receipt
                     </button>
                   </td>
                 </tr>
               ))}
               {history.length === 0 && (
                 <tr>
                   <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                     No delivery history available.
                   </td>
                 </tr>
               )}
             </tbody>
           </table>
         </div>
      </div>
    );
  };

  const renderLabels = () => {
    return (
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 dark:border-white/5 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-500" />
                Labels &amp; Marking
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Generate and print QR code labels for laundry processing tags.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map(order => (
              <div key={order.id} className="border border-slate-200 dark:border-white/10 rounded-xl p-5 bg-slate-50/50 dark:bg-black/20 flex flex-col gap-4">
                 <div className="flex items-start justify-between">
                   <div>
                     <h4 className="font-semibold text-slate-800 dark:text-slate-200">{order.student}</h4>
                     <p className="text-xs text-slate-500">Room: {order.room}</p>
                   </div>
                   <span className="font-mono text-xs font-bold bg-white dark:bg-black px-2 py-1 border border-slate-200 dark:border-white/10 rounded text-slate-600 dark:text-slate-300">
                     {order.id}
                   </span>
                 </div>
                 
                 <div className="flex-1 flex items-center justify-center py-4">
                    {/* Mock QR Code Pattern */}
                    <div className="w-24 h-24 bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center justify-center">
                       <QrCode className="w-full h-full text-slate-800" />
                    </div>
                 </div>

                 <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-200 dark:border-white/10">
                   <div className="text-xs text-slate-500">
                     <FileText className="w-3 h-3 inline mr-1" />
                     {order.pieces} Items • {order.weight}kg
                   </div>
                   <button className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-400 rounded-lg text-xs font-semibold transition-colors">
                     <Printer className="w-3.5 h-3.5" /> Print
                   </button>
                 </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 dark:text-slate-400">
                <p>No active orders require labels.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPricing = () => {
    return (
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6 max-w-2xl">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">Global Pricing Settings</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configure the default laundry quota and excess pricing charges for all santri.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Default Monthly Limit (kg)</label>
              <input
                type="number"
                value={pricing.defaultMonthlyLimit}
                onChange={(e) => setPricing({...pricing, defaultMonthlyLimit: parseFloat(e.target.value) || 0})}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Extra Charge per Kg (Rp)</label>
              <input
                type="number"
                value={pricing.extraChargePerKg}
                onChange={(e) => setPricing({...pricing, extraChargePerKg: parseInt(e.target.value) || 0})}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex gap-3">
            <button
              onClick={() => alert('Pricing settings saved!')}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-500 transition-colors shadow-sm shadow-purple-500/20"
            >
              Save Settings
            </button>
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
             <Shirt className="w-6 h-6 text-purple-500" />
             Laundry Manager
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage santri laundry workflow and tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'orders' && (
            <button 
              onClick={() => {
                setScanType('receive');
                setIsScannerOpen(true);
              }}
              className="flex items-center gap-2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-white/20 transition-colors border border-slate-200 dark:border-white/5 shadow-sm"
            >
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">Scan Label</span>
            </button>
          )}
          {activeTab === 'orders' && (
            <button 
              onClick={() => setIsNewOrderModalOpen(true)}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-purple-500 transition-colors shadow-sm shadow-purple-500/20"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Order</span>
            </button>
          )}
          {activeTab === 'quotas' && (
            <button 
              onClick={() => setQuotas(quotas.map(q => ({ ...q, used: 0, extraCharge: 0 })))}
              className="flex items-center gap-2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-white/20 transition-colors border border-slate-200 dark:border-white/5 shadow-sm"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Reset Monthly Quotas</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-black/20 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 overflow-x-auto custom-scrollbar">
          <div className="flex p-2 gap-2 min-w-max">
            {[
              { id: 'orders', label: 'Active Orders', icon: <WashingMachine className="w-4 h-4" /> },
              { id: 'quotas', label: 'Santri Quotas', icon: <Users className="w-4 h-4" /> },
              { id: 'labels', label: 'Labels & Marking', icon: <QrCode className="w-4 h-4" /> },
              { id: 'history', label: 'History', icon: <ListChecks className="w-4 h-4" /> },
              { id: 'pricing', label: 'Pricing Setup', icon: <DollarSign className="w-4 h-4" /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all relative",
                  activeTab === tab.id 
                    ? "bg-white dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-sm border border-slate-200 dark:border-purple-500/20" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-slate-50/50 dark:bg-transparent border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div className="relative flex-1">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
               type="text" 
               placeholder="Search NIS, Name, or Order ID..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 pr-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 w-full bg-white dark:bg-black/40 text-slate-800 dark:text-slate-200"
             />
           </div>
        </div>

        <div className="p-4 sm:p-6 bg-slate-50/50 dark:bg-transparent">
          {activeTab === 'orders' && renderOrders()}
          {activeTab === 'quotas' && renderQuotas()}
          {activeTab === 'history' && renderHistory()}
          {activeTab === 'labels' && renderLabels()}
          {activeTab === 'pricing' && renderPricing()}
        </div>
      </div>

      {/* New Order Modal */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                     <Shirt className="w-5 h-5" />
                   </div>
                   <div>
                     <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">New Laundry Order</h3>
                     <p className="text-xs text-slate-500">Record incoming laundry weight</p>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setScanType('student');
                      setIsScannerOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/10"
                  >
                    <ScanLine className="w-3.5 h-3.5" /> Scan ID
                  </button>
                  <button onClick={() => setIsNewOrderModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Santri Name</label>
                  <input 
                    type="text" 
                    value={newOrder.student}
                    onChange={(e) => setNewOrder({...newOrder, student: e.target.value})}
                    placeholder="Search by name or NIS..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">NIS</label>
                    <input 
                      type="text" 
                      value={newOrder.nis}
                      onChange={(e) => setNewOrder({...newOrder, nis: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Room</label>
                    <input 
                      type="text" 
                      value={newOrder.room}
                      onChange={(e) => setNewOrder({...newOrder, room: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Weight (kg)</label>
                    <input 
                      type="number" step="0.1"
                      value={newOrder.weight || ''}
                      onChange={(e) => setNewOrder({...newOrder, weight: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Pieces (Items)</label>
                    <input 
                      type="number" 
                      value={newOrder.pieces || ''}
                      onChange={(e) => setNewOrder({...newOrder, pieces: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Initial Status</label>
                  <select 
                    value={newOrder.status}
                    onChange={(e) => setNewOrder({...newOrder, status: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                  >
                    <option value="Received">Received</option>
                    <option value="Washing">Washing</option>
                    <option value="Ready">Ready</option>
                    <option value="Collected">Collected</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button onClick={() => setIsNewOrderModalOpen(false)} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleCreateOrder} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-purple-500/20">
                    Create Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quota Adjust Modal */}
      {isQuotaModalOpen && editingQuota && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                     <Users className="w-5 h-5" />
                   </div>
                   <div>
                     <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Adjust Santri Quota</h3>
                     <p className="text-xs text-slate-500">Modify limits and extra charges</p>
                   </div>
                </div>
                <button onClick={() => { setIsQuotaModalOpen(false); setEditingQuota(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Santri Name</label>
                  <input 
                    type="text" 
                    value={editingQuota.student}
                    disabled
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Monthly Limit (kg)</label>
                    <input 
                      type="number" step="0.1"
                      value={editingQuota.limit || ''}
                      onChange={(e) => setEditingQuota({...editingQuota, limit: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Used (kg)</label>
                    <input 
                      type="number" step="0.1"
                      value={editingQuota.used || ''}
                      onChange={(e) => setEditingQuota({...editingQuota, used: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Extra Charges (Rp)</label>
                  <input 
                    type="number" 
                    value={editingQuota.extraCharge || 0}
                    onChange={(e) => setEditingQuota({...editingQuota, extraCharge: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button onClick={() => { setIsQuotaModalOpen(false); setEditingQuota(null); }} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveQuota} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-purple-500/20">
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {isReceiptModalOpen && receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-black/90 border border-slate-200 dark:border-white/10 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-200 dark:border-white/10 border-dashed">
              <div className="text-center mb-6">
                <Shirt className="w-8 h-8 text-slate-800 dark:text-slate-200 mx-auto mb-2" />
                <h3 className="text-lg font-bold font-serif text-slate-800 dark:text-slate-200">AI Studio Boarding School</h3>
                <p className="text-xs text-slate-500">Official Laundry Receipt</p>
              </div>

              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Order ID</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{receiptData.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{receiptData.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Santri</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{receiptData.student}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NIS</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{receiptData.nis}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-white/10 border-dashed pt-4">
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-800 dark:text-slate-200">Total Weight</span>
                    <span className="text-slate-800 dark:text-slate-200">{receiptData.weight} kg</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 dark:bg-white/5">
              <div className="flex items-center justify-center mb-6">
                <QrCode className="w-24 h-24 text-slate-800 dark:text-slate-200 opacity-50" />
              </div>
              <p className="text-center text-xs text-slate-500 mb-6">Scan QR code to track next orders</p>
              
              <div className="flex gap-3">
                <button onClick={() => { setIsReceiptModalOpen(false); setReceiptData(null); }} className="flex-1 px-4 py-2.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors">
                  Close
                </button>
                <button 
                  onClick={() => {
                    alert('Printing receipt...');
                    setIsReceiptModalOpen(false);
                  }} 
                  className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm shadow-purple-500/20"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-purple-500" /> 
                {scanType === 'student' ? 'Scan Santri ID' : 'Scan Label Barcode'}
              </h3>
              <button onClick={() => setIsScannerOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="aspect-square bg-slate-900 rounded-xl overflow-hidden mb-4 relative">
                <Scanner onScan={handleScan} />
                <div className="absolute inset-0 border-2 border-purple-500/50 mix-blend-overlay pointer-events-none rounded-xl m-8"></div>
              </div>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Position the barcode inside the frame to scan.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

