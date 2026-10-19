import React, { useState } from 'react';
import { 
  BrainCircuit, Database, LineChart, BookOpen, 
  Mic, AlertTriangle, ArrowUpRight, Activity, 
  Cpu, Sparkles, TrendingUp, BarChart2, Server, 
  Network, Code, Play, Search, GraduationCap, 
  Wallet, Fingerprint, CheckCircle2, FileText, Users
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart as RechartsLineChart, Line
} from 'recharts';
import { cn } from '../lib/utils';

export function IntelligenceManager() {
  const [activeTab, setActiveTab] = useState('executive');

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-emerald-500" />
            Executive Intelligence Center
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Centralized AI predictions, Tahfidz scoring engine, and data warehouse analytics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
             AI Engine Active
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mt-6">
         <div className="lg:w-64 shrink-0 space-y-1">
            {[
              { id: 'executive', label: 'Executive Dashboard', icon: Activity },
              { id: 'predictive', label: 'Predictive Analytics', icon: LineChart },
              { id: 'tahfidz-ai', label: 'AI Tahfidz Engine', icon: Mic },
              { id: 'data-warehouse', label: 'Data Warehouse', icon: Database },
              { id: 'knowledge', label: 'Knowledge Hub', icon: BookOpen },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all w-full text-left",
                  activeTab === tab.id 
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                )}
              >
                <tab.icon className={cn("w-5 h-5", activeTab === tab.id ? "text-emerald-500" : "")} />
                {tab.label}
              </button>
            ))}
         </div>

         <div className="flex-1 min-w-0">
            {activeTab === 'executive' && <ExecutiveDashboard />}
            {activeTab === 'tahfidz-ai' && <AITahfidzEngine />}
            {activeTab === 'predictive' && <PredictiveAnalytics />}
            {activeTab === 'data-warehouse' && <DataWarehouse />}
            {activeTab === 'knowledge' && <KnowledgeHub />}
         </div>
      </div>
    </div>
  );
}

function ExecutiveDashboard() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/40 dark:to-slate-900 md:col-span-2 p-6 rounded-xl border border-emerald-100 dark:border-emerald-500/20 relative overflow-hidden shadow-sm">
            <Sparkles className="absolute top-4 right-4 w-16 h-16 text-emerald-500/10 dark:text-emerald-500/20" />
            <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2">
               <BrainCircuit className="w-5 h-5" /> Executive Summary
            </h3>
            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mt-2 max-w-2xl font-medium">
              "Financial health remains secure with 8% YoY revenue growth. However, AI models indicate a 24% localized risk of tuition arrears in the SMP unit over the next 30 days. Academically, Tahfidz targets across boarding units are on track, exceeding the baseline by 12%."
            </p>
         </div>
         <div className="grid grid-rows-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
               <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Est. Monthly Rev</p>
               <div className="flex items-end justify-between">
                 <h4 className="text-2xl font-black text-slate-800 dark:text-slate-200">Rp 1.2B</h4>
                 <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center">+4.2%</span>
               </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
               <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Retention Risk</p>
               <div className="flex items-end justify-between">
                 <h4 className="text-xl font-black text-amber-500">Flagged</h4>
                 <span className="text-amber-700 dark:text-amber-400 text-xs font-bold bg-amber-100 dark:bg-amber-500/20 px-2 py-1 rounded">34 Students</span>
               </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
             <AlertTriangle className="w-5 h-5 text-rose-500" />
             Intelligent Anomaly Detection
           </h3>
           <div className="space-y-4">
              {[
                { unit: "Asrama Abu Bakar", alert: "Unusual spike in late-night dorm departures (+14 anomalies).", type: "Security", color: "rose" },
                { unit: "Unit SMP IT", alert: "Tuition default probability exceeded 15% threshold for Grade 8.", type: "Finance", color: "amber" },
                { unit: "Unit SMA IT", alert: "Overall Tahfidz velocity is 15% below the standard historical trajectory.", type: "Academic", color: "blue" }
              ].map((alert, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 items-start">
                   <div className={cn(
                     "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider min-w-[80px] text-center mt-0.5",
                     alert.color === 'rose' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                     alert.color === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                     'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                   )}>
                     {alert.type}
                   </div>
                   <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{alert.unit}</h4>
                      <p className="text-xs text-slate-500 mt-1">{alert.alert}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">Key Performance Indicators</h3>
           <div className="space-y-6">
              {[
                { label: 'Academic Excellence Index', val: 88, target: 90 },
                { label: 'Financial Liquidity Score', val: 94, target: 85 },
                { label: 'Operational Efficiency', val: 76, target: 80 }
              ].map((kpi, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-sm font-medium mb-2">
                    <span className="text-slate-700 dark:text-slate-300">{kpi.label}</span>
                    <span className="text-slate-900 dark:text-white font-bold">{kpi.val}/100</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                    <div 
                      className={cn("h-full rounded-full transition-all", kpi.val >= kpi.target ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${kpi.val}%` }}
                    ></div>
                    <div className="absolute top-0 bottom-0 w-1 bg-slate-900 dark:bg-white z-10" style={{ left: `${kpi.target}%` }} title={`Target: ${kpi.target}`}></div>
                  </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}

function AITahfidzEngine() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       <div className="bg-indigo-900 border border-indigo-700 rounded-xl p-8 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-40 bg-indigo-500/20 rounded-full blur-3xl mix-blend-screen"></div>
          <div className="absolute bottom-0 left-0 p-32 bg-purple-500/20 rounded-full blur-3xl mix-blend-screen"></div>
          
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between relative z-10 gap-6">
             <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 bg-indigo-950/50 text-indigo-300 px-3 py-1 rounded-full text-xs font-bold border border-indigo-700/50 mb-4">
                   <Fingerprint className="w-3.5 h-3.5" /> Voice Biometrics Active
                </div>
                <h3 className="font-black text-white text-3xl mb-2">Live Recitation Scoring</h3>
                <p className="text-indigo-200 text-sm max-w-md">Neural network models analyze Tajwid, Makhraj, and Fluency in real-time, providing immediate haptic and visual feedback.</p>
             </div>
             <button className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-full p-6 shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center group shrink-0">
                <Mic className="w-8 h-8 group-hover:scale-110 transition-transform" />
             </button>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
             <div className="p-5 bg-black/40 backdrop-blur rounded-xl border border-white/10 text-center">
                <p className="text-xs text-indigo-300 uppercase tracking-widest font-bold mb-2">Tajwid Accuracy</p>
                <p className="text-4xl font-black text-emerald-400">92%</p>
             </div>
             <div className="p-5 bg-black/40 backdrop-blur rounded-xl border border-white/10 text-center">
                <p className="text-xs text-indigo-300 uppercase tracking-widest font-bold mb-2">Makhraj Precision</p>
                <p className="text-4xl font-black text-blue-400">88%</p>
             </div>
             <div className="p-5 bg-black/40 backdrop-blur rounded-xl border border-white/10 text-center">
                <p className="text-xs text-indigo-300 uppercase tracking-widest font-bold mb-2">Fluency & Rhythm</p>
                <p className="text-4xl font-black text-emerald-400">95%</p>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
             <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6">Spaced Repetition (Murajaah) Signals</h3>
             <ul className="space-y-4">
               <li className="flex gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                 <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
                   <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                 </div>
                 <div>
                   <p className="text-slate-800 dark:text-slate-200 font-bold text-sm">Al-Mulk: Verse 12-15</p>
                   <p className="text-xs text-slate-500 mt-1">High hesitation frequency. Recommended for target drill today.</p>
                 </div>
               </li>
               <li className="flex gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                 <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                   <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                 </div>
                 <div>
                   <p className="text-slate-800 dark:text-slate-200 font-bold text-sm">Al-Waqi'ah: Verse 1-10</p>
                   <p className="text-xs text-slate-500 mt-1">Nearing forgetting curve threshold. Scheduled for evening review.</p>
                 </div>
               </li>
             </ul>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
             <div className="w-32 h-32 border-8 border-slate-100 dark:border-slate-800 border-t-emerald-500 rounded-full flex flex-col items-center justify-center mb-6 shadow-inner relative">
                <span className="text-4xl font-black text-slate-800 dark:text-slate-200">18</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Juz</span>
             </div>
             <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">Milestone Prediction</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
               Based on historical throughput, neural nets forecast completion of 30 Juz in <strong className="text-emerald-600 dark:text-emerald-400">14 Months</strong>.
             </p>
          </div>
       </div>
    </div>
  );
}

function PredictiveAnalytics() {
  const enrollmentData = [
    { month: 'Jul', actual: 4200, predicted: 4200 },
    { month: 'Aug', actual: 4250, predicted: 4260 },
    { month: 'Sep', actual: 4280, predicted: 4300 },
    { month: 'Oct', actual: null, predicted: 4350 },
    { month: 'Nov', actual: null, predicted: 4400 },
    { month: 'Dec', actual: null, predicted: 4500 },
  ];

  const financialRiskData = [
    { month: 'W1', riskScore: 12 },
    { month: 'W2', riskScore: 15 },
    { month: 'W3', riskScore: 11 },
    { month: 'W4', riskScore: 24 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
         <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-slate-800 dark:text-slate-200 font-bold text-lg">Enrollment & Capacity Forecast</h3>
              <p className="text-slate-500 text-sm mt-1">6-month forward projection utilizing multi-variate regression</p>
            </div>
            <span className="px-3 py-1 bg-blue-100/50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-500/20">92% Confidence</span>
         </div>
         <div className="h-80 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={enrollmentData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 100', 'dataMax + 100']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" name="Actual Enrollment" />
                <Area type="monotone" dataKey="predicted" stroke="#3b82f6" strokeWidth={3} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorPredicted)" name="AI Forecast" />
              </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">Tuition Default Risk Index (Next 30 Days)</h3>
            <div className="h-48 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={financialRiskData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                   <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                   <Bar dataKey="riskScore" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Risk Score %" />
                 </BarChart>
               </ResponsiveContainer>
            </div>
         </div>
         <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-center">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Resource Optimization</h3>
            <p className="text-slate-500 text-sm mb-6">AI suggestions for reducing operational overhead based on utility and staffing patterns.</p>
            <div className="space-y-3">
               <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">Optimize Dormitory HVAC</span>
                  <span className="text-xs font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded text-emerald-600 dark:text-emerald-400">Save 12%</span>
               </div>
               <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20">
                  <span className="font-bold text-blue-700 dark:text-blue-400 text-sm">Re-allocate Kitchen Staff Shifts</span>
                  <span className="text-xs font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded text-blue-600 dark:text-blue-400">High Impact</span>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}

function DataWarehouse() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Server className="w-6 h-6 text-indigo-500" /> Enterprise Data Layer</h3>
              <p className="text-slate-500 text-sm mt-1">Unified schema mapping across ERP, Academic, and CRM databases.</p>
            </div>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg border border-emerald-200 dark:border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Synced 2m ago
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
             {['Raw Data Ingestion (TB)', 'Compute Nodes', 'Active Queries / s'].map((lbl, i) => (
                <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{lbl}</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-200 mt-2">
                    {i === 0 ? '14.2' : i === 1 ? '8' : '450'}
                  </p>
                </div>
             ))}
          </div>

          <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
             <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
               <span className="text-xs font-mono text-slate-400 flex items-center gap-2"><Code className="w-3.5 h-3.5" /> SQL Query Runner</span>
               <button className="flex items-center gap-1 text-emerald-400 text-xs font-bold hover:text-emerald-300"><Play className="w-3 h-3" /> Run</button>
             </div>
             <div className="p-4 bg-[#0d1117]">
               <pre className="font-mono text-xs leading-relaxed text-blue-300">
                 <span className="text-pink-400">SELECT</span> unit, <span className="text-pink-400">COUNT</span>(student_id) <span className="text-pink-400">AS</span> arrears<br/>
                 <span className="text-pink-400">FROM</span> data_lake.finance.tuition_records<br/>
                 <span className="text-pink-400">WHERE</span> payment_status = <span className="text-amber-300">'OVERDUE'</span> <span className="text-pink-400">AND</span> date &gt; <span className="text-pink-400">CURRENT_DATE</span> - <span className="text-purple-400">INTERVAL</span> <span className="text-amber-300">'30 day'</span><br/>
                 <span className="text-pink-400">GROUP BY</span> unit;
               </pre>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">ETL Pipelines</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">PostgreSQL (Academic)</p>
                      <p className="text-xs text-slate-500">Incremental sync</p>
                    </div>
                 </div>
                 <span className="text-xs font-bold text-emerald-500">Healthy</span>
              </div>
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">MongoDB (Tahfidz Logs)</p>
                      <p className="text-xs text-slate-500">Real-time replication</p>
                    </div>
                 </div>
                 <span className="text-xs font-bold text-emerald-500">Healthy</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">BigQuery Connectors</h3>
            <p className="text-sm text-slate-500 mb-4">Direct integration with GCP BigQuery for machine learning workloads and advanced materialized views.</p>
            <button className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold rounded-lg transition-colors border border-slate-200 dark:border-slate-700 flex justify-center items-center gap-2">
              <Network className="w-4 h-4" /> View Connector Status
            </button>
          </div>
       </div>
    </div>
  );
}

function KnowledgeHub() {
  const [query, setQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasResult, setHasResult] = React.useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setHasResult(false);
    setTimeout(() => {
      setIsSearching(false);
      setHasResult(true);
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
             <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black border border-indigo-500/30 rounded-2xl p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>
                <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto mb-8">
                   <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-6 border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                      <Sparkles className="w-8 h-8 text-indigo-400" />
                   </div>
                   <h2 className="text-3xl font-black text-white mb-4 tracking-tight">Enterprise Knowledge Retrieval</h2>
                   <p className="text-indigo-200 text-sm leading-relaxed px-4">
                     Query across <strong className="text-white">12.4M+</strong> semantic vectors, boarding school SOPs, historical academic policies, and CRM transcripts using Natural Language. Powered by Vector DB & GenAI.
                   </p>
                </div>
                
                <form onSubmit={handleSearch} className="w-full relative shadow-2xl rounded-full z-10">
                  <Search className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-indigo-400" />
                  <input 
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask anything (e.g. 'What is the disciplinary procedure for repeated tardiness in SMP?')" 
                    className="w-full pl-14 pr-32 py-5 bg-white/5 backdrop-blur-md border border-indigo-500/30 rounded-full text-base text-white placeholder-indigo-300/50 focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition-all shadow-inner"
                  />
                  <button 
                    type="submit"
                    disabled={isSearching || !query.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                  >
                    {isSearching ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Thinking...
                      </span>
                    ) : 'Generate'}
                  </button>
                </form>
             </div>

             {hasResult && (
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                     <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                     </div>
                     <h3 className="font-bold text-slate-800 dark:text-slate-200">AI Synthesized Response</h3>
                     <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded">
                       <CheckCircle2 className="w-3.5 h-3.5" /> High Confidence
                     </span>
                  </div>
                  <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300">
                     <p className="mb-4">
                       Based on the <strong>Student Discipline Handbook (v3.2)</strong> and <strong>SMP IT Operations Manual</strong>, the procedure for repeated tardiness (defined as 3 or more instances within a single month) is as follows:
                     </p>
                     <ul className="space-y-2 mb-4 list-disc pl-5">
                       <li><strong>1st Offense:</strong> Verbal warning by the Homeroom Teacher and recorded in the Tahfidz Journal.</li>
                       <li><strong>2nd Offense:</strong> Written notification sent to parents via the Parent CRM Portal, signed by the Head of Discipline.</li>
                       <li><strong>3rd Offense:</strong> Mandatory parent meeting and deduction of 15 Academic Points.</li>
                     </ul>
                     <p>
                       Additionally, if the tardiness affects morning Subuh congregation, the student is subject to supplementary Murajaah duties as stipulated in Boarding Policy 2024.
                     </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                     <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Cited Sources</p>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 cursor-pointer transition-colors">
                           <FileText className="w-5 h-5 text-rose-500 mt-0.5" />
                           <div>
                             <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Student_Handbook_v3.pdf</p>
                             <p className="text-xs text-slate-500">Page 42 • Section: Disciplinary Actions</p>
                           </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 cursor-pointer transition-colors">
                           <FileText className="w-5 h-5 text-blue-500 mt-0.5" />
                           <div>
                             <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Boarding_Policy_2024.docx</p>
                             <p className="text-xs text-slate-500">Page 12 • Subuh Congregation Rules</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
             )}
          </div>

          <div className="space-y-6">
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-500" /> Vector Database Metrics
                </h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">Total Indexed Vectors</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">12,430,900</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: '78%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">Average P95 Latency</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">142ms</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '15%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">Storage Footprint</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">420GB</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: '45%' }}></div>
                    </div>
                  </div>
                </div>
             </div>

             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">Knowledge Domains</h3>
                <div className="space-y-3">
                   {[
                     { title: 'SOP & Regulations Index', icon: BookOpen, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-500/20', docCount: '2.4K Docs' },
                     { title: 'Curriculum Syllabus Corpus', icon: GraduationCap, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20', docCount: '1.2K Docs' },
                     { title: 'Alumni & CRM Transcripts', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20', docCount: '450K Threads' },
                     { title: 'Finance & Endowment Ledgers', icon: Wallet, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/20', docCount: '12K Reports' },
                   ].map((domain, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                         <div className={`w-10 h-10 rounded-lg ${domain.bg} flex items-center justify-center shrink-0`}>
                           <domain.icon className={`w-5 h-5 ${domain.color}`} />
                         </div>
                         <div className="min-w-0 flex-1">
                           <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{domain.title}</h4>
                           <p className="text-xs text-slate-500">{domain.docCount}</p>
                         </div>
                         <div className="w-2 h-2 rounded-full bg-emerald-500" title="Active & Synced"></div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}


