import React, { useState, useMemo } from 'react';
import { 
  CreditCard, Smartphone, Zap, Droplet, Heart, Navigation, Users, Search, 
  Filter, Plus, ArrowRight, ShieldCheck, Clock, CheckCircle2, Globe, TrendingUp, HandHeart, Activity, Wallet, PieChart as PieIcon, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

const PPOB_SERVICES = [
  { label: 'Pulsa & Data', icon: Smartphone, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20' },
  { label: 'Token PLN', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/20' },
  { label: 'Tagihan PDAM', icon: Droplet, color: 'text-cyan-500', bg: 'bg-cyan-100 dark:bg-cyan-500/20' },
  { label: 'BPJS Kesehatan', icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
  { label: 'E-Wallet Topup', icon: Wallet, color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-500/20' },
  { label: 'Internet / ISP', icon: Globe, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-500/20' },
];

const PPOB_TRANSACTIONS = [
  { id: 'TX-9901', type: 'PLN Token', account: '12345678901', customer: 'Budi Santoso', amount: 100000, date: '2026-06-16 08:15', status: 'Success' },
  { id: 'TX-9902', type: 'Telkomsel Data', account: '081234567890', customer: 'Ahmad Muzakki', amount: 50000, date: '2026-06-16 09:30', status: 'Success' },
  { id: 'TX-9903', type: 'PDAM Tirta', account: '00321456', customer: 'Umar Al-Khattab', amount: 125000, date: '2026-06-16 10:45', status: 'Pending' },
  { id: 'TX-9904', type: 'Indosat Pulsa', account: '085678912345', customer: 'Rudi Al-Fatih', amount: 25000, date: '2026-06-16 11:20', status: 'Failed' },
  { id: 'TX-9905', type: 'BPJS Kesehatan', account: '0001234567890', customer: 'Fatimah Az-Zahra', amount: 150000, date: '2026-06-16 13:10', status: 'Success' },
  { id: 'TX-9906', type: 'ShopeePay Topup', account: '0812893847', customer: 'Hj. Siti', amount: 300000, date: '2026-06-16 14:05', status: 'Success' }
];

const ZISWAF_CAMPAIGNS = [
  { id: 'ZIS-001', name: 'Pembangunan Masjid As-Salam', category: 'Wakaf', target: 500000000, collected: 350000000, donors: 125, deadline: '2026-12-31' },
  { id: 'ZIS-002', name: 'Zakat Fitrah & Maal 1445 H', category: 'Zakat', target: 200000000, collected: 185000000, donors: 450, deadline: '2026-06-30' },
  { id: 'ZIS-003', name: 'Infaq Yatim Piatu Bulanan', category: 'Infaq', target: 50000000, collected: 42000000, donors: 85, deadline: '2026-07-15' },
  { id: 'ZIS-004', name: 'Wakaf Sumur Bor & Sanitasi', category: 'Wakaf', target: 120000000, collected: 12000000, donors: 14, deadline: '2027-01-31' },
];

const SAVINGS_PLANS = [
  { id: 'SAV-001', name: 'Abdullah Al-Fatih', type: 'Student', plan: 'Umroh Reguler', target: 35000000, balance: 15000000, lastDeposit: '2026-06-10', progress: 42, status: 'Active' },
  { id: 'SAV-002', name: 'Budi Santoso', type: 'Parent', plan: 'Qurban Sapi', target: 25000000, balance: 25000000, lastDeposit: '2026-06-01', progress: 100, status: 'Completed' },
  { id: 'SAV-003', name: 'Alumni Angkatan 25', type: 'Group', plan: 'Wakaf Kolektif', target: 150000000, balance: 45000000, lastDeposit: '2026-06-15', progress: 30, status: 'Active' },
  { id: 'SAV-004', name: 'Siti Rahma', type: 'Staff', plan: 'Haji Kuota', target: 55000000, balance: 21000000, lastDeposit: '2026-05-25', progress: 38, status: 'Active' },
];

const ZISWAF_DATA = [
  { name: 'Wakaf', value: 45 },
  { name: 'Zakat', value: 35 },
  { name: 'Infaq', value: 20 },
];
const COLORS = ['#8b5cf6', '#3b82f6', '#10b981'];

const MONTHLY_PPOB = [
  { name: 'Jan', vol: 4000000 },
  { name: 'Feb', vol: 3000000 },
  { name: 'Mar', vol: 5000000 },
  { name: 'Apr', vol: 4500000 },
  { name: 'May', vol: 6000000 },
  { name: 'Jun', vol: 8000000 },
];

type Tab = 'dashboard' | 'ppob' | 'ziswaf' | 'savings';

export function EcosystemManager() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Interactive states
  const [ppobTransactions, setPpobTransactions] = useState(PPOB_TRANSACTIONS);
  const [ziswafCampaigns, setZiswafCampaigns] = useState(ZISWAF_CAMPAIGNS);
  const [savingsPlans, setSavingsPlans] = useState(SAVINGS_PLANS);

  // Modals state
  const [isPpobModalOpen, setIsPpobModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(PPOB_SERVICES[0]);
  const [ppobForm, setPpobForm] = useState({ account: '', customer: '', amount: 50000 });

  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: '', category: 'Wakaf', target: 100000000, deadline: '2026-12-31' });

  const [isManageCampaignModalOpen, setIsManageCampaignModalOpen] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<any>(null);
  const [donationAmount, setDonationAmount] = useState<number>(500000);

  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ name: '', type: 'Student', plan: 'Umroh Reguler', target: 35000000, initialDeposit: 2500000 });

  const handleOpenPpob = (service: any) => {
    setSelectedService(service);
    setIsPpobModalOpen(true);
  };

  const handleExecutePpob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ppobForm.account || !ppobForm.customer) return;

    const newTx = {
      id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
      type: selectedService.label,
      account: ppobForm.account,
      customer: ppobForm.customer,
      amount: Number(ppobForm.amount),
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      status: 'Success'
    };

    setPpobTransactions([newTx, ...ppobTransactions]);
    setPpobForm({ account: '', customer: '', amount: 50000 });
    setIsPpobModalOpen(false);
  };

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.name) return;

    const newCamp = {
      id: `ZIS-${String(ziswafCampaigns.length + 1).padStart(3, '0')}`,
      name: campaignForm.name,
      category: campaignForm.category,
      target: Number(campaignForm.target),
      collected: 0,
      donors: 0,
      deadline: campaignForm.deadline
    };

    setZiswafCampaigns([newCamp, ...ziswafCampaigns]);
    setCampaignForm({ name: '', category: 'Wakaf', target: 100000000, deadline: '2026-12-31' });
    setIsNewCampaignModalOpen(false);
  };

  const handleAddCampaignDonation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCampaign || !donationAmount) return;

    setZiswafCampaigns(ziswafCampaigns.map(c => {
      if (c.id === activeCampaign.id) {
        return {
          ...c,
          collected: c.collected + Number(donationAmount),
          donors: c.donors + 1
        };
      }
      return c;
    }));
    setIsManageCampaignModalOpen(false);
    setActiveCampaign(null);
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.name) return;

    const newPlan = {
      id: `SAV-${String(savingsPlans.length + 1).padStart(3, '0')}`,
      name: planForm.name,
      type: planForm.type,
      plan: planForm.plan,
      target: Number(planForm.target),
      balance: Number(planForm.initialDeposit),
      lastDeposit: new Date().toISOString().slice(0, 10),
      progress: Math.min(100, Math.round((Number(planForm.initialDeposit) / Number(planForm.target)) * 100)),
      status: Number(planForm.initialDeposit) >= Number(planForm.target) ? 'Completed' : 'Active'
    };

    setSavingsPlans([newPlan, ...savingsPlans]);
    setPlanForm({ name: '', type: 'Student', plan: 'Umroh Reguler', target: 35000000, initialDeposit: 2500000 });
    setIsNewPlanModalOpen(false);
  };

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
             <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
               <Zap className="w-6 h-6" />
             </div>
             <div>
               <p className="text-sm text-slate-500 font-medium">PPOB Trx Vol (YTD)</p>
               <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Rp 124.5M</h4>
             </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
             <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
               <HandHeart className="w-6 h-6" />
             </div>
             <div>
               <p className="text-sm text-slate-500 font-medium">ZISWAF Collected</p>
               <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Rp 589M</h4>
             </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
             <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
               <Navigation className="w-6 h-6" />
             </div>
             <div>
               <p className="text-sm text-slate-500 font-medium">Savings / Tabungan AUM</p>
               <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Rp 1.2B</h4>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
             <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" /> PPOB Monthly Volume
             </h3>
             <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={MONTHLY_PPOB} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                     <defs>
                       <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                         <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => `${val/1000000}M`} />
                     <RechartsTooltip contentStyle={{ backgroundColor: 'rgb(30, 41, 59)', border: 'none', borderRadius: '8px', color: '#fff' }} />
                     <Area type="monotone" dataKey="vol" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVol)" />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm flex flex-col">
             <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-emerald-500" /> ZISWAF Fund Distribution
             </h3>
             <div className="flex-1 min-h-[250px] relative">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={ZISWAF_DATA}
                     cx="50%"
                     cy="50%"
                     innerRadius={70}
                     outerRadius={100}
                     paddingAngle={5}
                     dataKey="value"
                     stroke="none"
                   >
                     {ZISWAF_DATA.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                     ))}
                   </Pie>
                   <RechartsTooltip 
                     contentStyle={{ backgroundColor: 'rgb(30, 41, 59)', border: 'none', borderRadius: '8px', color: '#fff' }}
                   />
                   <Legend verticalAlign="bottom" height={36} iconType="circle" />
                 </PieChart>
               </ResponsiveContainer>
             </div>
          </div>
       </div>
    </div>
  );

  const filteredPpob = ppobTransactions.filter(tx => 
    tx.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    tx.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tx.account.includes(searchQuery) ||
    tx.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderPPOB = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {PPOB_SERVICES.map((service, idx) => (
          <button 
            key={idx} 
            onClick={() => handleOpenPpob(service)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 hover:shadow-md transition-all group text-left cursor-pointer"
          >
            <div className={cn("p-4 rounded-full transition-transform group-hover:scale-110", service.bg)}>
              <service.icon className={cn("w-6 h-6", service.color)} />
            </div>
            <span className="font-semibold text-xs text-center text-slate-700 dark:text-slate-300">{service.label}</span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Beli / Bayar →</span>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800">
           <h3 className="font-bold text-slate-800 dark:text-slate-200">Recent Transactions</h3>
           <div className="relative">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
               type="text" 
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               placeholder="Search Trx ID, Customer..." 
               className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
             />
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Transaction ID</th>
                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Service</th>
                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Customer / Target</th>
                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Date</th>
                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300 text-right">Amount (Rp)</th>
                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPpob.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-blue-600 dark:text-blue-400 font-semibold">{tx.id}</td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{tx.type}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{tx.customer}</div>
                    <div className="text-xs text-slate-500">{tx.account}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{tx.date}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-200">{tx.amount.toLocaleString('id-ID')}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1",
                      tx.status === 'Success' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : 
                      tx.status === 'Pending' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                    )}>
                      {tx.status === 'Success' && <CheckCircle2 className="w-3 h-3" />}
                      {tx.status === 'Pending' && <Clock className="w-3 h-3" />}
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredPpob.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">
                    Tidak ada transaksi PPOB yang sesuai.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderZISWAF = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
         <div className="flex gap-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">ZISWAF Campaigns</h2>
         </div>
         <button 
           onClick={() => setIsNewCampaignModalOpen(true)}
           className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition text-sm flex items-center gap-2 shadow-sm cursor-pointer"
         >
            <Plus className="w-4 h-4" /> New Campaign
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ziswafCampaigns.map(campaign => {
          const progress = Math.min(100, (campaign.collected / campaign.target) * 100);
          return (
            <div key={campaign.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl hover:border-emerald-500/30 transition-colors shadow-sm flex flex-col group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-md mb-3 inline-block",
                    campaign.category === 'Wakaf' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' :
                    campaign.category === 'Zakat' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                  )}>
                    {campaign.category}
                  </span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-lg group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{campaign.name}</h4>
                  <div className="text-xs text-slate-500 flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {campaign.donors} Donors</span>
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><Clock className="w-3.5 h-3.5" /> Ends {campaign.deadline}</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                 <div className="flex justify-between items-end mb-2">
                   <div>
                     <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Rp {(campaign.collected/1000000).toFixed(1)}M</div>
                     <div className="text-xs text-slate-500">Collected</div>
                   </div>
                   <div className="text-right">
                     <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Rp {(campaign.target/1000000).toFixed(0)}M</div>
                     <div className="text-xs text-slate-500">Goal</div>
                   </div>
                 </div>
                 <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                   <div 
                     className={cn("h-full rounded-full transition-all", progress >= 100 ? "bg-emerald-500" : "bg-emerald-500")} 
                     style={{ width: `${progress}%` }}
                   ></div>
                 </div>
                 <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-500">{progress.toFixed(1)}% Funded</span>
                    <button 
                      onClick={() => { setActiveCampaign(campaign); setIsManageCampaignModalOpen(true); }}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Kelola Donasi →
                    </button>
                 </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSavings = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
         <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Umroh, Hajj & Qurban Plans</h2>
         <button 
           onClick={() => setIsNewPlanModalOpen(true)}
           className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition text-sm flex items-center gap-2 shadow-sm cursor-pointer"
         >
            <Plus className="w-4 h-4" /> Create Plan
         </button>
      </div>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Participant / Group</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Plan Focus</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Last Action</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 w-1/4">Progress Track</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {savingsPlans.map(plan => (
                <tr key={plan.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                     <div className="font-bold text-slate-800 dark:text-slate-200">{plan.name}</div>
                     <div className="text-xs text-slate-500">{plan.type} • {plan.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-indigo-600 dark:text-indigo-400">{plan.plan}</div>
                    <div className="text-xs text-slate-500">Goal: Rp {plan.target.toLocaleString('id-ID')}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 text-xs"><Clock className="w-3 h-3"/> Dep: {plan.lastDeposit}</div>
                  </td>
                  <td className="px-6 py-4 min-w-[200px]">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Rp {(plan.balance/1000000).toFixed(1)}M</span>
                      <span className="text-[10px] font-bold text-slate-500">{plan.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all", plan.progress === 100 ? "bg-emerald-500" : "bg-indigo-500")}
                        style={{ width: `${plan.progress}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider relative",
                      plan.status === 'Completed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                    )}>
                      {plan.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Globe className="w-8 h-8 text-blue-500" />
            Ecosystem Services & PPOB
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Administer PPOB utility transactions, empower ZISWAF collections, and manage future-savings plans.
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto w-full md:w-auto">
          {(['dashboard', 'ppob', 'ziswaf', 'savings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap",
                activeTab === tab 
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              {tab === 'ppob' ? 'PPOB Manager' : tab === 'ziswaf' ? 'ZISWAF Gateway' : tab.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'ppob' && renderPPOB()}
        {activeTab === 'ziswaf' && renderZISWAF()}
        {activeTab === 'savings' && renderSavings()}
      </div>

      {/* PPOB Transaction Modal */}
      {isPpobModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsPpobModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <selectedService.icon className={cn("w-5 h-5", selectedService.color)} />
                Transaksi: {selectedService.label}
              </h3>
              <button onClick={() => setIsPpobModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExecutePpob} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nama Pelanggan / Santri
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="Contoh: Budi Santoso"
                  value={ppobForm.customer}
                  onChange={e => setPpobForm({ ...ppobForm, customer: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  No. Meter / ID Pelanggan / No. HP
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="0812xxxx atau 140xxxx"
                  value={ppobForm.account}
                  onChange={e => setPpobForm({ ...ppobForm, account: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nominal / Paket (Rp)
                </label>
                <select 
                  value={ppobForm.amount}
                  onChange={e => setPpobForm({ ...ppobForm, amount: Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value={25000}>Rp 25.000</option>
                  <option value={50000}>Rp 50.000</option>
                  <option value={100000}>Rp 100.000</option>
                  <option value={200000}>Rp 200.000</option>
                  <option value={500000}>Rp 500.000</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsPpobModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400">
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">
                  Proses Transaksi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Campaign Modal */}
      {isNewCampaignModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsNewCampaignModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" /> Buat Campaign ZISWAF Baru
              </h3>
              <button onClick={() => setIsNewCampaignModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCampaign} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nama Campaign
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="Contoh: Wakaf Pembebasan Lahan Asrama"
                  value={campaignForm.name}
                  onChange={e => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Kategori
                </label>
                <select 
                  value={campaignForm.category}
                  onChange={e => setCampaignForm({ ...campaignForm, category: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="Wakaf">Wakaf</option>
                  <option value="Zakat">Zakat</option>
                  <option value="Infaq">Infaq</option>
                  <option value="Sedekah">Sedekah</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Target Dana (Rp)
                  </label>
                  <input 
                    type="number" 
                    required 
                    value={campaignForm.target}
                    onChange={e => setCampaignForm({ ...campaignForm, target: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Batas Waktu (Deadline)
                  </label>
                  <input 
                    type="date" 
                    value={campaignForm.deadline}
                    onChange={e => setCampaignForm({ ...campaignForm, deadline: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsNewCampaignModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400">
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl">
                  Buat Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Campaign Modal */}
      {isManageCampaignModalOpen && activeCampaign && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsManageCampaignModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <HandHeart className="w-5 h-5 text-emerald-600" /> Kelola Campaign: {activeCampaign.name}
              </h3>
              <button onClick={() => setIsManageCampaignModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCampaignDonation} className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Terkumpul</span>
                  <span className="font-bold text-emerald-600">Rp {activeCampaign.collected.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Target</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">Rp {activeCampaign.target.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Jumlah Donatur</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{activeCampaign.donors} Orang</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Catat Donasi Masuk (Rp)
                </label>
                <input 
                  type="number" 
                  required 
                  min={10000}
                  step={50000}
                  value={donationAmount}
                  onChange={e => setDonationAmount(Number(e.target.value))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsManageCampaignModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400">
                  Tutup
                </button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl">
                  Simpan Donasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Savings Plan Modal */}
      {isNewPlanModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsNewPlanModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" /> Buka Rencana Tabungan / Qurban
              </h3>
              <button onClick={() => setIsNewPlanModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nama Partisipan / Kelompok
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="Contoh: Keluarga Ust. Firdaus"
                  value={planForm.name}
                  onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Tipe Peserta
                  </label>
                  <select 
                    value={planForm.type}
                    onChange={e => setPlanForm({ ...planForm, type: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="Student">Santri</option>
                    <option value="Parent">Wali Santri</option>
                    <option value="Staff">Asatidz / Staff</option>
                    <option value="Group">Kelompok / Jamaah</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Fokus Rencana
                  </label>
                  <select 
                    value={planForm.plan}
                    onChange={e => setPlanForm({ ...planForm, plan: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="Umroh Reguler">Umroh Reguler</option>
                    <option value="Qurban Sapi">Qurban Sapi</option>
                    <option value="Qurban Kambing">Qurban Kambing</option>
                    <option value="Haji Khusus">Haji Khusus</option>
                    <option value="Wakaf Kolektif">Wakaf Kolektif</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Target Dana (Rp)
                  </label>
                  <input 
                    type="number" 
                    required 
                    value={planForm.target}
                    onChange={e => setPlanForm({ ...planForm, target: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Setoran Awal (Rp)
                  </label>
                  <input 
                    type="number" 
                    value={planForm.initialDeposit}
                    onChange={e => setPlanForm({ ...planForm, initialDeposit: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsNewPlanModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400">
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl">
                  Buka Rencana
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


