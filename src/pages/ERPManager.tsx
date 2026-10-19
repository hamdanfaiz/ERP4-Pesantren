import React, { useState } from 'react';
import { 
  Target, Building, FileText, LineChart, Download, Calculator, 
  ChevronRight, Filter, Wallet, ArrowUpRight, ArrowDownRight, TrendingUp,
  Receipt, CreditCard, Search, Plus, ClipboardCheck, Check, X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Line, ComposedChart, AreaChart, Area
} from 'recharts';
import { cn } from '../lib/utils';

export function ERPManager() {
  const [activeTab, setActiveTab] = useState('budget');

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif text-slate-800 dark:text-slate-200">ERP Finance & Budgeting</h1>
          <p className="text-slate-500 text-sm mt-1">Enterprise resource planning, multi-entity accounting, and budget workflows.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
          <button className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-sm shadow-emerald-500/20">
            <Calculator className="w-4 h-4" />
            <span>New RKAT / Budget</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="md:col-span-1 border-r border-slate-200 dark:border-white/5 pr-4 space-y-2">
            {[
              { id: 'budget', label: 'Budget & RKAT', icon: Target },
              { id: 'forecasting', label: 'Budget Forecasting', icon: TrendingUp },
              { id: 'expenses', label: 'Expense Tracking', icon: CreditCard },
              { id: 'approvals', label: 'Budget Approvals', icon: ClipboardCheck },
              { id: 'multi-entity', label: 'Multi-Entity Books', icon: Building },
              { id: 'financials', label: 'Financial Statements', icon: FileText },
              { id: 'cashflow', label: 'Cash Flow Analysis', icon: LineChart },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full text-left",
                  activeTab === tab.id 
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 shadow-sm" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
                )}
              >
                <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")} />
                {tab.label}
              </button>
            ))}
         </div>

         <div className="md:col-span-3 pb-8">
            {activeTab === 'budget' && <BudgetView />}
            {activeTab === 'forecasting' && <ForecastingView />}
            {activeTab === 'expenses' && <ExpensesView />}
            {activeTab === 'approvals' && <ApprovalsView />}
            {activeTab === 'multi-entity' && <MultiEntityView />}
            {activeTab === 'financials' && <FinancialsView />}
            {activeTab === 'cashflow' && <CashFlowView />}
         </div>
      </div>
    </div>
  );
}

function BudgetView() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { tag: "Total Approved Budget", val: "Rp 12.5B", sub: "TA 2026/2027", c: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20" },
            { tag: "Budget Absorption (YTD)", val: "Rp 4.2B", sub: "33.6% Absorbed", c: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20" },
            { tag: "Remaining Variance", val: "Rp 8.3B", sub: "Available allocation", c: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20" }
          ].map((s, i) => (
             <div key={i} className={cn("p-5 rounded-2xl border shadow-sm", s.bg)}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{s.tag}</p>
                <h3 className={cn("text-2xl font-bold mb-1", s.c)}>{s.val}</h3>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{s.sub}</p>
             </div>
          ))}
       </div>

       <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-black/40">
             <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Budget Realization per Unit</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5 text-sm">
             {[
               { name: "Pondok Pesantren Pusat", allocated: "Rp 4.5B", real: "Rp 1.8B", pct: 40 },
               { name: "SMA IT Bina Nusantara", allocated: "Rp 3.2B", real: "Rp 1.1B", pct: 34 },
               { name: "SMP IT Bina Nusantara", allocated: "Rp 2.8B", real: "Rp 0.9B", pct: 32 },
               { name: "SD IT Bina Nusantara", allocated: "Rp 2.0B", real: "Rp 0.4B", pct: 20 },
             ].map((u, k) => (
                <div key={k} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors gap-4">
                   <div className="w-full sm:w-1/3 font-medium text-slate-800 dark:text-slate-200">{u.name}</div>
                   <div className="w-full sm:w-2/3 flex items-center gap-4">
                      <div className="flex-1">
                         <div className="flex justify-between text-xs text-slate-500 font-medium mb-2">
                            <span>Realized: {u.real}</span>
                            <span>Allocated: {u.allocated}</span>
                         </div>
                         <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                            <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${u.pct}%` }}></div>
                         </div>
                      </div>
                      <div className="w-12 text-right text-xs font-bold text-slate-700 dark:text-slate-300">{u.pct}%</div>
                   </div>
                </div>
             ))}
          </div>
       </div>

       <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-slate-200 dark:border-white/5 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-6">Approval Workflow (RKAT)</h3>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0">
             {[
               { step: "Drafted by Unit", status: "completed" },
               { step: "Reviewed by Director", status: "completed" },
               { step: "Approved by Yayasan", status: "pending" },
             ].map((w, wIdx, arr) => (
                <div key={wIdx} className="flex flex-col sm:flex-row w-full sm:flex-1 items-center gap-2 sm:gap-0">
                   <div className={cn(
                     "flex items-center justify-center h-10 px-6 border rounded-full text-sm font-semibold shrink-0 shadow-sm",
                     w.status === 'completed' ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400" : "bg-white border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                   )}>
                     {w.step}
                   </div>
                   {wIdx !== arr.length - 1 && (
                     <div className="hidden sm:block flex-1 h-px bg-slate-200 dark:bg-slate-700 mx-2 relative">
                        <ChevronRight className="w-3 h-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 bg-white dark:bg-[#0a0a0a]" />
                     </div>
                   )}
                </div>
             ))}
          </div>
       </div>
    </div>
  );
}

function MultiEntityView() {
  const entities = [
    { name: "Yayasan Pusat", type: "HQ", revenue: "Rp 5.2B", expenses: "Rp 1.1B", net: "Rp 4.1B", asset: "Rp 25.4B" },
    { name: "Pondok Pesantren", type: "Education", revenue: "Rp 4.5B", expenses: "Rp 3.2B", net: "Rp 1.3B", asset: "Rp 15.2B" },
    { name: "SMA IT", type: "Education", revenue: "Rp 3.2B", expenses: "Rp 2.8B", net: "Rp 400M", asset: "Rp 8.5B" },
    { name: "Klinik Pratama", type: "Healthcare", revenue: "Rp 1.2B", expenses: "Rp 950M", net: "Rp 250M", asset: "Rp 2.1B" },
    { name: "Kopontren Mart", type: "Business", revenue: "Rp 2.8B", expenses: "Rp 2.1B", net: "Rp 700M", asset: "Rp 1.5B" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200">Consolidated Entity Ledgers</h3>
        <button className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg dark:text-slate-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors">
           <Filter className="w-4 h-4" /> Filter by Type
        </button>
      </div>

      <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl overflow-x-auto shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/5">
            <tr>
              <th className="px-5 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Entity Name</th>
              <th className="px-5 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Type</th>
              <th className="px-5 py-4 font-semibold text-emerald-600 dark:text-emerald-400 text-right uppercase tracking-wider text-xs">Revenue (YTD)</th>
              <th className="px-5 py-4 font-semibold text-red-600 dark:text-red-400 text-right uppercase tracking-wider text-xs">Expenses (YTD)</th>
              <th className="px-5 py-4 font-semibold text-blue-600 dark:text-blue-400 text-right uppercase tracking-wider text-xs">Net Income</th>
              <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 text-right uppercase tracking-wider text-xs">Total Assets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-black/20">
            {entities.map((ent, idx) => (
              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-4 text-slate-800 dark:text-slate-200 font-medium">{ent.name}</td>
                <td className="px-5 py-4">
                  <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-md">
                    {ent.type}
                  </span>
                </td>
                <td className="px-5 py-4 text-right text-slate-700 dark:text-slate-300 font-medium">{ent.revenue}</td>
                <td className="px-5 py-4 text-right text-slate-700 dark:text-slate-300 font-medium">{ent.expenses}</td>
                <td className="px-5 py-4 text-right text-blue-600 dark:text-blue-400 font-bold">{ent.net}</td>
                <td className="px-5 py-4 text-right text-slate-600 dark:text-slate-400 font-medium">{ent.asset}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FinancialsView() {
  const [reportType, setReportType] = useState<'laba_rugi' | 'neraca'>('laba_rugi');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex border-b border-slate-200 dark:border-white/10">
         <button 
           onClick={() => setReportType('laba_rugi')}
           className={cn("px-6 py-3 text-sm font-semibold border-b-2 transition-colors", reportType === 'laba_rugi' ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200")}
         >
           Laba Rugi (Income Statement)
         </button>
         <button 
           onClick={() => setReportType('neraca')}
           className={cn("px-6 py-3 text-sm font-semibold border-b-2 transition-colors", reportType === 'neraca' ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200")}
         >
           Neraca (Balance Sheet)
         </button>
      </div>

      <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden p-8 shadow-sm">
         {reportType === 'laba_rugi' ? (
           <div className="space-y-6">
             <div className="flex justify-between border-b border-slate-200 dark:border-white/10 pb-3">
                <span className="text-slate-800 dark:text-slate-200 font-bold uppercase tracking-wider text-sm">REVENUE (PENDAPATAN)</span>
             </div>
             <div className="pl-4 space-y-3 text-sm text-slate-600 dark:text-slate-400 font-medium">
                <div className="flex justify-between"><span>Pendapatan SPP & Pendidikan</span><span>Rp 12.500.000.000</span></div>
                <div className="flex justify-between"><span>Pendapatan Usaha (Koperasi, Klinik)</span><span>Rp 4.000.000.000</span></div>
                <div className="flex justify-between"><span>Pendapatan Donasi & Wakaf</span><span>Rp 2.500.000.000</span></div>
             </div>
             <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-3 font-bold text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-50 dark:bg-transparent -mx-8 px-8 pb-3">
                <span>Total Revenue</span><span>Rp 19.000.000.000</span>
             </div>

             <div className="flex justify-between border-b border-slate-200 dark:border-white/10 pb-3 mt-8">
                <span className="text-slate-800 dark:text-slate-200 font-bold uppercase tracking-wider text-sm">EXPENSES (BIAYA OPERASIONAL)</span>
             </div>
             <div className="pl-4 space-y-3 text-sm text-slate-600 dark:text-slate-400 font-medium">
                <div className="flex justify-between"><span>Biaya Pegawai (Gaji Guru & Staff)</span><span>Rp 8.500.000.000</span></div>
                <div className="flex justify-between"><span>Biaya Operasional Pendidikan / Asrama</span><span>Rp 4.200.000.000</span></div>
                <div className="flex justify-between"><span>Biaya Pemeliharaan Aset</span><span>Rp 1.100.000.000</span></div>
                <div className="flex justify-between"><span>Biaya Administrasi & Umum</span><span>Rp 800.000.000</span></div>
             </div>
             <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-3 font-bold text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-transparent -mx-8 px-8 pb-3">
                <span>Total Expenses</span><span>(Rp 14.600.000.000)</span>
             </div>
             
             <div className="flex justify-between border-t-2 border-slate-300 dark:border-white/20 pt-4 mt-6 text-lg font-black text-blue-600 dark:text-blue-400">
                <span>NET INCOME (LABA BERSIH)</span><span>Rp 4.400.000.000</span>
             </div>
           </div>
         ) : (
           <div className="space-y-6">
             <div className="flex justify-between border-b border-slate-200 dark:border-white/10 pb-3">
                <span className="text-slate-800 dark:text-slate-200 font-bold uppercase tracking-wider text-sm">ASSETS (ASET)</span>
             </div>
             <div className="pl-4 space-y-3 text-sm text-slate-600 dark:text-slate-400 font-medium">
                <div className="flex justify-between"><span>Kas & Setara Kas</span><span>Rp 8.520.000.000</span></div>
                <div className="flex justify-between"><span>Piutang (Tunggakan Santri)</span><span>Rp 1.850.000.000</span></div>
                <div className="flex justify-between"><span>Tanah & Bangunan (Net)</span><span>Rp 45.000.000.000</span></div>
                <div className="flex justify-between"><span>Kendaraan & Inventaris (Net)</span><span>Rp 4.500.000.000</span></div>
             </div>
             <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-3 font-bold text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-50 dark:bg-transparent -mx-8 px-8 pb-3">
                <span>Total Assets</span><span>Rp 59.870.000.000</span>
             </div>

             <div className="flex justify-between border-b border-slate-200 dark:border-white/10 pb-3 mt-8">
                <span className="text-slate-800 dark:text-slate-200 font-bold uppercase tracking-wider text-sm">LIABILITIES & EQUITY (KEWAJIBAN & EKUITAS)</span>
             </div>
             <div className="pl-4 space-y-3 text-sm text-slate-600 dark:text-slate-400 font-medium">
                <div className="flex justify-between"><span>Hutang Usaha</span><span>Rp 1.200.000.000</span></div>
                <div className="flex justify-between"><span>Biaya YMH Dibayar</span><span>Rp 600.000.000</span></div>
                <div className="flex justify-between"><span>Dana Abadi Wakaf</span><span>Rp 25.000.000.000</span></div>
                <div className="flex justify-between"><span>Saldo Dana Yayasan (Retained Earnings)</span><span>Rp 33.070.000.000</span></div>
             </div>
             <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-3 font-bold text-blue-600 dark:text-blue-400 text-sm bg-blue-50 dark:bg-transparent -mx-8 px-8 pb-3">
                <span>Total Liabilities & Equity</span><span>Rp 59.870.000.000</span>
             </div>
           </div>
         )}
      </div>
    </div>
  );
}

function CashFlowView() {
  const data = [
    { name: 'Jan', inward: 1200, outward: 800, net: 400 },
    { name: 'Feb', inward: 1100, outward: 900, net: 200 },
    { name: 'Mar', inward: 1500, outward: 1000, net: 500 },
    { name: 'Apr', inward: 1400, outward: 950, net: 450 },
    { name: 'May', inward: 1800, outward: 1100, net: 700 },
    { name: 'Jun', inward: 2200, outward: 1300, net: 900 }, // PPDB peaks
  ];

  const formatRupiah = (value: number) => `Rp ${(value / 1000).toFixed(1)}B`;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm">
             <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs text-emerald-700 dark:text-emerald-400 uppercase font-bold tracking-wider">Operating Inflow (YTD)</span>
             </div>
             <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">Rp 9.2B</span>
          </div>
          <div className="p-5 rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 shadow-sm">
             <div className="flex items-center gap-2 mb-2">
                <ArrowDownRight className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="text-xs text-red-700 dark:text-red-400 uppercase font-bold tracking-wider">Operating Outflow (YTD)</span>
             </div>
             <span className="text-3xl font-black text-red-600 dark:text-red-400">Rp 6.0B</span>
          </div>
          <div className="p-5 rounded-2xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 shadow-sm">
             <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-700 dark:text-blue-400 uppercase font-bold tracking-wider">Net Cash Flow (YTD)</span>
             </div>
             <span className="text-3xl font-black text-blue-600 dark:text-blue-400">Rp 3.2B</span>
          </div>
       </div>

       <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
         <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-6">Cash Flow Trend (in Millions)</h3>
         <div className="h-80 w-full">
           <ResponsiveContainer width="100%" height="100%">
             <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
               <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} vertical={false} />
               <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
               <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatRupiah} dx={-10} />
               <Tooltip 
                 contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 itemStyle={{ color: '#0f172a', fontWeight: 500 }}
                 formatter={(value: number) => [`Rp ${value}M`, '']}
               />
               <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px', fontWeight: 500 }} />
               <Bar dataKey="inward" name="Cash Inward" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
               <Bar dataKey="outward" name="Cash Outward" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
               <Line type="monotone" dataKey="net" name="Net Position" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }} />
             </ComposedChart>
           </ResponsiveContainer>
         </div>
       </div>
    </div>
  );
}

function ForecastingView() {
  const data = [
    { name: 'Jan', historical: 1200, projected: null },
    { name: 'Feb', historical: 1250, projected: null },
    { name: 'Mar', historical: 1300, projected: null },
    { name: 'Apr', historical: 1280, projected: null },
    { name: 'May', historical: 1350, projected: null },
    { name: 'Jun', historical: 1320, projected: 1320 },
    { name: 'Jul', historical: null, projected: 1400 },
    { name: 'Aug', historical: null, projected: 1450 },
    { name: 'Sep', historical: null, projected: 1520 },
    { name: 'Oct', historical: null, projected: 1480 },
    { name: 'Nov', historical: null, projected: 1550 },
    { name: 'Dec', historical: null, projected: 1600 },
  ];

  const formatRupiah = (value: number) => `Rp ${(value / 1000).toFixed(1)}B`;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10 shadow-sm">
             <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span className="text-xs text-purple-700 dark:text-purple-400 uppercase font-bold tracking-wider">Projected Annual Spend</span>
             </div>
             <span className="text-3xl font-black text-purple-600 dark:text-purple-400">Rp 16.8B</span>
          </div>
          <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm">
             <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs text-emerald-700 dark:text-emerald-400 uppercase font-bold tracking-wider">Estimated Variance</span>
             </div>
             <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">+4.2%</span>
          </div>
          <div className="p-5 rounded-2xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 shadow-sm">
             <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-700 dark:text-blue-400 uppercase font-bold tracking-wider">Confidence Score</span>
             </div>
             <span className="text-3xl font-black text-blue-600 dark:text-blue-400">92%</span>
          </div>
       </div>

       <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
               <h3 className="text-slate-800 dark:text-slate-200 font-semibold">Departmental Spending Forecast</h3>
               <p className="text-xs text-slate-500">Historical vs AI Projected Spending (in Millions)</p>
            </div>
            <select className="px-3 py-2 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200">
               <option>All Departments</option>
               <option>Academic Affairs</option>
               <option>IT & Infrastructure</option>
               <option>Human Resources</option>
            </select>
         </div>
         <div className="h-80 w-full">
           <ResponsiveContainer width="100%" height="100%">
             <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
               <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} vertical={false} />
               <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
               <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatRupiah} dx={-10} domain={['auto', 'auto']} />
               <Tooltip 
                 contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 itemStyle={{ color: '#0f172a', fontWeight: 500 }}
                 formatter={(value: number) => [`Rp ${value}M`, '']}
               />
               <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px', fontWeight: 500 }} />
               <Area type="monotone" dataKey="historical" name="Historical Actual" fill="#3b82f6" stroke="#2563eb" fillOpacity={0.2} strokeWidth={2} />
               <Line type="monotone" dataKey="projected" name="AI Projected" stroke="#a855f7" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
             </ComposedChart>
           </ResponsiveContainer>
         </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
             <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Top Spending Drivers</h3>
             <div className="space-y-4">
                {[
                  { name: 'Teacher Salaries & Allowances', pct: '+8.5%', val: 'Rp 640M', color: 'text-red-600 dark:text-red-400' },
                  { name: 'Campus Maintenance & Utilities', pct: '+5.2%', val: 'Rp 320M', color: 'text-amber-600 dark:text-amber-400' },
                  { name: 'IT Infrastructure & Software', pct: '+3.1%', val: 'Rp 180M', color: 'text-purple-600 dark:text-purple-400' },
                ].map((item, idx) => (
                   <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-white/5 last:border-0">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
                      <div className="text-right">
                         <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.val}</div>
                         <div className={cn("text-xs font-semibold", item.color)}>{item.pct} (Projected)</div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
          <div className="bg-slate-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 shadow-sm flex flex-col justify-center">
             <div className="flex items-center gap-3 mb-4">
               <div className="p-3 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                   <Target className="w-6 h-6" />
                </div>
                <div>
                   <h3 className="font-bold text-emerald-800 dark:text-emerald-300">AI Optimization Insight</h3>
                   <p className="text-xs text-emerald-600 dark:text-emerald-500">Based on Q1-Q2 trend analysis</p>
                </div>
             </div>
             <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
                The forecasting algorithm identifies a potential overspend of <strong className="text-slate-900 dark:text-white">Rp 120M</strong> in IT Infrastructure by Q4. We recommend reallocating the unused Q2 Marketing budget to cover this variance before it exceeds the yearly allowance.
             </p>
             <button className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm shadow-sm transition-colors">
                Apply Recommended Reallocation
             </button>
          </div>
       </div>
    </div>
  );
}

function ExpensesView() {
  const [expenses, setExpenses] = useState([
    { id: 'EXP-1049', date: '2026-06-05', department: 'Academic Affairs', category: 'Supplies', amount: 12500000, status: 'Approved', vendor: 'Gramedia Edu' },
    { id: 'EXP-1050', date: '2026-06-06', department: 'IT Operations', category: 'Software', amount: 45000000, status: 'Pending', vendor: 'Microsoft' },
    { id: 'EXP-1051', date: '2026-06-07', department: 'Facilities', category: 'Maintenance', amount: 8200000, status: 'Approved', vendor: 'PT Maju Jaya' },
    { id: 'EXP-1052', date: '2026-06-07', department: 'HR Department', category: 'Training', amount: 15000000, status: 'Rejected', vendor: 'SkillAcademy' },
  ]);

  const [searchTerm, setSearchTerm] = useState('');

  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const filteredExpenses = expenses.filter(exp => 
    exp.department.toLowerCase().includes(searchTerm.toLowerCase()) || 
    exp.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    exp.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200">Expense Tracking</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search expenses..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all w-full sm:w-64"
            />
          </div>
          <button className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Log Expense</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Total This Month</p>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-200">Rp 142.5M</h3>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Pending Approval</p>
          <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400">Rp 45.0M</h3>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Approved/Paid</p>
          <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">Rp 82.5M</h3>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Rejected</p>
          <h3 className="text-2xl font-black text-red-600 dark:text-red-400">Rp 15.0M</h3>
        </div>
      </div>

      <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
              <tr>
                <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">ID & Date</th>
                <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Department</th>
                <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Category / Vendor</th>
                <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Status</th>
                <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs text-right">Amount</th>
                <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{exp.id}</div>
                    <div className="text-xs text-slate-500">{exp.date}</div>
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-700 dark:text-slate-300">
                    {exp.department}
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-slate-800 dark:text-slate-200">{exp.vendor}</div>
                    <div className="text-xs text-slate-500">{exp.category}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn(
                      "px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md",
                      exp.status === 'Approved' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                      exp.status === 'Pending' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                      "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                    )}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-slate-800 dark:text-slate-200">
                    {formatRupiah(exp.amount)}
                  </td>
                  <td className="px-5 py-4 text-right space-x-2">
                    <button className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium text-xs">View</button>
                    {exp.status === 'Pending' && (
                      <>
                        <button className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-xs ml-2">Approve</button>
                        <button className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium text-xs ml-2">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                    No expenses found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ApprovalsView() {
  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Budget Approval Workflows</h3>
          <p className="text-sm text-slate-500">Review and approve unit RKATs and expense requests</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm border border-slate-200 dark:border-white/5">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filter Status</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-amber-200 dark:border-amber-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ClipboardCheck className="w-16 h-16 text-amber-500" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Pending My Review</p>
          <h3 className="text-3xl font-black text-amber-600 dark:text-amber-400">12</h3>
          <p className="text-sm font-medium text-amber-700/70 dark:text-amber-400/70 mt-2">Requires immediate attention</p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Approved This Week</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-200">45</h3>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Avg Approval Time</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-200">1.2 <span className="text-lg font-bold text-slate-500">days</span></h3>
        </div>
      </div>

      <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
           <h3 className="font-semibold text-slate-800 dark:text-slate-200">Pending Requests</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
           {[
             { id: 'REQ-2026-0014', type: 'Annual RKAT', unit: 'SMA IT Bina Nusantara', user: 'Kepala Sekolah', amount: 3200000000, date: '2 hours ago', urgency: 'High' },
             { id: 'REQ-2026-0015', type: 'Special Expense', unit: 'IT Infrastructure', user: 'IT Manager', amount: 45000000, date: '5 hours ago', urgency: 'Normal' },
             { id: 'REQ-2026-0016', type: 'Facility Repair', unit: 'Pesantren Pusat', user: 'Kepala Asrama', amount: 12500000, date: '1 day ago', urgency: 'Normal' },
             { id: 'REQ-2026-0017', type: 'Event Budget', unit: 'HR Department', user: 'HR Director', amount: 25000000, date: '1 day ago', urgency: 'Low' },
           ].map((req, idx) => (
             <div key={idx} className="p-5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                   <div className={cn(
                     "p-3 rounded-xl shrink-0 mt-1",
                     req.type === 'Annual RKAT' ? "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400" :
                     "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                   )}>
                     <FileText className="w-5 h-5" />
                   </div>
                   <div>
                     <div className="flex items-center gap-2 mb-1">
                       <h4 className="font-bold text-slate-800 dark:text-slate-200">{req.id}</h4>
                       <span className={cn(
                         "px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-md",
                         req.urgency === 'High' ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" :
                         req.urgency === 'Normal' ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400" :
                         "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                       )}>{req.urgency}</span>
                     </div>
                     <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{req.type} - {req.unit}</p>
                     <p className="text-xs text-slate-500 mt-1">Requested by {req.user} • {req.date}</p>
                   </div>
                </div>
                <div className="flex flex-col md:items-end gap-3 md:gap-2 border-t border-slate-100 dark:border-white/5 md:border-t-0 pt-4 md:pt-0">
                   <div className="text-lg font-black text-slate-800 dark:text-slate-200">{formatRupiah(req.amount)}</div>
                   <div className="flex items-center gap-2 w-full md:w-auto">
                     <button className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 transition-colors shadow-sm">
                       <Check className="w-3.5 h-3.5" /> Approve
                     </button>
                     <button className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors shadow-sm">
                       <X className="w-3.5 h-3.5" /> Reject
                     </button>
                     <button className="flex-none px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm dark:text-slate-400 dark:bg-black/20 dark:border-white/10 dark:hover:bg-white/5 transition-colors">
                       Details
                     </button>
                   </div>
                </div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
