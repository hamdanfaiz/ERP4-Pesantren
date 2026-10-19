import React, { useState, useEffect } from 'react';
import { 
  Briefcase, Activity, CalendarClock, DollarSign, FileCheck, Search, Plus, 
  Users, UserCheck, UserMinus, UserPlus, Clock, MapPin, ShieldCheck, 
  TrendingUp, Award, Download, CheckCircle, XCircle, Sparkles, UserSearch, Target,
  BrainCircuit, Zap, ScanFace, Camera, Fingerprint, Timer, LogOut, LogIn, AlertTriangle, CalendarRange, Plane, CalendarX, FileText, CalendarCheck, X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { cn } from '../lib/utils';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for leaflet marker icons in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});

export function HRISManager() {
  const [activeTab, setActiveTab] = useState('directory');

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-cyan-500 pb-1 inline-block">Human Capital Management</h1>
          <p className="text-slate-500 text-sm mt-2">Manage employee data, attendance, payroll, and KPIs</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-cyan-500 transition-colors">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Employee</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-black/20 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 overflow-x-auto">
          <div className="flex p-2 gap-2 min-w-max">
            {[
              { id: 'directory', label: 'Employee Directory', icon: <Briefcase className="w-4 h-4" /> },
              { id: 'attendance', label: 'Attendance', icon: <CalendarClock className="w-4 h-4" /> },
              { id: 'leaves', label: 'Leave & Time Off', icon: <Plane className="w-4 h-4" /> },
              { id: 'live-tracking', label: 'Live Tracking', icon: <MapPin className="w-4 h-4" /> },
              { id: 'shifts', label: 'Shift Planner', icon: <CalendarRange className="w-4 h-4" /> },
              { id: 'payroll', label: 'Payroll', icon: <DollarSign className="w-4 h-4" /> },
              { id: 'performance', label: 'Performance', icon: <Activity className="w-4 h-4" /> },
              { id: 'recruitment', label: 'ATS & Hiring', icon: <UserSearch className="w-4 h-4" /> },
              { id: 'analytics', label: 'AI Analytics', icon: <Sparkles className="w-4 h-4" /> },
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn("erp-tab-control", 
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative",
                  activeTab === tab.id 
                    ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'directory' && <EmployeeDirectoryView />}
          {activeTab === 'attendance' && <AttendanceView />}
          {activeTab === 'leaves' && <LeaveRequestView />}
          {activeTab === 'live-tracking' && <LiveTrackingView />}
          {activeTab === 'shifts' && <ShiftPlannerView />}
          {activeTab === 'payroll' && <PayrollView />}
          {activeTab === 'performance' && <PerformanceView />}
          {activeTab === 'recruitment' && <RecruitmentView />}
          {activeTab === 'analytics' && <AnalyticsView />}
        </div>
      </div>
    </div>
  );
}

function EmployeeDirectoryView() {
  const employees = [
    { id: 'EMP-001', name: 'Dr. Ahmad Fauzi', role: 'Headmaster', department: 'Academic', status: 'Active', photo: 'AF' },
    { id: 'EMP-002', name: 'Siti Nurhaliza, M.Pd', role: 'Senior Teacher', department: 'Academic', status: 'Active', photo: 'SN' },
    { id: 'EMP-003', name: 'Budi Santoso', role: 'IT Support', department: 'Operations', status: 'On Leave', photo: 'BS' },
    { id: 'EMP-004', name: 'Anita Wijaya', role: 'HR Manager', department: 'Human Resources', status: 'Active', photo: 'AW' },
    { id: 'EMP-005', name: 'Dian Anugrah', role: 'Teacher', department: 'Academic', status: 'Active', photo: 'DA' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: '142', icon: <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />, bg: 'bg-cyan-50 dark:bg-cyan-500/10', border: 'border-cyan-200 dark:border-cyan-500/20' },
          { label: 'Active', value: '138', icon: <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />, bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/20' },
          { label: 'On Leave', value: '4', icon: <UserMinus className="w-5 h-5 text-amber-600 dark:text-amber-400" />, bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
          { label: 'New Hires (This Month)', value: '3', icon: <UserPlus className="w-5 h-5 text-purple-600 dark:text-purple-400" />, bg: 'bg-purple-50 dark:bg-purple-500/10', border: 'border-purple-200 dark:border-purple-500/20' },
        ].map((stat, i) => (
          <div key={i} className={cn("p-4 rounded-xl border shadow-sm", stat.bg, stat.border)}>
            <div className="flex items-center gap-3 mb-2">
              {stat.icon}
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{stat.label}</span>
            </div>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-200">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search employees by name, role..."
            className="pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:border-cyan-500 w-full sm:w-80 border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300"
          />
        </div>
        <div className="flex gap-2">
           <select className="px-3 py-2 bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none">
              <option>All Departments</option>
              <option>Academic</option>
              <option>Operations</option>
              <option>Human Resources</option>
           </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
            <tr>
              <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400">Employee</th>
              <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400">ID Number</th>
              <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400">Role</th>
              <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400">Department</th>
              <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400">Status</th>
              <th className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center text-cyan-700 dark:text-cyan-300 font-bold text-xs">
                      {emp.photo}
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{emp.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{emp.id}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{emp.role}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{emp.department}</td>
                <td className="px-5 py-3">
                  <span className={cn(
                    "px-2 py-1 text-xs font-semibold rounded-md",
                    emp.status === 'Active' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {emp.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <button className="text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium text-sm">View Profile</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceView() {
  const [viewMode, setViewMode] = useState<'dashboard' | 'kiosk'>('dashboard');
  const [selectedMapLog, setSelectedMapLog] = useState<any>(null);

  const chartData = [
    { day: 'Mon', present: 135, late: 5, absent: 2 },
    { day: 'Tue', present: 138, late: 2, absent: 2 },
    { day: 'Wed', present: 130, late: 8, absent: 4 },
    { day: 'Thu', present: 136, late: 3, absent: 3 },
    { day: 'Fri', present: 139, late: 1, absent: 2 },
  ];

  if (viewMode === 'kiosk') {
    return <AttendanceKiosk onClose={() => setViewMode('dashboard')} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 p-4 rounded-xl">
        <div>
          <h3 className="font-bold text-cyan-800 dark:text-cyan-300">Employee Self-Service & Kiosk</h3>
          <p className="text-sm text-cyan-700 dark:text-cyan-500">Launch the live attendance kiosk or view the dashboard.</p>
        </div>
        <button 
          onClick={() => setViewMode('kiosk')}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2 rounded-lg font-medium shadow-sm transition flex items-center gap-2"
        >
          <ScanFace className="w-5 h-5" /> Launch Live Kiosk
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Weekly Attendance Trends</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.3} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="present" name="Present" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[0, 0, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
           <div>
             <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Today's Overview</h3>
             <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mb-6">95.2% <span className="text-sm font-medium text-slate-500">present</span></p>
             
             <div className="space-y-4">
               <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-white/5">
                 <span className="text-sm text-slate-600 dark:text-slate-400">Punctuality Rate</span>
                 <span className="text-sm font-bold text-emerald-600">92%</span>
               </div>
               <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-white/5">
                 <span className="text-sm text-slate-600 dark:text-slate-400">Currently Late</span>
                 <span className="text-sm font-bold text-amber-600">3 employees</span>
               </div>
               <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-white/5">
                 <span className="text-sm text-slate-600 dark:text-slate-400">Absent / Leave</span>
                 <span className="text-sm font-bold text-red-600">4 employees</span>
               </div>
             </div>
           </div>
           
           <button className="w-full mt-6 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold transition-colors">
             Generate Daily Report
           </button>
        </div>
      </div>
      
      <div>
         <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Recent Clock-Ins</h3>
         <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5 mb-6">
            <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                  <tr>
                     <th className="px-5 py-3 font-semibold text-slate-500">Employee</th>
                     <th className="px-5 py-3 font-semibold text-slate-500">Time In</th>
                     <th className="px-5 py-3 font-semibold text-slate-500">Method</th>
                     <th className="px-5 py-3 font-semibold text-slate-500">Location</th>
                     <th className="px-5 py-3 font-semibold text-slate-500">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {[
                     { name: 'Dr. Ahmad Fauzi', time: '07:12 AM', method: 'Face Recognition', loc: 'Main Campus', status: 'On Time', coord: [-6.200000, 106.816666] },
                     { name: 'Dian Anugrah', time: '07:45 AM', method: 'Mobile GPS', loc: 'Main Campus', status: 'On Time', coord: [-6.205, 106.810] },
                     { name: 'Budi Santoso', time: '08:15 AM', method: 'Fingerprint', loc: 'South Gate', status: 'Late', coord: [-6.198, 106.818] },
                  ].map((log, i) => (
                     <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                        <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">{log.name}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400 flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> {log.time}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> {log.method}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400"><MapPin className="w-3.5 h-3.5 inline mr-1" /> {log.loc}</td>
                        <td className="px-5 py-3">
                           <span className={cn(
                              "px-2 py-1 text-xs font-semibold rounded-md",
                              log.status === 'On Time' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                           )}>{log.status}</span>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>

         {/* Check-ins Map View */}
         <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
               <MapPin className="w-5 h-5 text-cyan-600" />
               Check-In Locations Map
            </h3>
            <div className="flex flex-col md:flex-row gap-4 h-[28rem] relative">
               <div className={`rounded-xl overflow-hidden border border-slate-200 dark:border-white/5 relative z-0 transition-all duration-300 ${selectedMapLog ? 'md:w-2/3 w-full' : 'w-full'}`}>
                  <MapContainer center={[-6.200000, 106.816666]} zoom={14} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                      url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />
                    {[
                       { name: 'Dr. Ahmad Fauzi', time: '07:12 AM', method: 'Face Recognition', loc: 'Main Campus', address: 'Jl. Merdeka No.1, Jakarta', status: 'On Time', coord: [-6.200000, 106.816666] },
                       { name: 'Dian Anugrah', time: '07:45 AM', method: 'Mobile GPS', loc: 'Main Campus', address: 'Jl. Sudirman No. 45, Jakarta', status: 'On Time', coord: [-6.205, 106.810] },
                       { name: 'Budi Santoso', time: '08:15 AM', method: 'Fingerprint', loc: 'South Gate', address: 'Jl. Gatot Subroto Kav. 1, Jakarta', status: 'Late', coord: [-6.198, 106.818] },
                    ].map((log, idx) => (
                       <Marker key={idx} position={log.coord as [number, number]} eventHandlers={{ click: () => setSelectedMapLog(log) }}>
                         <Popup className="font-sans">
                            <div className="font-bold text-slate-800">{log.name}</div>
                            <div className="text-xs text-slate-500">{log.time}</div>
                         </Popup>
                       </Marker>
                    ))}
                    <Circle 
                      center={[-6.200000, 106.816666]} 
                      radius={800} 
                      pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.1, dashArray: '5, 5' }} 
                    />
                  </MapContainer>
               </div>
               
               {selectedMapLog && (
                  <div className="w-full md:w-1/3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 p-5 flex flex-col items-start shadow-inner animate-in slide-in-from-right-4 duration-300 h-full overflow-y-auto">
                     <div className="w-full flex justify-between items-start mb-6 border-b border-slate-200 dark:border-slate-700 pb-4">
                        <div>
                           <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100">{selectedMapLog.name}</h4>
                           <span className={cn(
                              "inline-flex px-2.5 py-1 text-xs font-bold rounded-full mt-2",
                              selectedMapLog.status === 'On Time' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                           )}>{selectedMapLog.status}</span>
                        </div>
                        <button onClick={() => setSelectedMapLog(null)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition text-slate-500">
                           <X className="w-5 h-5" />
                        </button>
                     </div>
                     
                     <div className="w-full space-y-4 flex-1">
                        <div className="flex gap-3 items-start">
                           <div className="p-2 bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 rounded-lg shrink-0">
                              <MapPin className="w-4 h-4" />
                           </div>
                           <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Check-in Location</p>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{selectedMapLog.loc}</p>
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{selectedMapLog.address}</p>
                              <p className="text-[10px] font-mono text-slate-400 mt-2 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded inline-block">
                                 {selectedMapLog.coord[0].toFixed(5)}, {selectedMapLog.coord[1].toFixed(5)}
                              </p>
                           </div>
                        </div>

                        <div className="flex gap-3 items-start">
                           <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
                              <Clock className="w-4 h-4" />
                           </div>
                           <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Timestamp</p>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Today at {selectedMapLog.time}</p>
                           </div>
                        </div>

                        <div className="flex gap-3 items-start">
                           <div className="p-2 bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 rounded-lg shrink-0">
                              <ShieldCheck className="w-4 h-4" />
                           </div>
                           <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Method Used</p>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{selectedMapLog.method}</p>
                           </div>
                        </div>
                     </div>
                  </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
}

function PayrollView() {
  const [simulationMode, setSimulationMode] = useState(false);

  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const simulatedData = [
    { id: '1', name: 'Dr. Ahmad Fauzi', role: 'Headmaster', base: 15000000, present: 22, late: 0, geofenceBreach: 0, deduction: 0, tax: 750000, net: 14250000 },
    { id: '2', name: 'Siti Nurhaliza, M.Pd', role: 'Senior Teacher', base: 8500000, present: 21, late: 1, geofenceBreach: 0, deduction: 50000, tax: 422500, net: 8027500 },
    { id: '3', name: 'Budi Santoso', role: 'IT Support', base: 6000000, present: 22, late: 3, geofenceBreach: 1, deduction: 300000, tax: 285000, net: 5415000 },
    { id: '4', name: 'Anita Wijaya', role: 'HR Manager', base: 9000000, present: 20, late: 0, geofenceBreach: 0, deduction: 0, tax: 450000, net: 8550000 },
    { id: '5', name: 'Dian Anugrah', role: 'Teacher', base: 7000000, present: 22, late: 0, geofenceBreach: 0, deduction: 0, tax: 350000, net: 6650000 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 rounded-2xl bg-cyan-600 text-white shadow-md relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
             <DollarSign className="w-24 h-24" />
           </div>
           <p className="text-cyan-100 text-sm font-medium mb-1">Next Payroll Processing</p>
           <h3 className="text-3xl font-black mb-1">June 25, 2026</h3>
           <p className="text-cyan-100 text-sm mb-4">18 days remaining</p>
           <div className="flex gap-2">
             <button 
                onClick={() => setSimulationMode(!simulationMode)}
                className="bg-white text-cyan-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-cyan-50 transition"
              >
                {simulationMode ? 'Hide Simulation' : 'Run Automation Review'}
             </button>
           </div>
        </div>
        
        <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
           <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Estimated Payroll</p>
           <h3 className="text-3xl font-black text-slate-800 dark:text-slate-200 mb-2">Rp 845.5M</h3>
           <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
              <TrendingUp className="w-4 h-4" /> +2.4% from last month
           </div>
           <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex justify-between">
              <span className="text-sm text-slate-500">Base Salary</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Rp 710.2M</span>
           </div>
           <div className="mt-2 flex justify-between">
              <span className="text-sm text-slate-500">Allowances & Overtime</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Rp 135.3M</span>
           </div>
        </div>
        
        <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
           <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Quick Actions</h3>
           <div className="space-y-3">
              <button className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-cyan-500 dark:border-white/10 dark:hover:border-cyan-500 transition-colors group">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-slate-50 dark:bg-white/5 rounded-md group-hover:text-cyan-500 transition-colors"><FileCheck className="w-4 h-4" /></div>
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Review Claims & Setup</span>
                 </div>
                 <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">12 pending</span>
              </button>
              <button className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-cyan-500 dark:border-white/10 dark:hover:border-cyan-500 transition-colors group">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-slate-50 dark:bg-white/5 rounded-md group-hover:text-cyan-500 transition-colors"><Download className="w-4 h-4" /></div>
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Export Last Payslips</span>
                 </div>
              </button>
           </div>
        </div>
      </div>
      
      {simulationMode ? (
         <div className="animate-in slide-in-from-top-4 duration-500">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
               <Zap className="w-5 h-5 text-amber-500" /> Automated Payroll Calculation Draft
            </h3>
            <p className="text-sm text-slate-500 mb-4">Calculations are dynamically derived from Biometric Attendance and Live Location Geofencing metrics. Deductions apply automatically for tardiness or premature perimeter exit.</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
               <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-cyan-50 dark:bg-cyan-500/10 border-b border-cyan-100 dark:border-cyan-500/20">
                     <tr>
                        <th className="px-5 py-3 font-semibold text-cyan-800 dark:text-cyan-300">Employee</th>
                        <th className="px-5 py-3 font-semibold text-cyan-800 dark:text-cyan-300">Base Salary</th>
                        <th className="px-5 py-3 font-semibold text-cyan-800 dark:text-cyan-300">Days Present</th>
                        <th className="px-5 py-3 font-semibold text-cyan-800 dark:text-cyan-300">Violations (Geofence / Late)</th>
                        <th className="px-5 py-3 font-semibold text-cyan-800 dark:text-cyan-300">Deductions</th>
                        <th className="px-5 py-3 font-semibold text-cyan-800 dark:text-cyan-300">Tax (PPH21 ~5%)</th>
                        <th className="px-5 py-3 font-semibold text-cyan-800 dark:text-cyan-300">Net Estimated Pay</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-black/20">
                     {simulatedData.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                           <td className="px-5 py-4">
                              <div className="font-bold text-slate-800 dark:text-slate-200">{row.name}</div>
                              <div className="text-xs text-slate-500">{row.role}</div>
                           </td>
                           <td className="px-5 py-4 text-slate-600 dark:text-slate-400 font-medium">{formatRupiah(row.base)}</td>
                           <td className="px-5 py-4 text-emerald-600 font-medium">{row.present} days</td>
                           <td className="px-5 py-4">
                              <div className="flex gap-2">
                                 {row.geofenceBreach > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-500/30">{row.geofenceBreach} Geofence Exit</span>}
                                 {row.late > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">{row.late} Late</span>}
                                 {row.geofenceBreach === 0 && row.late === 0 && <span className="text-slate-400">-</span>}
                              </div>
                           </td>
                           <td className="px-5 py-4 text-red-600 dark:text-red-400 font-medium">-{formatRupiah(row.deduction)}</td>
                           <td className="px-5 py-4 text-indigo-600 dark:text-indigo-400 font-medium">-{formatRupiah(row.tax)}</td>
                           <td className="px-5 py-4 font-black text-emerald-700 dark:text-emerald-400 text-base">{formatRupiah(row.net)}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      ) : (
        <div>
           <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Recent Payroll History</h3>
           <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
              <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                    <tr>
                       <th className="px-5 py-3 font-semibold text-slate-500">Period</th>
                       <th className="px-5 py-3 font-semibold text-slate-500">Processing Date</th>
                       <th className="px-5 py-3 font-semibold text-slate-500">Total Employees</th>
                       <th className="px-5 py-3 font-semibold text-slate-500">Total Disbursed</th>
                       <th className="px-5 py-3 font-semibold text-slate-500 text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {[
                       { period: 'May 2026', date: 'May 25, 2026', total: 140, amount: 'Rp 825,600,000' },
                       { period: 'Apr 2026', date: 'Apr 25, 2026', total: 139, amount: 'Rp 812,400,000' },
                       { period: 'Mar 2026', date: 'Mar 25, 2026', total: 138, amount: 'Rp 808,100,000' },
                    ].map((row, i) => (
                       <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                          <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">{row.period}</td>
                          <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{row.date}</td>
                          <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{row.total}</td>
                          <td className="px-5 py-4 font-medium text-slate-800 dark:text-slate-200">{row.amount}</td>
                          <td className="px-5 py-4 text-right space-x-3">
                             <button className="text-cyan-600 hover:underline font-medium text-xs">View Details</button>
                             <button className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium text-xs">Download Report</button>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  );
}

function PerformanceView() {
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>('1');

  const employees = [
    { id: '1', name: 'Dian Anugrah', role: 'Teacher', evalDate: 'June 05, 2026', overallScore: '88/100', grade: 'A', status: 'Completed', metrics: [
      { subject: 'Teaching Quality', A: 95, fullMark: 100 },
      { subject: 'Attendance', A: 98, fullMark: 100 },
      { subject: 'Attitude', A: 85, fullMark: 100 },
      { subject: 'Teamwork', A: 80, fullMark: 100 },
      { subject: 'Innovation', A: 82, fullMark: 100 },
    ]},
    { id: '2', name: 'Budi Santoso', role: 'IT Support', evalDate: 'June 02, 2026', overallScore: '76/100', grade: 'B+', status: 'Completed', metrics: [
      { subject: 'Tech Skills', A: 85, fullMark: 100 },
      { subject: 'Attendance', A: 70, fullMark: 100 },
      { subject: 'Attitude', A: 80, fullMark: 100 },
      { subject: 'Teamwork', A: 75, fullMark: 100 },
      { subject: 'Response T.', A: 70, fullMark: 100 },
    ]},
    { id: '3', name: 'Siti Nurhaliza', role: 'Senior Teacher', evalDate: 'May 28, 2026', overallScore: '-', grade: 'TBD', status: 'Pending Review', metrics: [
      { subject: 'Teaching Quality', A: 90, fullMark: 100 },
      { subject: 'Attendance', A: 92, fullMark: 100 },
      { subject: 'Attitude', A: 95, fullMark: 100 },
      { subject: 'Teamwork', A: 90, fullMark: 100 },
      { subject: 'Innovation', A: 88, fullMark: 100 },
    ]},
  ];

  const selectedEmpData = employees.find(e => e.id === selectedEmployee) || employees[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       {/* Individual Scorecard Section */}
       <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden flex flex-col lg:flex-row">
          {/* List/Sidebar */}
          <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
            <div className="p-4 border-b border-slate-200 dark:border-white/5">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-600" /> Employee Scorecards
              </h3>
            </div>
            <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
              {employees.map(emp => (
                 <button 
                   key={emp.id}
                   onClick={() => setSelectedEmployee(emp.id)}
                   className={cn(
                     "w-full text-left p-3 rounded-xl transition-all border",
                     selectedEmployee === emp.id 
                       ? "bg-white dark:bg-black/40 border-cyan-200 dark:border-cyan-500/30 shadow-sm" 
                       : "border-transparent hover:bg-white/50 dark:hover:bg-white/5"
                   )}
                 >
                    <div className="flex justify-between items-start mb-1">
                       <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{emp.name}</span>
                       <span className={cn(
                         "text-[10px] font-bold px-1.5 py-0.5 rounded",
                         emp.status === 'Completed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                       )}>{emp.status}</span>
                    </div>
                    <div className="text-xs text-slate-500">{emp.role}</div>
                 </button>
              ))}
            </div>
          </div>

          {/* Details / Chart */}
          <div className="w-full lg:w-2/3 p-6 flex flex-col md:flex-row gap-6 items-center">
             <div className="w-full md:w-1/2">
                <div className="mb-6">
                  <h2 className="text-2xl font-black text-slate-800 dark:text-slate-200 mb-1">{selectedEmpData.name}</h2>
                  <p className="text-slate-500 font-medium">{selectedEmpData.role}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                   <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/5">
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Overall Score</div>
                      <div className="text-3xl font-black text-cyan-600 dark:text-cyan-400">{selectedEmpData.overallScore}</div>
                   </div>
                   <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/5">
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Grade</div>
                      <div className="text-3xl font-black text-slate-800 dark:text-slate-200">{selectedEmpData.grade}</div>
                   </div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                   <div className="flex items-start gap-3">
                     <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                     <div>
                       <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Latest Evaluation</div>
                       <div className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">Conducted on {selectedEmpData.evalDate}. Discussed areas of improvement and next quarter goals.</div>
                     </div>
                   </div>
                </div>
             </div>
             
             <div className="w-full md:w-1/2 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedEmpData.metrics}>
                    <PolarGrid stroke="#cbd5e1" opacity={0.3} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Radar name={selectedEmpData.name} dataKey="A" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.4} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
               <h3 className="font-semibold text-slate-800 dark:text-slate-200">Department Performance (Q1 2026)</h3>
               <select className="bg-slate-50 dark:bg-[#0a0a0a] text-xs px-2 py-1 rounded border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 outline-none">
                 <option>Q1 2026</option>
                 <option>Q4 2025</option>
               </select>
             </div>
             
             <div className="space-y-5">
                {[
                  { name: 'Academic Affairs', score: 94, target: 90 },
                  { name: 'Student Management (Musyrif)', score: 88, target: 85 },
                  { name: 'Admissions & Marketing', score: 96, target: 92 },
                  { name: 'IT & Operations', score: 91, target: 90 },
                ].map((dept, i) => (
                   <div key={i}>
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{dept.name}</span>
                         <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{dept.score}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-2">
                         <div className={cn("h-2 rounded-full", dept.score >= dept.target ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${dept.score}%` }}></div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
          
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
             <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-slate-400" />
             </div>
             <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Performance Goals & OKRs</h3>
             <p className="text-sm text-slate-500 mb-6 max-w-xs">Track company-wide objectives and align them with individual employee targets.</p>
             <button className="w-full py-3 border border-dashed border-slate-300 dark:border-white/20 text-slate-600 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl text-sm font-bold transition-colors">
                Configure OKRs Framework
             </button>
          </div>
       </div>
    </div>
  );
}

function RecruitmentView() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Open Positions', value: '8', icon: <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />, bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-200 dark:border-indigo-500/20' },
          { label: 'Total Applicants', value: '243', icon: <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />, bg: 'bg-cyan-50 dark:bg-cyan-500/10', border: 'border-cyan-200 dark:border-cyan-500/20' },
          { label: 'Interviews Scheduled', value: '12', icon: <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />, bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
          { label: 'Offers Extended', value: '3', icon: <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />, bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/20' },
        ].map((stat, i) => (
          <div key={i} className={cn("p-4 rounded-xl border shadow-sm", stat.bg, stat.border)}>
            <div className="flex items-center gap-3 mb-2">
              {stat.icon}
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{stat.label}</span>
            </div>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-200">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">AI-Screened Candidates</h3>
          <button className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + New Job Posting
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
              <tr>
                <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase">Candidate</th>
                <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase">Position Applied</th>
                <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase">AI Match Score</th>
                <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase">Status</th>
                <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {[
                { name: 'Diana Fitri', role: 'Mathematics Teacher', match: 94, status: 'Interview', email: 'diana.f@example.com' },
                { name: 'Rizky Wahyudi', role: 'IT Support', match: 88, status: 'Screening', email: 'r.wahyudi@example.com' },
                { name: 'Sarah Amanda', role: 'Mathematics Teacher', match: 85, status: 'Screening', email: 'samanda@example.com' },
                { name: 'Fikri Hakim', role: 'School Counselor', match: 91, status: 'Offer', email: 'f.hakim@example.com' },
              ].map((cand, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{cand.name}</div>
                    <div className="text-xs text-slate-500">{cand.email}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{cand.role}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-full max-w-[100px] bg-slate-100 dark:bg-white/5 rounded-full h-2">
                        <div className={cn("h-2 rounded-full", cand.match >= 90 ? "bg-emerald-500" : "bg-cyan-500")} style={{ width: `${cand.match}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{cand.match}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn(
                      "px-2 py-1 text-xs font-semibold rounded-md",
                      cand.status === 'Interview' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      cand.status === 'Offer' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                    )}>
                      {cand.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right space-x-3">
                    <button className="text-cyan-600 hover:underline font-medium text-xs">Review Fit</button>
                    <button className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium text-xs">Schedule</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalyticsView() {
  const attritionData = [
    { name: 'Jan', rate: 1.2 },
    { name: 'Feb', rate: 1.4 },
    { name: 'Mar', rate: 1.1 },
    { name: 'Apr', rate: 1.0 },
    { name: 'May', rate: 1.5 },
    { name: 'Jun', rate: 0.8 },
  ];

  const COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
  const distributionData = [
    { name: 'Academic Affairs', value: 85 },
    { name: 'Student Management', value: 40 },
    { name: 'Operations & IT', value: 10 },
    { name: 'Admin & HR', value: 7 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-100 dark:bg-cyan-500/20 rounded-xl text-cyan-600 dark:text-cyan-400">
             <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-cyan-800 dark:text-cyan-300">Predictive Flight Risk</h3>
            <p className="text-sm text-cyan-700 dark:text-cyan-500">AI has identified 3 key employees at risk of leaving based on engagement metrics.</p>
          </div>
        </div>
        <button className="bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-700 transition">
          View Recommendations
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-6">Historical Attrition Rate (%)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attritionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.3} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="rate" stroke="#06b6d4" fillOpacity={1} fill="url(#colorRate)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-6">Department Distribution</h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" /> Sentiment Analysis (Current Month)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-4 border border-slate-100 dark:border-white/5 rounded-xl">
            <div className="text-3xl font-black text-emerald-600 mb-1">78%</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Positive Sentiment</div>
            <p className="text-xs text-slate-500 mt-2">Based on anonymous NLP pulse surveys.</p>
          </div>
          <div className="p-4 border border-slate-100 dark:border-white/5 rounded-xl">
             <div className="text-3xl font-black text-amber-600 mb-1">15%</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Neutral Sentiment</div>
            <div className="w-full bg-slate-100 dark:bg-white/5 h-1.5 mt-3 rounded-full overflow-hidden">
               <div className="bg-amber-500 h-full w-[15%]"></div>
            </div>
          </div>
          <div className="p-4 border border-slate-100 dark:border-white/5 rounded-xl">
             <div className="text-3xl font-black text-red-600 mb-1">7%</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Negative Sentiment</div>
             <div className="w-full bg-slate-100 dark:bg-white/5 h-1.5 mt-3 rounded-full overflow-hidden">
               <div className="bg-red-500 h-full w-[7%]"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendanceKiosk({ onClose }: { onClose: () => void }) {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'success'>('idle');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          setLocationError('Unable to retrieve location.');
        }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser.');
    }
  }, []);
  
  const handleScan = () => {
    if (!location) {
        alert("Wait for location detection or verify location permissions.");
        return;
    }
    setScanState('scanning');
    setTimeout(() => {
      setScanState('success');
    }, 2000);
  };

  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-black w-full max-w-4xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row shadow-cyan-900/20">
         {/* Left Panel: Camera view / Kiosk Info */}
         <div className="w-full md:w-3/5 bg-slate-950 p-8 flex flex-col items-center justify-between min-h-[500px] relative border-b md:border-b-0 md:border-r border-white/10">
            <div className="w-full flex justify-between items-start">
               <div className="flex items-center gap-2">
                 <Briefcase className="w-6 h-6 text-cyan-500" />
                 <span className="font-bold text-white text-xl">Serene HRIS</span>
               </div>
               <button onClick={onClose} className="px-4 py-2 border border-white/20 rounded-full text-white text-sm hover:bg-white/10 transition">
                 Exit Kiosk
               </button>
            </div>
            
            <div className="flex-1 w-full flex flex-col items-center justify-center py-8">
               {scanState === 'idle' && (
                 <div className="w-64 h-64 border-4 border-dashed border-cyan-500/30 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500 hover:bg-cyan-500/5 transition-all group relative" onClick={handleScan}>
                   <ScanFace className="w-16 h-16 text-cyan-400 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all mb-4" />
                   <p className="text-cyan-200 font-medium mt-2">Tap to Scan Face</p>
                   {location ? (
                       <div className="absolute -bottom-8 flex items-center gap-1 text-xs text-emerald-400">
                           <MapPin className="w-3 h-3" /> Location verified
                       </div>
                   ) : locationError ? (
                       <div className="absolute -bottom-16 flex flex-col items-center gap-1 text-xs text-red-400 text-center w-[120%] z-10">
                           <div className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {locationError}</div>
                           <button 
                               onClick={(e) => { 
                                   e.stopPropagation(); 
                                   setLocation({ lat: -6.200000, lng: 106.816666 }); 
                                   setLocationError(null); 
                               }}
                               className="mt-1 px-2 py-1 bg-white/10 rounded hover:bg-white/20 text-cyan-300 text-[10px] pointer-events-auto"
                           >
                               Use Mock Location (Test Mode)
                           </button>
                       </div>
                   ) : (
                       <div className="absolute -bottom-8 flex items-center gap-1 text-xs text-amber-400">
                           <Timer className="w-3 h-3 animate-spin" /> Detecting location...
                       </div>
                   )}
                 </div>
               )}
               {scanState === 'scanning' && (
                 <div className="w-64 h-64 border-4 border-cyan-500 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-0 w-full h-1 bg-cyan-400 shadow-[0_0_15px_#22d3ee] animate-[bounce_1.5s_infinite]"></div>
                    <ScanFace className="w-16 h-16 text-cyan-400 mb-4 animate-[pulse_1s_infinite]" />
                    <p className="text-cyan-200 font-medium animate-pulse">Analyzing Biometrics...</p>
                 </div>
               )}
               {scanState === 'success' && (
                 <div className="w-64 h-64 border-4 border-emerald-500 rounded-2xl flex flex-col items-center justify-center bg-emerald-500/10 animate-in zoom-in duration-300">
                    <CheckCircle className="w-16 h-16 text-emerald-400 mb-2" />
                    <p className="text-emerald-200 font-bold text-xl">Verified</p>
                    <p className="text-emerald-400 text-sm mt-1">Dian Anugrah</p>
                    {location && (
                        <div className="mt-4 flex flex-col items-center bg-black/40 px-3 py-2 rounded-lg border border-emerald-500/20">
                            <div className="flex items-center gap-1 text-xs text-emerald-300 font-medium mb-1">
                                <MapPin className="w-3 h-3" /> Location Captured
                            </div>
                            <span className="text-[10px] text-emerald-500/70">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
                        </div>
                    )}
                 </div>
               )}
            </div>
            
            <div className="w-full flex items-center justify-center gap-6 text-slate-400">
               <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Main Campus Gate A</div>
               <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Live AI Engine Active</div>
            </div>
         </div>
         
         {/* Right Panel: Check in/out */}
         <div className="w-full md:w-2/5 bg-slate-900 p-8 flex flex-col items-center justify-center">
             <div className="mb-10 text-center">
                <div className="text-6xl font-black text-white tracking-tighter mb-2">{timeString}</div>
                <div className="text-slate-400 font-medium uppercase tracking-widest">{dateString}</div>
             </div>
             
             {scanState === 'success' ? (
               <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <button onClick={() => { setScanState('idle'); onClose(); }} className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg transition-colors group">
                    <LogIn className="w-5 h-5 group-hover:-translate-y-1 transition-transform" /> Clock In
                  </button>
                  <button onClick={() => { setScanState('idle'); onClose(); }} className="w-full flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold text-lg border border-slate-700 transition-colors group">
                    <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" /> Clock Out
                  </button>
                  <p className="text-center text-emerald-400 text-sm font-medium mt-4">Welcome back, Dian! Have a great day.</p>
               </div>
             ) : (
               <div className="w-full bg-slate-800/50 border border-slate-700 p-6 rounded-2xl flex flex-col items-center text-center">
                  <Fingerprint className="w-12 h-12 text-slate-500 mb-4" />
                  <h4 className="text-white font-medium mb-1">Awaiting Verification</h4>
                  <p className="text-slate-400 text-sm mb-4">Please look at the camera or scan your ID badge to clock in or out.</p>
                  
                  <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                     <div className="h-full bg-slate-500 w-1/3 animate-[pulse_2s_infinite]"></div>
                  </div>
               </div>
             )}
         </div>
      </div>
    </div>
  )
}

function LiveTrackingView() {
  const centerPosition: [number, number] = [-6.200000, 106.816666]; 
  const GEOFENCE_RADIUS_M = 800;

  const [staffList, setStaffList] = useState([
    { id: 1, name: 'Budi Santoso', role: 'IT Support', location: [-6.201, 106.815] as [number, number], status: 'On-Site', time: '10:45 AM', autoCheckoutAlert: false },
    { id: 2, name: 'Anita Wijaya', role: 'HR Manager', location: [-6.195, 106.820] as [number, number], status: 'Remote', time: '10:30 AM', autoCheckoutAlert: false },
    { id: 3, name: 'Dian Anugrah', role: 'Teacher', location: [-6.205, 106.810] as [number, number], status: 'On-Site', time: '11:00 AM', autoCheckoutAlert: false },
    { id: 4, name: 'Dr. Ahmad Fauzi', role: 'Headmaster', location: [-6.198, 106.818] as [number, number], status: 'On-Site', time: '08:00 AM', autoCheckoutAlert: false }
  ]);

  const [geofenceLogs, setGeofenceLogs] = useState<{time: string, message: string}[]>([]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // meters
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const simulateGeofenceBreach = () => {
    setStaffList(prev => prev.map(staff => {
      if (staff.id === 1) { // Move Budi out
        const newLocation: [number, number] = [-6.210000, 106.825000];
        const dist = calculateDistance(centerPosition[0], centerPosition[1], newLocation[0], newLocation[1]);
        
        if (dist > GEOFENCE_RADIUS_M && staff.status === 'On-Site') {
           setGeofenceLogs(logs => [{
             time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
             message: `${staff.name} breached geofence boundary. Automated check-out initiated.`
           }, ...logs]);
           return { ...staff, location: newLocation, status: 'Auto-Checked Out', autoCheckoutAlert: true, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        }
        return { ...staff, location: newLocation };
      }
      return staff;
    }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                 <MapPin className="w-5 h-5 text-cyan-600" /> Live Staff
               </h3>
               <button onClick={simulateGeofenceBreach} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 px-2 py-1 rounded" title="Simulate employee walking out of boundary">
                 Simulate Exit
               </button>
            </div>
            
            <div className="space-y-3">
              {staffList.map(staff => (
                <div key={staff.id} className={cn("p-3 border rounded-xl transition-colors", staff.autoCheckoutAlert ? "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20" : "border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02]")}>
                  <div className="flex justify-between items-start">
                     <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{staff.name}</div>
                     {staff.autoCheckoutAlert && <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />}
                  </div>
                  <div className="text-xs text-slate-500 my-1">{staff.role}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md",
                      staff.status === 'On-Site' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                      staff.status === 'Auto-Checked Out' ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" :
                      staff.status === 'Remote' ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400" :
                      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                    )}>
                      {staff.status}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {staff.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {geofenceLogs.length > 0 && (
             <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl p-5 shadow-sm animate-in fade-in slide-in-from-top-2">
                <h3 className="font-bold text-red-800 dark:text-red-400 flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4" /> Geofence Alerts
                </h3>
                <div className="space-y-2">
                   {geofenceLogs.map((log, i) => (
                      <div key={i} className="text-xs p-2 bg-white/60 dark:bg-black/20 rounded border border-red-100 dark:border-red-900/50">
                         <span className="font-bold text-red-700 dark:text-red-400 mr-2">{log.time}</span>
                         <span className="text-red-900 dark:text-red-300">{log.message}</span>
                      </div>
                   ))}
                </div>
             </div>
          )}
        </div>

        <div className="lg:col-span-3 h-[600px] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/5 relative z-0">
          <MapContainer center={centerPosition} zoom={14} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* Campus Area Geofence */}
            <Circle 
              center={centerPosition} 
              pathOptions={{ fillColor: '#22d3ee', color: '#06b6d4', weight: 2 }} 
              radius={GEOFENCE_RADIUS_M} 
            >
              <Popup>Main Campus Area ({GEOFENCE_RADIUS_M}m radius)</Popup>
            </Circle>

            {staffList.map(staff => (
              <Marker key={staff.id} position={staff.location}>
                <Popup>
                  <div className="text-center">
                    <div className="font-bold text-slate-800">{staff.name}</div>
                    <div className="text-xs text-slate-500 mb-1">{staff.role}</div>
                    <div className={cn("text-xs font-semibold px-2 py-1 rounded inline-block",
                        staff.status === 'Auto-Checked Out' ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                    )}>
                        {staff.status}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

function ShiftPlannerView() {
  const [shifts, setShifts] = useState([
    { id: 1, name: 'Budi Santoso', role: 'IT Support', mon: 'Morning', tue: 'Morning', wed: 'Evening', thu: 'Evening', fri: 'Off' },
    { id: 2, name: 'Anita Wijaya', role: 'HR Manager', mon: 'Morning', tue: 'Morning', wed: 'Morning', thu: 'Morning', fri: 'Morning' },
    { id: 3, name: 'Dian Anugrah', role: 'Teacher', mon: 'Morning', tue: 'Evening', wed: 'Morning', thu: 'Evening', fri: 'Morning' },
    { id: 4, name: 'Fajar Siddiq', role: 'Security', mon: 'Night', tue: 'Night', wed: 'Night', thu: 'Off', fri: 'Night' },
    { id: 5, name: 'Siti Nurhaliza', role: 'Admin', mon: 'Morning', tue: 'Morning', wed: 'Morning', thu: 'Morning', fri: 'Morning' },
    { id: 6, name: 'Dr. Ahmad Fauzi', role: 'Headmaster', mon: 'Morning', tue: 'Morning', wed: 'Off', thu: 'Morning', fri: 'Morning' }
  ]);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const getShiftColor = (shift: string) => {
    switch(shift) {
      case 'Morning': return 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400 border-sky-200 dark:border-sky-500/30';
      case 'Evening': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
      case 'Night': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30';
      case 'Off': return 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400 border-slate-200 dark:border-white/10';
      default: return 'bg-slate-50 text-slate-500';
    }
  };

  const handleShiftChange = (id: number, day: string, value: string) => {
    setShifts(prev => prev.map(emp => emp.id === id ? { ...emp, [day]: value } : emp));
  };

  const handleAiGenerate = () => {
    setIsAiGenerating(true);
    setTimeout(() => {
      setShifts(prev => prev.map(emp => {
        if (emp.role === 'Security') return { ...emp, mon: 'Morning', tue: 'Off', wed: 'Night', thu: 'Night', fri: 'Morning' };
        if (emp.role === 'Teacher') return { ...emp, mon: 'Evening', tue: 'Morning', wed: 'Evening', thu: 'Morning', fri: 'Evening' };
        if (emp.role.includes('Admin')) return { ...emp, mon: 'Morning', tue: 'Evening', wed: 'Morning', thu: 'Morning', fri: 'Off' };
        return { ...emp, mon: 'Morning', tue: 'Morning', wed: 'Morning', thu: 'Morning', fri: 'Morning' };
      }));
      setIsAiGenerating(false);
    }, 1500);
  };

  const handlePublish = () => {
    setIsPublishing(true);
    setTimeout(() => {
      setIsPublishing(false);
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Weekly Shift Roster</h3>
          <p className="text-sm text-slate-500 flex items-center gap-2"><CalendarRange className="w-4 h-4" /> June 8 - June 14, 2026</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleAiGenerate}
            disabled={isAiGenerating}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 px-4 py-2 rounded-lg font-medium text-sm transition"
          >
            {isAiGenerating ? <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div> : <BrainCircuit className="w-4 h-4" />}
            Auto-Schedule
          </button>
          <button 
            onClick={handlePublish}
            disabled={isPublishing}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-sm transition"
          >
            {isPublishing ? <CheckCircle className="w-4 h-4" /> : <CalendarRange className="w-4 h-4" />}
            {isPublishing ? 'Published!' : 'Publish Shifts'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
            <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/5">
              <tr>
                <th className="px-5 py-3 font-semibold text-slate-500 w-48">Employee</th>
                <th className="px-3 py-3 font-semibold text-slate-500 text-center">Monday</th>
                <th className="px-3 py-3 font-semibold text-slate-500 text-center">Tuesday</th>
                <th className="px-3 py-3 font-semibold text-slate-500 text-center">Wednesday</th>
                <th className="px-3 py-3 font-semibold text-slate-500 text-center">Thursday</th>
                <th className="px-3 py-3 font-semibold text-slate-500 text-center">Friday</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {shifts.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{emp.name}</div>
                    <div className="text-xs text-slate-500">{emp.role}</div>
                  </td>
                  {['mon', 'tue', 'wed', 'thu', 'fri'].map(day => (
                    <td key={day} className="px-3 py-4 text-center">
                      <select 
                        value={(emp as any)[day]}
                        onChange={(e) => handleShiftChange(emp.id, day, e.target.value)}
                        className={cn(
                          "w-28 text-xs font-bold px-2 py-1.5 rounded-lg border appearance-none text-center outline-none transition-colors cursor-pointer",
                          getShiftColor((emp as any)[day])
                        )}
                      >
                        <option value="Morning">Morn (08-16)</option>
                        <option value="Evening">Eve (16-00)</option>
                        <option value="Night">Night (00-08)</option>
                        <option value="Off">Off Day</option>
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl">
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 rounded-full bg-sky-400"></div>
           <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Morning (08:00 - 16:00)</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 rounded-full bg-amber-400"></div>
           <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Evening (16:00 - 00:00)</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 rounded-full bg-indigo-400"></div>
           <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Night (00:00 - 08:00)</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-white/20"></div>
           <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Off Duty</span>
        </div>
      </div>
    </div>
  );
}

function LeaveRequestView() {
  const [leaveRequests, setLeaveRequests] = useState([
    { id: '1', name: 'Siti Nurhaliza', role: 'Admin', type: 'Annual Leave', dates: 'Jun 12, 2026 - Jun 15, 2026', days: 3, status: 'Pending', balance: 10, attachment: true },
    { id: '2', name: 'Budi Santoso', role: 'IT Support', type: 'Sick Leave', dates: 'Jun 10, 2026', days: 1, status: 'Pending', balance: 14, attachment: true },
    { id: '3', name: 'Dian Anugrah', role: 'Teacher', type: 'Annual Leave', dates: 'May 20, 2026 - May 25, 2026', days: 4, status: 'Approved', balance: 6, attachment: false },
    { id: '4', name: 'Fajar Siddiq', role: 'Security', type: 'Unpaid Leave', dates: 'May 10, 2026', days: 1, status: 'Rejected', balance: 0, attachment: false },
  ]);

  const outstandingLeaves = leaveRequests.filter(req => req.status === 'Pending');
  const pastLeaves = leaveRequests.filter(req => req.status !== 'Pending');

  const handleAction = (id: string, newStatus: string) => {
    setLeaveRequests(prev => prev.map(req => req.id === id ? { ...req, status: newStatus } : req));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approvals', value: outstandingLeaves.length, icon: <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />, bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
          { label: 'Total Leaves (This Month)', value: '14', icon: <CalendarCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />, bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-200 dark:border-indigo-500/20' },
          { label: 'Employees on Leave Today', value: '2', icon: <Plane className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />, bg: 'bg-cyan-50 dark:bg-cyan-500/10', border: 'border-cyan-200 dark:border-cyan-500/20' },
          { label: 'Unplanned Absences', value: '1', icon: <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />, bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/20' },
        ].map((stat, i) => (
          <div key={i} className={cn("p-4 rounded-xl border shadow-sm", stat.bg, stat.border)}>
            <div className="flex items-center gap-3 mb-2">
              {stat.icon}
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{stat.label}</span>
            </div>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-200">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Pending Approvals */}
         <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm p-6 overflow-hidden flex flex-col h-[500px]">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                 <Clock className="w-5 h-5 text-amber-500" /> Pending Approval ({outstandingLeaves.length})
               </h3>
               <button className="text-sm font-medium text-cyan-600 hover:text-cyan-700">Approve All</button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
               {outstandingLeaves.map(req => (
                  <div key={req.id} className="p-4 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                     <div className="flex justify-between items-start mb-2">
                        <div>
                           <div className="font-bold text-slate-800 dark:text-slate-200">{req.name}</div>
                           <div className="text-xs text-slate-500">{req.role}</div>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 rounded-lg">
                           {req.type}
                        </span>
                     </div>
                     <div className="bg-slate-50 dark:bg-black/20 p-3 rounded-lg mb-3">
                        <div className="flex justify-between text-sm mb-1 text-slate-600 dark:text-slate-400">
                           <span className="font-medium"><CalendarRange className="w-4 h-4 inline mr-1" /> {req.dates}</span>
                           <span className="font-bold text-slate-800 dark:text-slate-200">{req.days} days</span>
                        </div>
                        <div className="text-xs text-slate-500 flex justify-between items-center">
                           <span>Current Balance: <span className="font-bold text-slate-700 dark:text-slate-300">{req.balance} days</span></span>
                           {req.attachment && <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400"><FileText className="w-3 h-3" /> Doctor's Note</span>}
                        </div>
                     </div>
                     <div className="flex gap-2">
                        <button 
                           onClick={() => handleAction(req.id, 'Approved')}
                           className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex justify-center items-center gap-2"
                        >
                           <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                        <button 
                           onClick={() => handleAction(req.id, 'Rejected')}
                           className="flex-1 bg-white hover:bg-slate-50 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 py-2 rounded-lg text-sm font-bold transition-colors flex justify-center items-center gap-2"
                        >
                           <CalendarX className="w-4 h-4" /> Decline
                        </button>
                     </div>
                  </div>
               ))}
               {outstandingLeaves.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 mt-10">
                     <CheckCircle className="w-12 h-12 mb-3 text-emerald-400 opacity-50" />
                     <p className="font-medium">All caught up!</p>
                     <p className="text-sm">No pending leave requests.</p>
                  </div>
               )}
            </div>
         </div>

         {/* Leave Calendar & Policy Overview */}
         <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm p-6 flex flex-col h-[500px]">
             <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-6">
               <CalendarRange className="w-5 h-5 text-cyan-600" /> Recent Leave Activity
             </h3>
             <div className="flex-1 overflow-y-auto pr-2">
                 <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                   <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/5">
                         <tr>
                            <th className="px-4 py-3 font-semibold text-slate-500">Employee</th>
                            <th className="px-4 py-3 font-semibold text-slate-500">Dates</th>
                            <th className="px-4 py-3 font-semibold text-slate-500">Type</th>
                            <th className="px-4 py-3 font-semibold text-slate-500 text-right">Status</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-black/20">
                         {pastLeaves.map(req => (
                            <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                               <td className="px-4 py-3">
                                  <div className="font-bold text-slate-800 dark:text-slate-200">{req.name}</div>
                                  <div className="text-xs text-slate-500">{req.role}</div>
                               </td>
                               <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">
                                  {req.dates}
                               </td>
                               <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                                  {req.type}
                               </td>
                               <td className="px-4 py-3 text-right">
                                  <span className={cn(
                                     "text-xs font-bold px-2 py-1.5 rounded-lg",
                                     req.status === 'Approved' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                                     "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                                  )}>
                                     {req.status}
                                  </span>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                 </div>
                 
                 <div className="mt-8 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Company Policy Limits</h4>
                    <div className="space-y-2">
                       <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Annual Paid Leave</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">12 Days / Year</span>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Sick Leave (Paid)</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">14 Days / Year</span>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Maternity Leave</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">3 Months</span>
                       </div>
                       <div className="pt-2 mt-2 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500">
                          Leaves beyond quota are subject to automatic deduction in Payroll.
                       </div>
                    </div>
                 </div>
             </div>
         </div>
      </div>
    </div>
  );
}