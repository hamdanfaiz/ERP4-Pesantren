import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Search,
  Filter,
  MapPin,
  Briefcase,
  MessageSquare,
  Calendar,
  HeartHandshake,
  Download,
  Users,
  Award,
  Globe,
  TrendingUp,
  ChevronDown,
  UserPlus,
  X,
  Loader2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { cn } from '../lib/utils';
import { getAllMasterDataRecords } from '../data/mockRecords';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, getDocs } from 'firebase/firestore';

// Use more sophisticated, desaturated colors for charts instead of generic bright ones
const COLORS = ['#4f46e5', '#0ea5e9', '#64748b', '#cbd5e1', '#334155'];

const MOCK_EVENTS = [
  { id: 1, title: 'Reuni Akbar Lintas Angkatan 2026', date: '2026-08-15', location: 'Gedung Serbaguna Pesantren', attendees: 450, type: 'Reunion' },
  { id: 2, title: 'Webinar: Karir di Era Digital', date: '2026-06-20', location: 'Online (Zoom)', attendees: 120, type: 'Webinar' },
  { id: 3, title: 'Pengajian Rutin IKAPES', date: '2026-07-05', location: 'Masjid Jami', attendees: 80, type: 'Religious' },
];

const MOCK_DONATIONS = [
  { id: 'DON-01', campaign: 'Pembangunan Masjid Asrama Baru', amount: 50000000, donor: 'Angkatan 2015', date: '2026-05-12' },
  { id: 'DON-02', campaign: 'Beasiswa Santri Berprestasi', amount: 15000000, donor: 'Hamba Allah (Alumni)', date: '2026-06-01' },
  { id: 'DON-03', campaign: 'Wakaf Pembebasan Lahan', amount: 100000000, donor: 'IKAPES Regional Jakarta', date: '2026-04-20' },
];

export function AlumniManager() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'directory' | 'tracer' | 'community' | 'donations'>('directory');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [majorFilter, setMajorFilter] = useState('');
  const [alumniData, setAlumniData] = useState<any[]>([]);
  const [isGraduateModalOpen, setIsGraduateModalOpen] = useState(false);
  const [santriList, setSantriList] = useState<any[]>([]);
  const [selectedSantriId, setSelectedSantriId] = useState('');
  const [isGraduating, setIsGraduating] = useState(false);
  const [events, setEvents] = useState<any[]>(MOCK_EVENTS);
  const [isCreateEventModalOpen, setIsCreateEventModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    location: '',
    type: 'Reunion'
  });

  const fetchActiveSantri = async () => {
    try {
      const q = tenantScopedQuery(collection(db, "entityRecords"), user?.tenantId, where("type", "==", "Santri"));
      const snapshot = await getDocs(q);
      const activeSantri = snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
        .filter((s: any) => s.status !== 'Alumni');
      setSantriList(activeSantri);
    } catch (error) {
      console.error("Error fetching Santri:", error);
    }
  };

  useEffect(() => {
    if (isGraduateModalOpen) {
      fetchActiveSantri();
    }
  }, [isGraduateModalOpen]);

  const handleGraduateSantri = async () => {
    if (!selectedSantriId) return;
    setIsGraduating(true);
    try {
      const docRef = doc(db, "entityRecords", selectedSantriId);
      await updateDoc(docRef, {
        status: "Alumni",
        graduationYear: new Date().getFullYear().toString(),
        graduationDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setIsGraduateModalOpen(false);
      setSelectedSantriId('');
    } catch (error) {
      console.error("Error graduating Santri:", error);
    } finally {
      setIsGraduating(false);
    }
  };

  useEffect(() => {
    // Listen for records that are either explicitly of type "Alumni", or have status "Alumni" (like graduated Santri)
    const qStatus = tenantScopedQuery(collection(db, "entityRecords"), user?.tenantId, where("status", "==", "Alumni"));
    const qType = tenantScopedQuery(collection(db, "entityRecords"), user?.tenantId, where("type", "==", "Alumni"));

    let resultsType: any[] = [];
    let resultsStatus: any[] = [];

    const updateData = () => {
      const merged = [...resultsType, ...resultsStatus];
      const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());

      // If Firebase is empty, fallback to mock data
      if (unique.length === 0) {
        setAlumniData((getAllMasterDataRecords() as any).Alumni || []);
      } else {
        setAlumniData(unique);
      }
    };

    const unsubType = onSnapshot(qType, (snapshot) => {
      resultsType = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
      updateData();
    });

    const unsubStatus = onSnapshot(qStatus, (snapshot) => {
      resultsStatus = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
      updateData();
    });

    return () => {
      unsubType();
      unsubStatus();
    };
  }, [user?.tenantId, user?.uid]);

  const filteredAlumni = alumniData.filter((a: any) => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
                          (a.currentActivity && a.currentActivity.toLowerCase().includes(search.toLowerCase())) ||
                          (a.address && a.address.toLowerCase().includes(search.toLowerCase())) ||
                          (a.email && a.email.toLowerCase().includes(search.toLowerCase())) ||
                          (a.phone && a.phone.toLowerCase().includes(search.toLowerCase()));
    const matchesYear = yearFilter ? a.graduationYear?.toString() === yearFilter : true;
    const matchesMajor = majorFilter ? a.majorOrRole === majorFilter : true;
    return matchesSearch && matchesYear && matchesMajor;
  });

  const uniqueYears = Array.from(new Set(alumniData.map((a: any) => a.graduationYear).filter(Boolean))).sort((a: any, b: any) => b - a);
  const uniqueMajors = Array.from(new Set(alumniData.map((a: any) => a.majorOrRole).filter(Boolean))).sort();

  // Tracer Study aggregations
  const activityCount = alumniData.reduce((acc: any, curr: any) => {
    const activity = curr.currentActivity || 'Unknown';
    acc[activity] = (acc[activity] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(activityCount)
    .map(key => ({ name: key, value: activityCount[key] }))
    .sort((a, b) => b.value - a.value); // Sort for better pie rendering

  const graduationTrend = Object.values(
    alumniData.reduce((acc: any, curr: any) => {
      const year = curr.graduationYear;
      if (!acc[year]) acc[year] = { year: year.toString(), graduates: 0 };
      acc[year].graduates += 1;
      return acc;
    }, {})
  ).sort((a: any, b: any) => parseInt(a.year) - parseInt(b.year));

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header section with refined typography and spacing */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg mb-2">
             <GraduationCap className="w-5 h-5 text-slate-800 dark:text-slate-200" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Alumni Directory & Network
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Manage alumni networks, tracer studies, events, and endowment contributions with integrated insights.
          </p>
        </div>

        {/* Navigation - clean pill style, minimal styling */}
        <div className="flex bg-slate-100 dark:bg-slate-800/60 p-1 rounded-lg">
          {(['directory', 'tracer', 'community', 'donations'] as const).map(tab => (
            <button
              key={tab}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn("erp-tab-control",
                "px-5 py-2 rounded-md text-sm font-medium transition-all capitalize",
                activeTab === tab
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-600"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        {activeTab === 'directory' && (
          <div className="space-y-8">
            {/* Elegant, flat metric cards without arbitrary colors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
               {[
                 { label: "Total Registered", value: alumniData.length, icon: Users },
                 { label: "Employed / Studying", value: Math.floor(alumniData.length * 0.85), icon: Briefcase },
                 { label: "Active Regions", value: "12+", icon: Globe },
                 { label: "Recorded Contributions", value: "Rp 165M", icon: HeartHandshake }
               ].map((metric, idx) => (
                 <div key={idx} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                       <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
                       <metric.icon className="w-4 h-4 text-slate-400" />
                    </div>
                    <p className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">{metric.value}</p>
                 </div>
               ))}
            </div>

            {/* Clean filter bar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="relative w-full md:flex-1 md:max-w-md">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, activity, location, email or phone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm"
                />
              </div>
              <div className="flex w-full md:w-auto items-center gap-2 px-2 pb-2 md:pb-0 md:px-0 pr-2 overflow-x-auto no-scrollbar">
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 hidden md:block mx-2"></div>
                <div className="relative w-32 md:w-40 shrink-0">
                   <select
                     value={majorFilter}
                     onChange={e => setMajorFilter(e.target.value)}
                     className="w-full appearance-none pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                   >
                      <option value="">All Majors/Roles</option>
                      {uniqueMajors.map((major: any) => (
                         <option key={major} value={major}>{major}</option>
                      ))}
                   </select>
                   <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative w-32 md:w-40 shrink-0">
                   <select
                     value={yearFilter}
                     onChange={e => setYearFilter(e.target.value)}
                     className="w-full appearance-none pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                   >
                      <option value="">All Cohorts</option>
                      {uniqueYears.map((year: any) => (
                         <option key={year} value={year}>Class of {year}</option>
                      ))}
                   </select>
                   <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button className="flex shrink-0 items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-lg transition-colors whitespace-nowrap text-sm font-medium">
                  <Download className="w-4 h-4" /> Export
                </button>
                <button
                  onClick={() => setIsGraduateModalOpen(true)}
                  className="flex shrink-0 items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors whitespace-nowrap text-sm font-medium"
                >
                  <UserPlus className="w-4 h-4" /> Add to Alumni
                </button>
              </div>
            </div>

            {/* Refined grid list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {filteredAlumni.map((alumnus: any) => (
                  <div key={alumnus.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
                     <div>
                        <div className="flex items-start gap-4 mb-5">
                           <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-700 dark:text-slate-300 font-bold text-lg border border-slate-200 dark:border-slate-700">
                              {alumnus.name.charAt(0)}
                           </div>
                           <div className="pt-1">
                              <h3 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-tight">{alumnus.name}</h3>
                              <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">
                                 Class of {alumnus.graduationYear}
                              </p>
                           </div>
                        </div>
                        <div className="space-y-3 mt-4 text-sm">
                           <div className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                              <Briefcase className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2 leading-snug">{alumnus.currentActivity || 'Unknown Activity'}</span>
                           </div>
                           <div className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-1 leading-snug">{alumnus.address || 'Unknown Location'}</span>
                           </div>
                        </div>
                     </div>

                     <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <button className="text-sm font-medium text-slate-900 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                           View Profile
                        </button>
                        <button className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5">
                           <MessageSquare className="w-3.5 h-3.5" /> Connect
                        </button>
                     </div>
                  </div>
               ))}
               {filteredAlumni.length === 0 && (
                  <div className="col-span-full py-20 text-center flex flex-col items-center justify-center">
                     <Search className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-4" />
                     <p className="text-lg font-medium text-slate-900 dark:text-slate-200">No alumni found</p>
                     <p className="text-sm text-slate-500 max-w-md mt-2">We couldn't find any alumni matching your search criteria. Try adjusting your filters or search terms.</p>
                  </div>
               )}
            </div>
          </div>
        )}

        {activeTab === 'tracer' && (
          <div className="space-y-8">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">
                 <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-8 flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-slate-400" /> Current Activity Distribution
                 </h3>
                 <div className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie
                         data={pieData}
                         cx="50%"
                         cy="50%"
                         innerRadius={70}
                         outerRadius={100}
                         paddingAngle={2}
                         dataKey="value"
                         stroke="none"
                       >
                         {pieData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                         ))}
                       </Pie>
                       <Tooltip
                         contentStyle={{ backgroundColor: 'rgb(15, 23, 42)', border: '1px solid rgb(51, 65, 85)', borderRadius: '8px', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                         itemStyle={{ color: '#f8fafc', fontSize: '14px' }}
                       />
                       <Legend
                         verticalAlign="bottom"
                         height={36}
                         iconType="circle"
                         wrapperStyle={{ fontSize: '13px', color: '#64748b' }}
                       />
                     </PieChart>
                   </ResponsiveContainer>
                 </div>
               </div>

               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">
                 <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-8 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-slate-400" /> Graduation Trend by Year
                 </h3>
                 <div className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={graduationTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#cbd5e1" opacity={0.3} />
                       <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                       <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                       <Tooltip
                         contentStyle={{ backgroundColor: 'rgb(15, 23, 42)', border: '1px solid rgb(51, 65, 85)', borderRadius: '8px', color: '#f8fafc' }}
                         itemStyle={{ color: '#f8fafc' }}
                         cursor={{ fill: 'rgba(203, 213, 225, 0.2)' }}
                       />
                       <Bar dataKey="graduates" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={28} />
                     </BarChart>
                   </ResponsiveContainer>
                 </div>
               </div>
             </div>

             {/* Redesigned Active Campaign Banner */}
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 dark:border-slate-800">
                   <div>
                     <div className="flex items-center gap-3 mb-2">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold rounded-md text-[11px] uppercase tracking-wider">Active Campaign</span>
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 font-semibold rounded-md text-[11px] uppercase tracking-wider">Collecting Data</span>
                     </div>
                     <h3 className="text-xl font-bold text-slate-900 dark:text-white">Tracer Study 2026</h3>
                     <p className="text-slate-600 dark:text-slate-400 mt-1 max-w-2xl text-sm">Comprehensive data collection for cohorts 2020-2025 focusing on employment, further studies, and entrepreneurship metrics.</p>
                   </div>
                   <button className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-medium rounded-lg transition-colors text-sm whitespace-nowrap">
                     Manage Campaign
                   </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
                   <div className="p-6 md:p-8">
                     <p className="text-sm font-medium text-slate-500 mb-2">Target Participants</p>
                     <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">250</p>
                   </div>
                   <div className="p-6 md:p-8">
                     <p className="text-sm font-medium text-slate-500 mb-2">Responses Collected</p>
                     <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">185</p>
                   </div>
                   <div className="p-6 md:p-8 bg-slate-50/50 dark:bg-slate-800/20">
                     <div className="flex justify-between items-end mb-3">
                        <p className="text-sm font-medium text-slate-500">Response Rate</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">74%</p>
                     </div>
                     <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-900 dark:bg-slate-100 rounded-full transition-all duration-1000" style={{ width: '74%' }}></div>
                     </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'community' && (
          <div className="space-y-8">
             <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Community Events & Board</h2>
                 <button
                   onClick={() => setIsCreateEventModalOpen(true)}
                   className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-lg font-medium transition-colors text-sm"
                 >
                   Create Event
                 </button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                   {events.map(event => (
                     <div key={event.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row rounded-xl overflow-hidden shadow-sm group hover:shadow-md transition-shadow">
                        <div className="bg-slate-50 dark:bg-slate-800/50 w-full sm:w-32 flex flex-col justify-center items-center py-6 px-4 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800">
                           <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{new Date(event.date).toLocaleString('default', { month: 'short' })}</span>
                           <span className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{new Date(event.date).getDate()}</span>
                        </div>
                        <div className="p-6 flex-1 w-full flex flex-col justify-between">
                           <div>
                              <div className="flex items-center gap-2 mb-3">
                                 <span className="px-2 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-md text-[10px] font-bold uppercase tracking-wider">{event.type}</span>
                              </div>
                              <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{event.title}</h3>
                           </div>
                           <div className="flex flex-wrap items-center gap-y-2 gap-x-6 mt-6 text-sm text-slate-600 dark:text-slate-400">
                              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> {event.location}</div>
                              <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> {event.attendees} Registered</div>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>

                <div>
                   <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                           <Briefcase className="w-4 h-4 text-slate-500" /> Job Board
                        </h4>
                      </div>
                      <div className="p-0">
                         {[
                           { title: 'Guru Bahasa Arab', org: 'Pesantren Al-Ikhlas', tag: 'Full-time' },
                           { title: 'Network Engineer', org: 'PT Berkah Tech', tag: 'Full-time' },
                           { title: 'S2 Timur Tengah', org: 'Kemenag RI', tag: 'Scholarship' },
                         ].map((l, i) => (
                           <div key={i} className="p-6 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                              <h5 className="font-semibold text-slate-900 dark:text-slate-200 text-sm mb-2">{l.title}</h5>
                              <div className="flex justify-between items-center">
                                 <p className="text-sm text-slate-500">{l.org}</p>
                                 <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{l.tag}</span>
                              </div>
                           </div>
                         ))}
                      </div>
                      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                        <button className="w-full py-2 text-slate-900 dark:text-slate-100 text-sm font-medium hover:underline">
                           View All Postings →
                        </button>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'donations' && (
          <div className="space-y-8">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 mb-8 flex items-center gap-2">
                       <Award className="w-5 h-5 text-slate-400" /> Endowment & Philanthropy Progress
                    </h3>
                    <div className="space-y-8">
                       <div>
                          <div className="flex justify-between items-end mb-3">
                             <div>
                                <h4 className="font-semibold text-slate-900 dark:text-slate-200">Pembangunan Masjid Baru</h4>
                                <p className="text-sm text-slate-500 mt-1">Campaign: CMP-26-001</p>
                             </div>
                             <div className="text-right">
                                <p className="font-bold text-slate-900 dark:text-white">Rp 150M</p>
                                <p className="text-sm text-slate-500 mt-1">of Rp 500M goal</p>
                             </div>
                          </div>
                          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                             <div className="h-full bg-slate-900 dark:bg-slate-100 rounded-full" style={{ width: '30%' }}></div>
                          </div>
                       </div>

                       <div>
                          <div className="flex justify-between items-end mb-3">
                             <div>
                                <h4 className="font-semibold text-slate-900 dark:text-slate-200">Beasiswa Santri Yatim</h4>
                                <p className="text-sm text-slate-500 mt-1">Campaign: CMP-26-002</p>
                             </div>
                             <div className="text-right">
                                <p className="font-bold text-slate-900 dark:text-white">Rp 85M</p>
                                <p className="text-sm text-slate-500 mt-1">of Rp 100M goal</p>
                             </div>
                          </div>
                          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                             <div className="h-full bg-slate-900 dark:bg-slate-100 rounded-full" style={{ width: '85%' }}></div>
                          </div>
                       </div>
                    </div>
                </div>

                <div className="bg-slate-900 dark:bg-slate-800 p-8 rounded-xl shadow-sm text-white flex flex-col justify-between border border-slate-800 dark:border-slate-700 relative overflow-hidden">
                   <div className="relative z-10">
                      <p className="text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">Total Endowment</p>
                      <h3 className="text-4xl font-bold tracking-tight mb-4">Rp 4.2B</h3>
                      <p className="text-sm text-slate-400 leading-relaxed max-w-[200px]">Recorded philanthropic contributions from alumni networks since 2015.</p>
                   </div>
                   <button className="w-full mt-8 py-3 bg-white text-slate-900 hover:bg-slate-100 font-medium rounded-lg transition-colors text-sm">
                      Generate Report
                   </button>
                </div>
             </div>

             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
               <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Recent Contributions</h3>
                  <button className="text-sm text-slate-900 dark:text-slate-200 font-medium hover:underline">View All</button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                     <tr>
                       <th className="px-6 py-4 font-medium text-slate-500 dark:text-slate-400">Transaction Date</th>
                       <th className="px-6 py-4 font-medium text-slate-500 dark:text-slate-400">Donor</th>
                       <th className="px-6 py-4 font-medium text-slate-500 dark:text-slate-400">Target Campaign</th>
                       <th className="px-6 py-4 font-medium text-slate-500 dark:text-slate-400 text-right">Amount</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                     {MOCK_DONATIONS.map(item => (
                       <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                         <td className="px-6 py-4">
                           <div className="text-slate-900 dark:text-slate-200 font-medium">{item.date}</div>
                           <div className="text-xs text-slate-500 mt-1">{item.id}</div>
                         </td>
                         <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{item.donor}</td>
                         <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{item.campaign}</td>
                         <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-slate-200">
                           {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.amount)}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          </div>
        )}
      </div>

      {isGraduateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add to Alumni Directory</h3>
              <button
                onClick={() => setIsGraduateModalOpen(false)}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select Graduating Santri
                </label>
                <select
                  value={selectedSantriId}
                  onChange={(e) => setSelectedSantriId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">-- Choose a Santri --</option>
                  {santriList.map((santri) => (
                    <option key={santri.id} value={santri.id}>
                      {santri.name} ({santri.nis || 'No NIS'})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  This will move the selected student to the Alumni directory and record their graduation date.
                </p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setIsGraduateModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                disabled={isGraduating}
              >
                Cancel
              </button>
              <button
                onClick={handleGraduateSantri}
                disabled={!selectedSantriId || isGraduating}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isGraduating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  'Confirm Graduation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Event</h3>
              <button
                onClick={() => setIsCreateEventModalOpen(false)}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="e.g. Reuni Akbar Lintas Angkatan 2026"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="e.g. Gedung Serbaguna Pesantren"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Event Type
                </label>
                <select
                  value={newEvent.type}
                  onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Reunion">Reunion</option>
                  <option value="Webinar">Webinar</option>
                  <option value="Religious">Religious</option>
                  <option value="Networking">Networking</option>
                </select>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setIsCreateEventModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newEvent.title && newEvent.date) {
                    setEvents([...events, { id: Date.now(), attendees: 0, ...newEvent }]);
                    setIsCreateEventModalOpen(false);
                    setNewEvent({ title: '', date: '', location: '', type: 'Reunion' });
                  }
                }}
                disabled={!newEvent.title || !newEvent.date}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50 text-sm font-medium rounded-lg transition-colors"
              >
                Create Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
