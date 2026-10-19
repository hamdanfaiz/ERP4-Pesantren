import React, { useState } from 'react';
import { 
  Building2, School, Plus, Search, 
  ArrowRightLeft, Users, Wallet, 
  LayoutDashboard, Building, MapPin, 
  ArrowUpRight, ArrowDownRight,
  Stethoscope, Store, AlertTriangle, CheckCircle2,
  X, Receipt, Activity, TrendingUp, FileText, Filter, Download
} from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';

// Shared state for demo purposes within the component
const MOCK_UNITS = [
  { id: 'U-001', name: "Pesantren Pusat (Boarding)", type: "Pesantren", loc: "Kampus 1, Jakarta", status: "Active" },
  { id: 'U-002', name: "Pesantren Cabang", type: "Pesantren", loc: "Kampus 2, Bogor", status: "Active" },
  { id: 'U-003', name: "SMA IT Bina Nusantara", type: "Formal School", loc: "Kampus 1, Jakarta", status: "Active" },
  { id: 'U-004', name: "SMP IT Bina Nusantara", type: "Formal School", loc: "Kampus 1, Jakarta", status: "Active" },
  { id: 'U-005', name: "Klinik Pratama", type: "Healthcare", loc: "Kampus 1, Jakarta", status: "Active" },
  { id: 'U-006', name: "Kopontren", type: "Business Unit", loc: "Kampus 1 & 2", status: "Active" },
];

const MOCK_TRANSFERS = [
  { id: 'TR-1001', date: "2026-10-12", desc: "Ahmad Fauzan moved from SMP IT to SMA IT", type: "Student", status: "Completed" },
  { id: 'TR-1002', date: "2026-10-10", desc: "Ustadz Budi reassigned from Kampus 1 to Kampus 2", type: "Staff", status: "Completed" }
];

const MOCK_BILLS = [
  { id: 'INV-1001', date: '2026-10-15', from: 'U-006', fromName: 'Kopontren', to: 'U-001', toName: 'Pesantren Pusat (Boarding)', desc: 'Monthly catering supplies', amount: 'Rp 45.000.000', status: 'Pending' },
  { id: 'INV-1002', date: '2026-10-14', from: 'U-005', fromName: 'Klinik Pratama', to: 'U-003', toName: 'SMA IT Bina Nusantara', desc: 'Medical checkup for new students', amount: 'Rp 8.500.000', status: 'Paid' },
  { id: 'INV-1003', date: '2026-10-12', from: 'U-001', fromName: 'Pesantren Pusat (Boarding)', to: 'U-002', toName: 'Pesantren Cabang', desc: 'Central curriculum cross-charge', amount: 'Rp 12.000.000', status: 'Paid' },
];

export function EnterpriseManager() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [units, setUnits] = useState(MOCK_UNITS);
  const [transfers, setTransfers] = useState(MOCK_TRANSFERS);
  const [bills, setBills] = useState(MOCK_BILLS);

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-slate-800 dark:text-slate-200 border-b-2 border-emerald-500/50 pb-1 inline-block">Enterprise Foundation</h1>
          <p className="text-slate-500 text-sm mt-2">Manage yayasan, multi-unit education, and inter-entity operations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-black/40  rounded-lg p-1 flex items-center border border-slate-200 dark:border-white/5 shadow-sm">
             <span className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Yayasan Bina Nusantara</span>
             <span className="px-3 py-1.5 text-xs font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-md">HQ</span>
          </div>
        </div>
      </div>

      <div className="bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 overflow-x-auto">
          <div className="flex p-2 gap-2 min-w-max">
            {[
              { id: 'dashboard', label: 'Consolidated Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
              { id: 'units', label: 'Multi-Unit Registry', icon: <Building2 className="w-4 h-4" /> },
              { id: 'transfers', label: 'Inter-Unit Transfers', icon: <ArrowRightLeft className="w-4 h-4" /> },
              { id: 'billing', label: 'Inter-Unit Billing', icon: <Receipt className="w-4 h-4" /> },
              { id: 'analytics', label: 'Financial Analytics', icon: <Activity className="w-4 h-4" /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative",
                  activeTab === tab.id 
                    ? "bg-emerald-500 text-white shadow-sm" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'dashboard' && <DashboardView units={units} />}
        {activeTab === 'units' && <UnitRegistryView units={units} setUnits={setUnits} />}
        {activeTab === 'transfers' && <TransferView transfers={transfers} setTransfers={setTransfers} units={units} />}
        {activeTab === 'billing' && <InterUnitBillingView bills={bills} setBills={setBills} units={units} />}
        {activeTab === 'analytics' && <FinancialAnalyticsView />}
      </div>
    </div>
  );
}

function DashboardView({ units }: { units: typeof MOCK_UNITS }) {
  const Kpis = [
    { label: "Total Active Students", value: "3,450", trend: "+120 this year", icon: Users, color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/10" },
    { label: "Total Teachers & Staff", value: "285", trend: "+12 this month", icon: Building, color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/10" },
    { label: "Consolidated Cash Position", value: "Rp 4.2B", trend: "+15% YoY", icon: Wallet, color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/10" },
    { label: "Total Managed Units", value: units.length.toString(), trend: "Active entities", icon: Building2, color: "text-purple-500 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-500/10" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Kpis.map((kpi, i) => (
          <div key={i} className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-black/20 flex flex-col gap-3 relative overflow-hidden">
             <div className="flex justify-between items-start">
                <div className={cn("p-2 rounded-lg", kpi.bg)}>
                  <kpi.icon className={cn("w-5 h-5", kpi.color)} />
                </div>
             </div>
             <div>
               <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{kpi.label}</p>
               <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">{kpi.value}</h3>
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.trend}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2 p-6 rounded-xl border border-slate-200 dark:border-white/5 bg-black/20">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-6 uppercase tracking-wider">Unit Distribution</h3>
             <div className="space-y-4">
               {[
                 { name: "Pesantren Pusat (Boarding)", students: 1200, revenue: "Rp 1.5B" },
                 { name: "SMA IT Bina Nusantara", students: 850, revenue: "Rp 1.2B" },
                 { name: "SMP IT Bina Nusantara", students: 950, revenue: "Rp 1.0B" },
                 { name: "Klinik Pratama Bina Sehat", students: "-", revenue: "Rp 300M" },
                 { name: "Kopontren & Unit Usaha", students: "-", revenue: "Rp 200M" },
               ].map((unit, j) => (
                  <div key={j} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
                     <div className="flex items-center gap-3">
                        <School className="w-5 h-5 text-slate-500" />
                        <div>
                           <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{unit.name}</p>
                        </div>
                     </div>
                     <div className="flex gap-8 text-right">
                        <div>
                          <p className="text-xs text-slate-500">Students</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{unit.students}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Revenue (YTD)</p>
                          <p className="text-sm text-emerald-400 font-medium">{unit.revenue}</p>
                        </div>
                     </div>
                  </div>
               ))}
             </div>
         </div>
         <div className="p-6 rounded-xl border border-slate-200 dark:border-white/5 bg-black/20 flex flex-col items-center justify-center text-center">
            <div className="w-32 h-32 rounded-full border-4 border-slate-800 border-t-emerald-500 border-r-emerald-500 border-b-blue-500 flex items-center justify-center mb-4 relative">
               <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Tahfidz<br/><span className="text-2xl text-emerald-400">78%</span></div>
            </div>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Tahfidz Target Achievement</h3>
            <p className="text-xs text-slate-500 mt-2">Consolidated across all boarding & academic units</p>
            <button className="mt-6 text-emerald-400 text-xs font-medium hover:text-emerald-300 transition-colors flex items-center gap-1">
              View Detailed Analytics <ArrowUpRight className="w-3 h-3" />
            </button>
         </div>
      </div>
    </div>
  );
}

function UnitRegistryView({ units, setUnits }: { units: any[], setUnits: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUnit, setNewUnit] = useState({ name: '', type: 'Pesantren', loc: '', status: 'Active' });
  const [search, setSearch] = useState('');

  const handleAddUnit = () => {
    if (!newUnit.name || !newUnit.loc) return;
    const added = {
      ...newUnit,
      id: `U-00${units.length + 1}`,
    };
    setUnits([...units, added]);
    setIsModalOpen(false);
    setNewUnit({ name: '', type: 'Pesantren', loc: '', status: 'Active' });
  };

  const getIcon = (type: string) => {
    if (type === 'Pesantren') return School;
    if (type === 'Healthcare') return Stethoscope;
    if (type === 'Business Unit') return Store;
    return Building;
  };

  const filteredUnits = units.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.type.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6">
       <div className="flex justify-between items-center mb-6">
         <div className="relative">
           <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
           <input 
             type="text" 
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             placeholder="Search entities, schools, clinics..."
             className="pl-9 pr-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 w-full sm:w-80 bg-slate-50 dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300"
           />
         </div>
         <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-sm shadow-emerald-500/20">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Entity</span>
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUnits.map((u, i) => {
             const Icon = getIcon(u.type);
             return (
               <div key={i} className="p-5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition-colors shadow-sm cursor-pointer group">
                  <div className="flex justify-between items-start mb-4">
                     <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                        <Icon className="w-5 h-5" />
                     </div>
                     <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 tracking-wider">
                       {u.status}
                     </span>
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">{u.name}</h3>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mb-3">{u.type}</p>
                  <div className="flex items-center gap-1 text-slate-500 text-xs">
                     <MapPin className="w-3 h-3" />
                     {u.loc}
                  </div>
               </div>
             );
          })}
       </div>

       {/* Add Unit Modal */}
       {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-500" />
                Add New Entity
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Entity Name</label>
                <input 
                  type="text" 
                  value={newUnit.name}
                  onChange={e => setNewUnit({...newUnit, name: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                  placeholder="e.g. Kampus 3 Bandung"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                  <select
                    value={newUnit.type}
                    onChange={e => setNewUnit({...newUnit, type: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                  >
                    <option value="Pesantren">Pesantren</option>
                    <option value="Formal School">Formal School</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Business Unit">Business Unit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={newUnit.status}
                    onChange={e => setNewUnit({...newUnit, status: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                  >
                    <option value="Active">Active</option>
                    <option value="Planning">Planning</option>
                    <option value="Construction">Construction</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Location / Address</label>
                <input 
                  type="text" 
                  value={newUnit.loc}
                  onChange={e => setNewUnit({...newUnit, loc: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                  placeholder="e.g. Jl. Raya Bogor"
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors">
                  Cancel
                </button>
                <button onClick={handleAddUnit} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-emerald-500/20">
                  Save Entity
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TransferView({ transfers, setTransfers, units }: { transfers: any[], setTransfers: any, units: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transferType, setTransferType] = useState('Student');
  const [newTransfer, setNewTransfer] = useState({
    name: '',
    fromUnit: '',
    toUnit: '',
  });

  const handleCreateTransfer = () => {
    if (!newTransfer.name || !newTransfer.fromUnit || !newTransfer.toUnit) return;
    
    // Convert unit IDs to names for description
    const fromName = units.find(u => u.id === newTransfer.fromUnit)?.name || newTransfer.fromUnit;
    const toName = units.find(u => u.id === newTransfer.toUnit)?.name || newTransfer.toUnit;

    const added = {
      id: generateUniqueId('Transfer', []),
      date: new Date().toISOString().split('T')[0],
      desc: `${newTransfer.name} moved from ${fromName} to ${toName}`,
      type: transferType,
      status: "Pending" // Initial state
    };
    setTransfers([added, ...transfers]);
    setIsModalOpen(false);
    setNewTransfer({ name: '', fromUnit: '', toUnit: '' });
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-6">
         <div className="flex justify-between pb-4 border-b border-slate-200 dark:border-white/5">
            <h3 className="font-medium text-slate-800 dark:text-slate-200">Inter-Unit Operations</h3>
         </div>
         
         <div className="grid grid-cols-2 gap-4 text-center">
            <div onClick={() => { setTransferType('Student'); setIsModalOpen(true); }} className="p-6 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-colors cursor-pointer group">
               <Users className="w-8 h-8 text-blue-500 dark:text-blue-400 mx-auto mb-3 group-hover:scale-110 transition-transform" />
               <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm">Student Transfer</h4>
               <p className="text-xs text-slate-500 mt-1">Move students between schools or branches</p>
            </div>
            <div onClick={() => { setTransferType('Staff'); setIsModalOpen(true); }} className="p-6 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-colors cursor-pointer group">
               <Building2 className="w-8 h-8 text-amber-500 dark:text-amber-400 mx-auto mb-3 group-hover:scale-110 transition-transform" />
               <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm">Staff Mutation</h4>
               <p className="text-xs text-slate-500 mt-1">Reassign teachers/staff to other units</p>
            </div>
         </div>

         <div className="p-5 rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.01] mt-8 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Recent Transfer Logs</h4>
            <div className="space-y-3">
               {transfers.map((log: any, i: number) => (
                 <div key={i} className="flex justify-between items-center text-sm py-3 border-b border-slate-100 dark:border-white/5 last:border-0">
                    <div className="flex flex-col">
                       <span className="text-slate-700 dark:text-slate-300 font-medium">{log.desc}</span>
                       <div className="flex items-center gap-2 mt-1">
                         <span className="text-xs text-slate-500">{log.type} Transfer</span>
                         <span className={cn(
                           "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded",
                           log.status === 'Completed' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" :
                           "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                         )}>
                           {log.status}
                         </span>
                       </div>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{log.date}</span>
                 </div>
               ))}
               {transfers.length === 0 && (
                 <div className="text-center py-6 text-slate-500 text-sm">No transfer logs available</div>
               )}
            </div>
         </div>
      </div>

      {/* Transfer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-emerald-500" />
                New {transferType} Transfer
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{transferType} Name</label>
                <input 
                  type="text" 
                  value={newTransfer.name}
                  onChange={e => setNewTransfer({...newTransfer, name: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                  placeholder="e.g. Ahmad Fauzan"
                />
              </div>
              
              <div className="space-y-3 relative">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">From Unit</label>
                  <select
                    value={newTransfer.fromUnit}
                    onChange={e => setNewTransfer({...newTransfer, fromUnit: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">Select origin unit...</option>
                    {units.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex justify-center -my-2 relative z-10">
                   <div className="bg-emerald-50 dark:bg-emerald-900/30 p-1.5 rounded-full border border-emerald-100 dark:border-emerald-800/50">
                     <ArrowDownRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                   </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">To Unit</label>
                  <select
                    value={newTransfer.toUnit}
                    onChange={e => setNewTransfer({...newTransfer, toUnit: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">Select destination unit...</option>
                    {units.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors">
                  Cancel
                </button>
                <button onClick={handleCreateTransfer} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-emerald-500/20">
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InterUnitBillingView({ bills, setBills, units }: { bills: any[], setBills: any, units: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBill, setNewBill] = useState({
    from: '',
    to: '',
    desc: '',
    amount: ''
  });

  const handleCreateBill = () => {
    if (!newBill.from || !newBill.to || !newBill.desc || !newBill.amount) return;
    
    const fromName = units.find(u => u.id === newBill.from)?.name || newBill.from;
    const toName = units.find(u => u.id === newBill.to)?.name || newBill.to;

    const added = {
      id: generateUniqueId('Invoice', []),
      date: new Date().toISOString().split('T')[0],
      from: newBill.from,
      fromName,
      to: newBill.to,
      toName,
      desc: newBill.desc,
      amount: newBill.amount,
      status: "Pending"
    };

    setBills([added, ...bills]);
    setIsModalOpen(false);
    setNewBill({ from: '', to: '', desc: '', amount: '' });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
         <div>
           <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Inter-Unit Billing</h2>
           <p className="text-sm text-slate-500">Manage internal invoices and cross-charges between entities</p>
         </div>
         <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-sm shadow-emerald-500/20">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Invoice</span>
         </button>
      </div>

      <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse">
             <thead>
               <tr className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/5">
                 <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Invoice ID</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Date</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Billing From</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Billing To</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Description</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Amount</th>
                 <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {bills.map((bill: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                     <td className="p-4 font-mono text-sm text-slate-700 dark:text-slate-300">{bill.id}</td>
                     <td className="p-4 text-sm text-slate-600 dark:text-slate-400">{bill.date}</td>
                     <td className="p-4 text-sm text-slate-800 dark:text-slate-200 font-medium">{bill.fromName}</td>
                     <td className="p-4 text-sm text-slate-800 dark:text-slate-200 font-medium">{bill.toName}</td>
                     <td className="p-4 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate" title={bill.desc}>{bill.desc}</td>
                     <td className="p-4 text-sm font-semibold text-slate-800 dark:text-slate-200 text-right">{bill.amount}</td>
                     <td className="p-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider",
                          bill.status === 'Paid' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                          "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                        )}>
                          {bill.status}
                        </span>
                     </td>
                  </tr>
                ))}
                {bills.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 dark:text-slate-400">No billing records found.</td>
                  </tr>
                )}
             </tbody>
           </table>
         </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-500" /> Create Internal Invoice
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-500">
                  <X className="w-4 h-4" />
                </button>
             </div>
             <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Billing From</label>
                     <select
                       value={newBill.from}
                       onChange={e => setNewBill({...newBill, from: e.target.value})}
                       className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                     >
                       <option value="">Select unit...</option>
                       {units.map((u: any) => (
                         <option key={u.id} value={u.id}>{u.name}</option>
                       ))}
                     </select>
                   </div>
                   <div>
                     <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Billing To</label>
                     <select
                       value={newBill.to}
                       onChange={e => setNewBill({...newBill, to: e.target.value})}
                       className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                     >
                       <option value="">Select unit...</option>
                       {units.map((u: any) => (
                         <option key={u.id} value={u.id}>{u.name}</option>
                       ))}
                     </select>
                   </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <input
                    type="text"
                    value={newBill.desc}
                    onChange={e => setNewBill({...newBill, desc: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                    placeholder="e.g. Monthly catering for 500 students"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Amount</label>
                  <input
                    type="text"
                    value={newBill.amount}
                    onChange={e => setNewBill({...newBill, amount: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200 font-mono"
                    placeholder="e.g. Rp 15.000.000"
                  />
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleCreateBill} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-emerald-500/20">
                    Create Invoice
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinancialAnalyticsView() {
  return (
    <div className="p-6 space-y-6">
       <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/5">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Consolidated Financials</h2>
            <p className="text-sm text-slate-500">Yayasan Bina Nusantara - Q3 2026 Overview</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/10">
               <Filter className="w-4 h-4" /> Filter
            </button>
            <button className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/10">
               <Download className="w-4 h-4" /> Export
            </button>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl">
             <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Total Revenue</h3>
             </div>
             <p className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">Rp 12.4B</p>
             <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
               <ArrowUpRight className="w-4 h-4" /> +18.5% <span className="text-slate-500 text-xs font-normal">vs last quarter</span>
             </p>
          </div>
          <div className="p-6 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl">
             <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Total Expenses</h3>
             </div>
             <p className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">Rp 8.2B</p>
             <p className="text-sm text-red-500 flex items-center gap-1 font-medium">
               <ArrowUpRight className="w-4 h-4" /> +5.2% <span className="text-slate-500 text-xs font-normal">vs last quarter</span>
             </p>
          </div>
          <div className="p-6 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl">
             <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Wallet className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Net Margin</h3>
             </div>
             <p className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">33.8%</p>
             <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
               <ArrowUpRight className="w-4 h-4" /> +2.1% <span className="text-slate-500 text-xs font-normal">vs last quarter</span>
             </p>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm">
             <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-6 uppercase tracking-wider">Revenue by Entity</h3>
             <div className="space-y-4">
               {[
                 { name: "Pesantren Pusat (Boarding)", value: "Rp 6.5B", pct: "52%" },
                 { name: "SMA IT Bina Nusantara", value: "Rp 3.2B", pct: "26%" },
                 { name: "SMP IT Bina Nusantara", value: "Rp 1.8B", pct: "15%" },
                 { name: "Kopontren & Unit Usaha", value: "Rp 0.5B", pct: "4%" },
                 { name: "Klinik Pratama", value: "Rp 0.4B", pct: "3%" },
               ].map((item, i) => (
                 <div key={i}>
                    <div className="flex justify-between items-end mb-1.5">
                       <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
                       <div className="text-right">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.value}</span>
                          <span className="text-xs text-slate-500 ml-2">({item.pct})</span>
                       </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-2 overflow-hidden">
                       <div className="bg-emerald-500 h-2 rounded-full" style={{ width: item.pct }}></div>
                    </div>
                 </div>
               ))}
             </div>
          </div>
          <div className="p-6 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm flex flex-col justify-center items-center text-center">
             <div className="w-full max-w-sm h-48 border-b-2 border-l-2 border-slate-200 dark:border-white/10 relative flex items-end justify-between px-2 pt-2 pb-0">
               {[40, 60, 45, 80, 65, 95].map((h, i) => (
                 <div key={i} className="w-10 bg-emerald-500/80 rounded-t-sm hover:bg-emerald-400 transition-colors cursor-pointer group relative" style={{ height: `${h}%` }}>
                   <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                     Month {i + 1}
                   </div>
                 </div>
               ))}
             </div>
             <div className="flex w-full max-w-sm justify-between px-2 mt-3 text-xs text-slate-500 font-medium">
                <span>Jan</span>
                <span>Feb</span>
                <span>Mar</span>
                <span>Apr</span>
                <span>May</span>
                <span>Jun</span>
             </div>
             <p className="mt-6 text-sm text-slate-700 dark:text-slate-300 font-medium">H1 2026 Consolidated Cash Flow Trend</p>
          </div>
       </div>
    </div>
  );
}

