import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  HeartHandshake, Target, Users, LayoutList, Search, Plus, TrendingUp, HandCoins, Activity,
  Landmark, MapPin, Building, Calendar, Wallet, FileText, ChevronRight, BarChart2, PieChart as PieChartIcon, X
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { Candidate } from '../types';
import { cn } from '../lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { jsPDF } from 'jspdf';

// MOCK DATA FOR NEW TABS
const DONORS = [
  { id: 'D-001', name: 'Hj. Siti Hawa', type: 'Alumni', lifetime: 125000000, lastDonation: '2026-06-12', frequency: 'Monthly', tier: 'High' },
  { id: 'D-002', name: 'PT Berkah Tech', type: 'Corporate', lifetime: 500000000, lastDonation: '2026-05-10', frequency: 'Yearly', tier: 'High' },
  { id: 'D-003', name: 'Budi Santoso', type: 'Parent', lifetime: 5000000, lastDonation: '2026-06-01', frequency: 'One-time', tier: 'Low' },
  { id: 'D-004', name: 'Dr. Faisal', type: 'Community', lifetime: 45000000, lastDonation: '2026-04-22', frequency: 'Occasional', tier: 'Medium' },
  { id: 'D-005', name: 'Arman Maulana', type: 'Alumni', lifetime: 12000000, lastDonation: '2026-06-15', frequency: 'Monthly', tier: 'Medium' },
];

const CAMPAIGNS = [
  { id: "c1", title: "Pembangunan Masjid As-Salam", type: "Infrastructure", target: 500000000, current: 350000000, status: "Active", endDate: "2026-12-31" },
  { id: "c2", title: "Beasiswa Santri Yatim", type: "Education", target: 200000000, current: 150000000, status: "Active", endDate: "2026-08-15" },
  { id: "c3", title: "Wakaf Lahan Pertanian", type: "Waqf", target: 1000000000, current: 1000000000, status: "Completed", endDate: "2026-01-31" },
  { id: "c5", title: "Wakaf Sumur Bor Kompleks Asrama", type: "Waqf", target: 150000000, current: 95000000, status: "Active", endDate: "2026-09-30" },
  { id: "c6", title: "Pembebasan Lahan Kelas Baru", type: "Waqf", target: 800000000, current: 200000000, status: "Active", endDate: "2027-01-15" },
  { id: "c4", title: "Kendaraan Operasional Dakwah", type: "Asset", target: 300000000, current: 45000000, status: "Active", endDate: "2026-10-01" },
];

const WAQF_ASSETS = [
  { id: 'W-001', name: 'Tanah Sawah 2 Hektar', type: 'Land', location: 'Desa Suka Maju, Kec. Cibadak', value: 850000000, date: '2015-05-12', condition: 'Productive', wakif: 'Hj. Aminah' },
  { id: 'W-002', name: 'Gedung Asrama Putri (Hibah)', type: 'Building', location: 'Kompleks Pesantren Induk', value: 2500000000, date: '2018-09-01', condition: 'Good', wakif: 'Keluarga Bpk. Ibrahim' },
  { id: 'W-003', name: 'Mini Bus Operasional', type: 'Vehicle', location: 'Garasi Utama', value: 120000000, date: '2021-02-15', condition: 'Needs Maintenance', wakif: 'Hamba Allah' },
  { id: 'W-004', name: 'Ruko Usaha Koperasi', type: 'Commercial', location: 'Jl. Raya Lintas Provinsi Km. 5', value: 650000000, date: '2023-11-20', condition: 'Rented (Productive)', wakif: 'PT Berkah Bersama' },
];

const MONTHLY_DONATIONS = [
  { name: 'Jan', Zakat: 45, Infaq: 120, Wakaf: 200 },
  { name: 'Feb', Zakat: 50, Infaq: 150, Wakaf: 0 },
  { name: 'Mar', Zakat: 120, Infaq: 180, Wakaf: 50 },
  { name: 'Apr', Zakat: 80, Infaq: 140, Wakaf: 0 },
  { name: 'May', Zakat: 400, Infaq: 220, Wakaf: 500 }, // Ramadhan spike
  { name: 'Jun', Zakat: 60, Infaq: 250, Wakaf: 100 },
];

const FUNDING_SOURCES = [
  { name: 'Alumni Network', value: 45 },
  { name: 'Wali Santri', value: 25 },
  { name: 'Corporate CSR', value: 20 },
  { name: 'Public/Community', value: 10 },
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function DonationManager() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'campaigns' | 'waqf' | 'donors' | 'analytics'>('dashboard');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState('');

  // Modals state
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ title: '', type: 'Infrastructure', target: 0, current: 0, status: 'Active', endDate: '' });
  const [campaigns, setCampaigns] = useState(CAMPAIGNS);

  const [managingCampaign, setManagingCampaign] = useState<any>(null);
  const [isManageCampaignModalOpen, setIsManageCampaignModalOpen] = useState(false);

  const [isWaqfModalOpen, setIsWaqfModalOpen] = useState(false);
  const [newWaqf, setNewWaqf] = useState({ name: '', type: 'Land', location: '', value: 0, condition: 'Productive', wakif: '', date: '' });
  const [waqfAssets, setWaqfAssets] = useState(WAQF_ASSETS);

  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false);
  const [newDonor, setNewDonor] = useState({ name: '', type: 'Alumni', frequency: 'Monthly', tier: 'Medium', lifetime: 0, lastDonation: '' });
  const [donors, setDonors] = useState(DONORS);
  const [selectedDonor, setSelectedDonor] = useState<any>(null);

  const [isRecordDonationModalOpen, setIsRecordDonationModalOpen] = useState(false);
  const [newDonation, setNewDonation] = useState({ donorName: '', amount: 0, campaign: '', method: 'Bank Transfer' });

  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [newRecurring, setNewRecurring] = useState({ donorName: '', amount: 0, campaign: '', frequency: 'Monthly', startDate: '' });

  const handleGenerateReceipt = (donationDetails: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text('DONATION RECEIPT', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 105, 28, { align: 'center' });
    doc.text(`Receipt No: REC-${Date.now()}`, 105, 34, { align: 'center' });
    
    // Line separator
    doc.setDrawColor(200);
    doc.line(20, 45, 190, 45);
    
    // Donor Info
    doc.setFontSize(12);
    doc.setTextColor(50);
    doc.text('Received From:', 20, 60);
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text(donationDetails.donorName, 20, 70);
    
    // Amount Info
    doc.setFontSize(12);
    doc.setTextColor(50);
    doc.text('Amount Received:', 120, 60);
    doc.setFontSize(16);
    doc.setTextColor(16, 185, 129);
    doc.text(`Rp ${Number(donationDetails.amount).toLocaleString('id-ID')}`, 120, 70);
    
    // Line separator
    doc.setDrawColor(200);
    doc.line(20, 85, 190, 85);
    
    // Details
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text('Payment Method:', 20, 100);
    doc.setTextColor(20);
    doc.text(donationDetails.method, 60, 100);
    
    if (donationDetails.campaign) {
      doc.setTextColor(80);
      doc.text('Allocated To:', 20, 110);
      doc.setTextColor(20);
      doc.text(donationDetails.campaign, 60, 110);
    }
    
    // Footer
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('Thank you for your generous contribution!', 105, 150, { align: 'center' });
    doc.text('This is a computer generated receipt and requires no signature.', 105, 158, { align: 'center' });
    
    doc.save(`Receipt_${donationDetails.donorName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
  };

  useEffect(() => {
    const collRef = tenantScopedQuery(collection(db, "candidates"), user?.tenantId);
    const unsub = onSnapshot(collRef, (snap) => {
      const result: Candidate[] = [];
      snap.forEach((docSnap) => {
        result.push({ id: docSnap.id, ...(docSnap.data() as Record<string, any>) } as Candidate);
      });
      setCandidates(result);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "candidates");
    });
    return () => unsub();
  }, [user?.tenantId, user?.uid]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <HeartHandshake className="w-8 h-8 text-emerald-500" />
            Donation & Waqf Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Administer fundraising campaigns, track perpetual waqf assets, and foster donor relationships.
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto w-full md:w-auto">
          {(['dashboard', 'campaigns', 'waqf', 'donors', 'analytics'] as const).map(tab => (
            <button
              key={tab}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn("erp-tab-control", 
                "px-4 py-2 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap",
                activeTab === tab 
                  ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              {tab === 'donors' ? 'Donor Directory' : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-sm text-slate-500 font-medium">Total Active Campaigns</p>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2">12</p>
                  <p className="text-xs text-emerald-500 flex items-center gap-1 mt-2">
                     <TrendingUp className="w-3 h-3" /> +2 this month
                  </p>
               </div>
               <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-sm text-slate-500 font-medium">Monthly Collections</p>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2">Rp 410M</p>
                  <p className="text-xs text-slate-400 mt-2">Zakat, Infaq, Sadaqah</p>
               </div>
               <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-sm text-slate-500 font-medium">Waqf Assets Under Management</p>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2">24</p>
                  <p className="text-xs text-slate-400 mt-2">Est. Value: Rp 12.5B</p>
               </div>
               <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-sm text-slate-500 font-medium">Registered Donors</p>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2">1,240</p>
                  <p className="text-xs text-emerald-500 flex items-center gap-1 mt-2">
                     <TrendingUp className="w-3 h-3" /> 156 active recurring
                  </p>
               </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200">Urgent Campaigns & Priority</h3>
                      <button className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline">View All</button>
                   </div>
                   <div className="space-y-4">
                      {campaigns.slice(0,3).map(cmp => {
                         const progress = Math.min(100, Math.round((cmp.current / cmp.target) * 100));
                         return (
                            <div key={cmp.id} className="p-4 border border-slate-100 dark:border-slate-800 rounded-lg hover:border-emerald-500/30 transition-colors">
                               <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{cmp.title}</h4>
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded uppercase font-bold">{cmp.type}</span>
                               </div>
                               <div className="flex justify-between text-xs text-slate-500 mb-2">
                                  <span>Collected: Rp {(cmp.current/1000000).toFixed(0)}M</span>
                                  <span>Target: Rp {(cmp.target/1000000).toFixed(0)}M</span>
                               </div>
                               <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                 <div 
                                   className={cn("h-full rounded-full transition-all", progress >= 100 ? "bg-emerald-500" : "bg-indigo-500")}
                                   style={{ width: `${progress}%` }}
                                 ></div>
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                   <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6">Recent Giving Activity</h3>
                   <div className="space-y-4">
                      {[
                        { donor: 'Hamba Allah', amount: 5000000, type: 'Infaq Masjid', time: '2 hours ago' },
                        { donor: 'Alumni Angkatan 2020', amount: 12500000, type: 'Beasiswa Santri', time: '5 hours ago' },
                        { donor: 'PT Makmur Jaya', amount: 50000000, type: 'Wakaf Tunai Lahan', time: '1 day ago' },
                        { donor: 'Budi Santoso', amount: 500000, type: 'Zakat Maal', time: '1 day ago' },
                      ].map((log, i) => (
                         <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                  <Wallet className="w-5 h-5" />
                               </div>
                               <div>
                                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{log.donor}</p>
                                  <p className="text-xs text-slate-500">{log.type}</p>
                               </div>
                            </div>
                            <div className="text-right">
                               <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+Rp {(log.amount/1000000).toFixed(1)}M</p>
                               <p className="text-[10px] text-slate-400">{log.time}</p>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'campaigns' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-4">
               <div>
                 <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Campaign Manager</h2>
                 <p className="text-slate-500 text-sm">Deploy and track fundraising operations</p>
               </div>
               <button 
                 onClick={() => setIsCampaignModalOpen(true)}
                 className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition text-sm">
                 <Plus className="w-4 h-4" /> Create Campaign
               </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map(campaign => {
                const progress = Math.min(100, Math.round((campaign.current / campaign.target) * 100));
                return (
                  <div key={campaign.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between group">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className={cn(
                          "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md",
                          campaign.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        )}>
                          {campaign.status}
                        </span>
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3"/> {campaign.endDate}</span>
                      </div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1 text-lg group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{campaign.title}</h3>
                      <p className="text-sm text-slate-500 mb-6 flex items-center gap-2">
                        <Target className="w-4 h-4" /> {campaign.type} Category
                      </p>
                    </div>

                    <div className="mt-auto">
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">Raised</div>
                          <div className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">Rp {(campaign.current/1000000).toFixed(0)}M</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500 mb-0.5">Goal</div>
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Rp {(campaign.target/1000000).toFixed(0)}M</div>
                        </div>
                      </div>
                      
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                        <div 
                          className={cn("h-full rounded-full transition-all", campaign.status === 'Completed' ? 'bg-emerald-500' : 'bg-emerald-500')}
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span>{progress}% Funded</span>
                        <button onClick={() => { setManagingCampaign(campaign); setIsManageCampaignModalOpen(true); }} className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">Manage →</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'waqf' && (
          <div className="space-y-8 animate-in fade-in duration-300">
             
             {/* Waqf Projects Donation Tracker */}
             <div>
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Waqf Projects Funding Tracker</h2>
                  <p className="text-slate-500 text-sm">Visual progress of ongoing Waqf campaigns</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {campaigns.filter(c => c.type === 'Waqf').map(waqfProject => {
                    const progress = Math.min(100, Math.round((waqfProject.current / waqfProject.target) * 100));
                    return (
                      <div key={waqfProject.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-between">
                         <div>
                            <div className="flex justify-between items-start mb-2">
                               <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">{waqfProject.title}</h3>
                               <span className={cn(
                                 "px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md",
                                 waqfProject.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                               )}>
                                 {waqfProject.status}
                               </span>
                            </div>
                            <div className="text-sm text-slate-500 mb-6 flex items-center gap-1">
                               <Calendar className="w-4 h-4"/> Target Completion: {waqfProject.endDate}
                            </div>
                         </div>
                         
                         <div>
                           <div className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              <span>Rp {(waqfProject.current / 1000000).toLocaleString('id-ID')}M Raised</span>
                              <span>Target: Rp {(waqfProject.target / 1000000).toLocaleString('id-ID')}M</span>
                           </div>
                           <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                             <div 
                               className={cn("h-full rounded-full transition-all duration-1000 ease-out", progress >= 100 ? "bg-emerald-500" : "bg-emerald-500")}
                               style={{ width: `${progress}%` }}
                             ></div>
                           </div>
                           <div className="flex justify-between text-xs text-slate-500 font-medium mb-4">
                              <span>{progress}% Funded</span>
                              <span>Rp {((waqfProject.target - waqfProject.current) / 1000000).toLocaleString('id-ID')}M to go</span>
                           </div>
                           <button 
                             onClick={() => {
                               setNewRecurring({...newRecurring, campaign: waqfProject.title});
                               setIsRecurringModalOpen(true);
                             }}
                             className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition text-sm flex items-center justify-center gap-2">
                             <Calendar className="w-4 h-4" /> Setup Recurring Donation
                           </button>
                         </div>
                      </div>
                    );
                  })}
                </div>
             </div>

             <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
               <div className="flex justify-between items-center mb-4">
                   <div>
                     <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Waqf Assets Inventory</h2>
                     <p className="text-slate-500 text-sm">Register and monitor condition of perpetual endowed assets</p>
                   </div>
                   <button 
                     onClick={() => setIsWaqfModalOpen(true)}
                     className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition text-sm">
                     <Landmark className="w-4 h-4" /> Register Asset
                   </button>
               </div>

             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Asset Name & ID</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Classification</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Valuation / Wakif</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Condition & Status</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                     {waqfAssets.map(asset => (
                       <tr key={asset.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                          <td className="px-6 py-4">
                             <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                               {asset.name}
                             </div>
                             <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3"/> {asset.location}</div>
                          </td>
                          <td className="px-6 py-4">
                             <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-xs font-semibold">{asset.type}</span>
                          </td>
                          <td className="px-6 py-4">
                             <div className="font-medium text-emerald-600 dark:text-emerald-400">Rp {(asset.value / 1000000).toFixed(0)}M</div>
                             <div className="text-xs text-slate-500 mt-0.5">Wakif: {asset.wakif}</div>
                          </td>
                          <td className="px-6 py-4">
                             <span className={cn(
                               "px-2 py-1 text-xs font-medium rounded-md flex items-center w-max gap-1",
                               asset.condition.includes('Productive') || asset.condition === 'Good' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                               "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                             )}>
                                <Activity className="w-3 h-3" /> {asset.condition}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <button className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg transition font-medium text-xs border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800">
                                Documents
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

        {activeTab === 'donors' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-4">
               <div>
                 <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Donor Directory</h2>
                 <p className="text-slate-500 text-sm">Track historical donor contributions and profiles</p>
               </div>
            </div>
            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
               <div className="relative w-full md:w-96">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search by donor name..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 dark:text-slate-200"
                  />
               </div>
               <div className="flex items-center gap-3">
                 <button 
                    onClick={() => setIsRecordDonationModalOpen(true)}
                    className="px-4 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30 rounded-lg font-medium transition text-sm flex items-center gap-2 shadow-sm">
                    <HandCoins className="w-4 h-4" /> Record Donation
                 </button>
                 <button 
                    onClick={() => setIsDonorModalOpen(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition text-sm flex items-center gap-2 shadow-sm">
                    <Plus className="w-4 h-4" /> Sync / Add Donor
                 </button>
               </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Donor Name / Affiliation</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Tier Profile</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Frequency</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Last Giving</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Lifetime Value (LTV)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                     {donors.map(donor => (
                       <tr key={donor.id} onClick={() => setSelectedDonor(donor)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                          <td className="px-6 py-4">
                             <div className="font-bold text-slate-800 dark:text-slate-200">{donor.name}</div>
                             <div className="text-xs text-slate-500 mt-0.5">{donor.type}</div>
                          </td>
                          <td className="px-6 py-4">
                             <span className={cn(
                               "px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full",
                               donor.tier === 'High' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                               donor.tier === 'Medium' ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" :
                               "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                             )}>
                               {donor.tier} Priority
                             </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                             {donor.frequency}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                             {donor.lastDonation}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="font-bold text-emerald-600 dark:text-emerald-400">
                               Rp {(donor.lifetime / 1000000).toLocaleString('id-ID')}M
                             </div>
                          </td>
                       </tr>
                     ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-300">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                   <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-emerald-500" /> Giving Velocity (YTD in Millions)
                   </h3>
                   <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={MONTHLY_DONATIONS} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                           <Tooltip contentStyle={{ backgroundColor: 'rgb(30, 41, 59)', border: 'none', borderRadius: '8px', color: '#fff' }} />
                           <Legend verticalAlign="top" height={36} iconType="circle" />
                           <Line type="monotone" dataKey="Zakat" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                           <Line type="monotone" dataKey="Infaq" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                           <Line type="monotone" dataKey="Wakaf" stroke="#10b981" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                         </LineChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                   <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5 text-emerald-500" /> Constituent Origin
                   </h3>
                   <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie data={FUNDING_SOURCES} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                             {FUNDING_SOURCES.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                           </Pie>
                           <Tooltip contentStyle={{ backgroundColor: 'rgb(30, 41, 59)', border: 'none', borderRadius: '8px', color: '#fff' }} />
                           <Legend verticalAlign="bottom" height={36} />
                         </PieChart>
                      </ResponsiveContainer>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {isManageCampaignModalOpen && managingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Manage Campaign: {managingCampaign.title}</h3>
              <button onClick={() => setIsManageCampaignModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select value={managingCampaign.status} onChange={e => setManagingCampaign({...managingCampaign, status: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Paused">Paused</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Amount Raised (Rp)</label>
                <input type="number" value={managingCampaign.current} onChange={e => setManagingCampaign({...managingCampaign, current: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Amount (Rp)</label>
                <input type="number" value={managingCampaign.target} onChange={e => setManagingCampaign({...managingCampaign, target: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setIsManageCampaignModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => {
                setCampaigns(campaigns.map(c => c.id === managingCampaign.id ? managingCampaign : c));
                setIsManageCampaignModalOpen(false);
              }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Campaign</h3>
              <button onClick={() => setIsCampaignModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                <input type="text" value={newCampaign.title} onChange={e => setNewCampaign({...newCampaign, title: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Amount (Rp)</label>
                <input type="number" value={newCampaign.target || ''} onChange={e => setNewCampaign({...newCampaign, target: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                <select value={newCampaign.type} onChange={e => setNewCampaign({...newCampaign, type: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="Infrastructure">Infrastructure</option>
                  <option value="Education">Education</option>
                  <option value="Waqf">Waqf</option>
                  <option value="Asset">Asset</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
                <input type="date" value={newCampaign.endDate} onChange={e => setNewCampaign({...newCampaign, endDate: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setIsCampaignModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => {
                if (newCampaign.title && newCampaign.target > 0) {
                  setCampaigns([...campaigns, { ...newCampaign, id: `c-${Date.now()}` }]);
                  setIsCampaignModalOpen(false);
                  setNewCampaign({ title: '', type: 'Infrastructure', target: 0, current: 0, status: 'Active', endDate: '' });
                }
              }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">Create</button>
            </div>
          </div>
        </div>
      )}

      {isWaqfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Register Waqf Asset</h3>
              <button onClick={() => setIsWaqfModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Asset Name</label>
                <input type="text" value={newWaqf.name} onChange={e => setNewWaqf({...newWaqf, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                <select value={newWaqf.type} onChange={e => setNewWaqf({...newWaqf, type: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="Land">Land</option>
                  <option value="Building">Building</option>
                  <option value="Vehicle">Vehicle</option>
                  <option value="Commercial">Commercial</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wakif (Donor)</label>
                <input type="text" value={newWaqf.wakif} onChange={e => setNewWaqf({...newWaqf, wakif: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Estimated Value (Rp)</label>
                <input type="number" value={newWaqf.value || ''} onChange={e => setNewWaqf({...newWaqf, value: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setIsWaqfModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => {
                if (newWaqf.name) {
                  setWaqfAssets([...waqfAssets, { ...newWaqf, id: `W-${Date.now()}` }]);
                  setIsWaqfModalOpen(false);
                  setNewWaqf({ name: '', type: 'Land', location: '', value: 0, condition: 'Productive', wakif: '', date: '' });
                }
              }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">Register</button>
            </div>
          </div>
        </div>
      )}

      {isDonorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Donor</h3>
              <button onClick={() => setIsDonorModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Donor Name</label>
                <input type="text" value={newDonor.name} onChange={e => setNewDonor({...newDonor, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                <select value={newDonor.type} onChange={e => setNewDonor({...newDonor, type: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="Alumni">Alumni</option>
                  <option value="Corporate">Corporate</option>
                  <option value="Parent">Parent</option>
                  <option value="Community">Community</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tier</label>
                <select value={newDonor.tier} onChange={e => setNewDonor({...newDonor, tier: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setIsDonorModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => {
                if (newDonor.name) {
                  setDonors([...donors, { ...newDonor, id: `D-${Date.now()}` }]);
                  setIsDonorModalOpen(false);
                  setNewDonor({ name: '', type: 'Alumni', frequency: 'Monthly', tier: 'Medium', lifetime: 0, lastDonation: '' });
                }
              }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">Add Donor</button>
            </div>
          </div>
        </div>
      )}

      {isRecordDonationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Record New Donation</h3>
              <button onClick={() => setIsRecordDonationModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Donor Name</label>
                <input type="text" value={newDonation.donorName} onChange={e => setNewDonation({...newDonation, donorName: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (Rp)</label>
                <input type="number" value={newDonation.amount || ''} onChange={e => setNewDonation({...newDonation, amount: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Allocated Campaign / Project</label>
                <select value={newDonation.campaign} onChange={e => setNewDonation({...newDonation, campaign: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">-- General Fund --</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.title}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payment Method</label>
                <select value={newDonation.method} onChange={e => setNewDonation({...newDonation, method: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="QRIS">QRIS</option>
                  <option value="E-Wallet">E-Wallet</option>
                </select>
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setIsRecordDonationModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => {
                if (newDonation.donorName && newDonation.amount > 0) {
                  // Simulate recording logic
                  if (newDonation.campaign) {
                    setCampaigns(campaigns.map(c => 
                      c.title === newDonation.campaign 
                        ? { ...c, current: c.current + newDonation.amount }
                        : c
                    ));
                  }
                  
                  handleGenerateReceipt(newDonation);
                  setIsRecordDonationModalOpen(false);
                  setNewDonation({ donorName: '', amount: 0, campaign: '', method: 'Bank Transfer' });
                }
              }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                <FileText className="w-4 h-4" /> Record & Generate Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Donor Profile</h3>
              <button onClick={() => setSelectedDonor(null)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xl">
                  {selectedDonor.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-800 dark:text-slate-200">{selectedDonor.name}</h4>
                  <p className="text-sm text-slate-500">{selectedDonor.type} Donor &bull; {selectedDonor.frequency}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                 <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <p className="text-xs text-slate-500 font-medium mb-1">Lifetime Value</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Rp {(selectedDonor.lifetime / 1000000).toLocaleString('id-ID')}M</p>
                 </div>
                 <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <p className="text-xs text-slate-500 font-medium mb-1">Last Donation</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{selectedDonor.lastDonation}</p>
                 </div>
              </div>
              
              <div>
                 <h5 className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-sm">Recent Contributions</h5>
                 <div className="space-y-3">
                   {/* Mock recent contributions */}
                   <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                     <div>
                       <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Zakat Maal</p>
                       <p className="text-xs text-slate-500">{selectedDonor.lastDonation}</p>
                     </div>
                     <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Rp 5.000.000</span>
                   </div>
                   <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                     <div>
                       <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Wakaf Pembangunan</p>
                       <p className="text-xs text-slate-500">2025-11-10</p>
                     </div>
                     <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Rp 10.000.000</span>
                   </div>
                 </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setSelectedDonor(null)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {isRecurringModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Setup Recurring Donation</h3>
              <button onClick={() => setIsRecurringModalOpen(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Donor Name</label>
                <input type="text" value={newRecurring.donorName} onChange={e => setNewRecurring({...newRecurring, donorName: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (Rp)</label>
                <input type="number" value={newRecurring.amount || ''} onChange={e => setNewRecurring({...newRecurring, amount: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Waqf Project</label>
                <input type="text" disabled value={newRecurring.campaign} className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none text-slate-500 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Frequency</label>
                <select value={newRecurring.frequency} onChange={e => setNewRecurring({...newRecurring, frequency: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Annually">Annually</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                <input type="date" value={newRecurring.startDate} onChange={e => setNewRecurring({...newRecurring, startDate: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button onClick={() => setIsRecurringModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => {
                if (newRecurring.donorName && newRecurring.amount > 0) {
                  // Simulate creating recurring schedule
                  setIsRecurringModalOpen(false);
                  setNewRecurring({ donorName: '', amount: 0, campaign: '', frequency: 'Monthly', startDate: '' });
                }
              }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

