import React, { useState, useMemo } from 'react';
import { 
  HeartHandshake, Users, LayoutDashboard, Send, Filter,
  Megaphone, Plus, Search, MapPin, Briefcase, Calendar, ChevronRight, 
  MessageSquare, MoreVertical, UserPlus, Target, TrendingUp, Mail, Phone,
  BarChart2, PieChart as PieChartIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

const CONTACTS = [
  { id: 'C-001', name: 'Budi Santoso', type: 'Parent', status: 'Active', email: 'budi.s@example.com', phone: '+6281234567890', lastInteraction: '2026-06-10', ltv: 15000000 },
  { id: 'C-002', name: 'Almira Yasmin', type: 'Prospect', status: 'Lead', email: 'almira.y@example.com', phone: '+6281112223334', lastInteraction: '2026-06-14', ltv: 0 },
  { id: 'C-003', name: 'PT Berkah Nusantara', type: 'Donor', status: 'Engaged', email: 'csr@berkahnusa.com', phone: '+622155566677', lastInteraction: '2026-06-01', ltv: 50000000 },
  { id: 'C-004', name: 'Zainuddin', type: 'Alumni', status: 'Active', email: 'zainuddin.al@example.com', phone: '+6285544332211', lastInteraction: '2026-05-20', ltv: 5000000 },
  { id: 'C-005', name: 'Siti Aminah', type: 'Prospect', status: 'Qualified', email: 'siti.a@example.com', phone: '+6287766554433', lastInteraction: '2026-06-12', ltv: 0 },
  { id: 'C-006', name: 'H. Ahmad', type: 'Donor', status: 'Active', email: 'ahmad.h@example.com', phone: '+6281999888777', lastInteraction: '2026-06-05', ltv: 150000000 },
  { id: 'C-007', name: 'Ratna M.', type: 'Parent', status: 'Active', email: 'ratnat@example.com', phone: '+6282233445566', lastInteraction: '2026-06-15', ltv: 12000000 },
  { id: 'C-008', name: 'Dr. Faisal', type: 'Alumni', status: 'Engaged', email: 'faisal.md@example.com', phone: '+6281333333333', lastInteraction: '2026-06-08', ltv: 25000000 },
];

const CAMPAIGNS = [
  { id: 'CMP-01', name: 'PPDB Early Bird Promo 2027', audience: 'Prospects', channel: 'Email', status: 'Sent', sent: 1250, openRate: '45%' },
  { id: 'CMP-02', name: 'Panggilan Donasi Masjid Asrama', audience: 'Parents & Alumni', channel: 'WhatsApp', status: 'Scheduled', sent: 0, openRate: '-' },
  { id: 'CMP-03', name: 'Newsletter Bulanan Vol 12', audience: 'All Subscribed', channel: 'Email', status: 'Draft', sent: 0, openRate: '-' },
  { id: 'CMP-04', name: 'Undangan Reuni Akbar', audience: 'Alumni 2010-2020', channel: 'SMS', status: 'Sent', sent: 800, openRate: '92%' },
];

const STAGES = ['Lead', 'Qualified', 'Engaged', 'Active', 'Lost'];
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const typeData = [
  { name: 'Parent', value: 450 },
  { name: 'Alumni', value: 650 },
  { name: 'Prospect', value: 120 },
  { name: 'Donor', value: 85 },
];

const monthlyInteractions = [
  { name: 'Jan', count: 120 },
  { name: 'Feb', count: 150 },
  { name: 'Mar', count: 180 },
  { name: 'Apr', count: 140 },
  { name: 'May', count: 210 },
  { name: 'Jun', count: 250 },
];

export function CRMManager() {
  const [activeTab, setActiveTab] = useState<'directory' | 'pipeline' | 'broadcast' | 'analytics'>('directory');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [contacts, setContacts] = useState(CONTACTS);
  const [campaigns, setCampaigns] = useState(CAMPAIGNS);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);

  const [leadForm, setLeadForm] = useState({
    name: '',
    type: 'Prospect',
    status: 'Lead',
    email: '',
    phone: '',
    ltv: 0
  });

  const [campaignForm, setCampaignForm] = useState({
    name: '',
    audience: 'Prospects',
    channel: 'WhatsApp',
    content: ''
  });

  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.name.trim()) return;

    const newContact = {
      id: `C-${String(contacts.length + 1).padStart(3, '0')}`,
      name: leadForm.name.trim(),
      type: leadForm.type,
      status: leadForm.status,
      email: leadForm.email.trim() || 'contact@example.com',
      phone: leadForm.phone.trim() || '+62800000000',
      lastInteraction: new Date().toISOString().split('T')[0],
      ltv: Number(leadForm.ltv) || 0
    };

    setContacts([newContact, ...contacts]);
    setLeadForm({ name: '', type: 'Prospect', status: 'Lead', email: '', phone: '', ltv: 0 });
    setIsAddLeadOpen(false);
  };

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.name.trim()) return;

    const newCmp = {
      id: `CMP-${String(campaigns.length + 1).padStart(2, '0')}`,
      name: campaignForm.name.trim(),
      audience: campaignForm.audience,
      channel: campaignForm.channel,
      status: 'Scheduled',
      sent: 0,
      openRate: '-'
    };

    setCampaigns([newCmp, ...campaigns]);
    setCampaignForm({ name: '', audience: 'Prospects', channel: 'WhatsApp', content: '' });
    setIsNewCampaignOpen(false);
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === 'All' ? true : c.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [contacts, search, typeFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <HeartHandshake className="w-8 h-8 text-rose-500" />
            CRM & Donor Relations
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Manage lifecycle relationships with parents, prospects, alumni, and philanthropic donors.
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['directory', 'pipeline', 'broadcast', 'analytics'] as const).map(tab => (
            <button
              key={tab}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn("erp-tab-control", 
                "px-4 py-2 rounded-md text-sm font-medium transition-all capitalize",
                activeTab === tab 
                  ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'directory' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="relative w-full md:w-96">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search contacts by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/50 dark:text-slate-200"
                />
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:flex-none">
                  <select 
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="w-full md:w-40 pl-4 pr-10 py-2 appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/50 dark:text-slate-200"
                  >
                    <option value="All">All Types</option>
                    <option value="Parent">Parent</option>
                    <option value="Prospect">Prospect</option>
                    <option value="Alumni">Alumni</option>
                    <option value="Donor">Donor</option>
                  </select>
                  <Filter className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button 
                  onClick={() => { setLeadForm({ ...leadForm, status: 'Lead' }); setIsAddLeadOpen(true); }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors whitespace-nowrap shadow-sm text-sm font-medium"
                >
                  <UserPlus className="w-4 h-4" /> Add Lead
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Name & Contact</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Entity Type</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Lifecycle State</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Last Touch</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">LTV Value</th>
                      <th className="px-6 py-4 text-center text-slate-400"><MoreVertical className="w-4 h-4 mx-auto" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredContacts.map(contact => (
                      <tr key={contact.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 outline-none cursor-pointer group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{contact.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{contact.email}</div>
                          <div className="text-xs text-slate-500">{contact.phone}</div>
                        </td>
                        <td className="px-6 py-4">
                           <span className={cn(
                             "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center w-max gap-1",
                             contact.type === 'Prospect' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" :
                             contact.type === 'Parent' ? "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" :
                             contact.type === 'Donor' ? "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" :
                             "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                           )}>
                              {contact.type}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                             "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border",
                             contact.status === 'Active' ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400" :
                             contact.status === 'Lead' ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-900/20 dark:text-indigo-400" :
                             contact.status === 'Engaged' ? "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-900/20 dark:text-cyan-400" :
                             "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          )}>
                             {contact.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-sm">
                           {contact.lastInteraction}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-slate-800 dark:text-slate-200">
                           {contact.ltv > 0 ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(contact.ltv) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                           <button className="text-slate-400 hover:text-rose-500 transition"><MessageSquare className="w-4 h-4 inline-block" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pipeline' && (
          <div className="animate-in fade-in duration-300">
            <div className="overflow-x-auto pb-4">
               <div className="flex gap-4 min-w-[1000px]">
                 {STAGES.map(stage => {
                    const stageContacts = CONTACTS.filter(c => c.status === stage);
                    return (
                       <div key={stage} className="flex-1 min-w-[250px] bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                          <div className="flex justify-between items-center mb-4">
                             <h3 className="font-bold text-slate-700 dark:text-slate-300">{stage}</h3>
                             <span className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-bold text-slate-500">{stageContacts.length}</span>
                          </div>
                          <div className="space-y-3">
                             {stageContacts.map(contact => (
                                <div key={contact.id} className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-rose-500/50 transition-colors pointer-events-auto">
                                   <div className="flex justify-between items-start mb-2">
                                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm line-clamp-1">{contact.name}</h4>
                                      <span className={cn(
                                          "w-2 h-2 rounded-full",
                                          contact.type === 'Prospect' ? "bg-amber-400" :
                                          contact.type === 'Parent' ? "bg-blue-400" :
                                          contact.type === 'Donor' ? "bg-rose-400" :
                                          "bg-emerald-400"
                                      )}></span>
                                   </div>
                                   <p className="text-xs text-slate-500 mb-3">{contact.type}</p>
                                   {contact.ltv > 0 && (
                                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between">
                                         <span>Est. Value</span>
                                         <span>{(contact.ltv / 1000000).toFixed(1)}M</span>
                                      </p>
                                   )}
                                </div>
                             ))}
                             <button 
                                onClick={() => { setLeadForm({ ...leadForm, status: stage }); setIsAddLeadOpen(true); }}
                                className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 transition flex items-center justify-center gap-1 text-sm font-medium"
                             >
                                <Plus className="w-4 h-4" /> Add
                             </button>
                          </div>
                       </div>
                    )
                 })}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'broadcast' && (
          <div className="space-y-6 animate-in fade-in duration-300">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Unified Broadcast Engine</h2>
                <button 
                  onClick={() => setIsNewCampaignOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition text-sm"
                >
                   <Megaphone className="w-4 h-4" /> New Campaign
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                  <Mail className="w-6 h-6 text-rose-500 mb-2" />
                  <p className="text-sm text-slate-500">Emails Sent (MTD)</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">45,210</p>
               </div>
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                  <Phone className="w-6 h-6 text-emerald-500 mb-2" />
                  <p className="text-sm text-slate-500">WhatsApp Sent (MTD)</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">12,500</p>
               </div>
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                  <Target className="w-6 h-6 text-indigo-500 mb-2" />
                  <p className="text-sm text-slate-500">Avg. Open Rate</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">68.4%</p>
               </div>
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                  <TrendingUp className="w-6 h-6 text-amber-500 mb-2" />
                  <p className="text-sm text-slate-500">Conversion Rate</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">4.2%</p>
               </div>
             </div>

             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                 <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Campaign Name</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Audience</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Channel</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Sent / Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                     {campaigns.map(cmp => (
                        <tr key={cmp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                           <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{cmp.name}</td>
                           <td className="px-6 py-4 text-slate-500">{cmp.audience}</td>
                           <td className="px-6 py-4 text-slate-500">
                              <span className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 w-max text-xs font-medium">
                                 {cmp.channel === 'WhatsApp' ? <Phone className="w-3 h-3 text-emerald-500"/> : 
                                  cmp.channel === 'Email' ? <Mail className="w-3 h-3 text-blue-500" /> :
                                  <MessageSquare className="w-3 h-3 text-rose-500"/>
                                 }
                                 {cmp.channel}
                              </span>
                           </td>
                           <td className="px-6 py-4">
                              <span className={cn(
                                 "px-2 py-1 text-xs font-medium rounded-md",
                                 cmp.status === 'Sent' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                 cmp.status === 'Scheduled' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                 "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                              )}>
                                 {cmp.status}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <div className="font-bold text-slate-800 dark:text-slate-200">{cmp.sent.toLocaleString()}</div>
                              <div className="text-xs text-slate-500">{cmp.openRate} open</div>
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
                      <PieChartIcon className="w-5 h-5 text-rose-500" /> Contacts Demographics
                   </h3>
                   <div className="h-64">
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie data={typeData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                             {typeData.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                           </Pie>
                           <Tooltip contentStyle={{ backgroundColor: 'rgb(30, 41, 59)', border: 'none', borderRadius: '8px', color: '#fff' }} />
                         </PieChart>
                       </ResponsiveContainer>
                   </div>
                   <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
                      {typeData.map((d, i) => (
                         <div key={d.name} className="flex items-center gap-2 text-sm">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                            <span className="text-slate-600 dark:text-slate-400">{d.name} <span className="font-bold text-slate-800 dark:text-slate-200">({d.value})</span></span>
                         </div>
                      ))}
                   </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                   <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-rose-500" /> Monthly Interactions (Acquisition)
                   </h3>
                   <div className="h-64">
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={monthlyInteractions} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                           <Tooltip
                             cursor={{ fill: 'rgba(244, 63, 94, 0.1)' }}
                             contentStyle={{ backgroundColor: 'rgb(30, 41, 59)', border: 'none', borderRadius: '8px', color: '#fff' }}
                           />
                           <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={30} />
                         </BarChart>
                       </ResponsiveContainer>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsAddLeadOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-rose-500" /> Tambah Lead / Kontak CRM
              </h3>
              <button onClick={() => setIsAddLeadOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddLead} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Kontak <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  required 
                  placeholder="Contoh: Bpk. Bambang Sutrisno"
                  value={leadForm.name}
                  onChange={e => setLeadForm({ ...leadForm, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tipe Entitas</label>
                  <select 
                    value={leadForm.type}
                    onChange={e => setLeadForm({ ...leadForm, type: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    <option value="Prospect">Prospect</option>
                    <option value="Parent">Parent</option>
                    <option value="Alumni">Alumni</option>
                    <option value="Donor">Donor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tahap Pipeline</label>
                  <select 
                    value={leadForm.status}
                    onChange={e => setLeadForm({ ...leadForm, status: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    <option value="Lead">Lead</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Engaged">Engaged</option>
                    <option value="Active">Active</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Email</label>
                <input 
                  type="email" 
                  placeholder="bambang@example.com"
                  value={leadForm.email}
                  onChange={e => setLeadForm({ ...leadForm, email: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nomor Telepon/WA</label>
                  <input 
                    type="text" 
                    placeholder="+628123456789"
                    value={leadForm.phone}
                    onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Potensi Nilai (LTV Rp)</label>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={leadForm.ltv || ''}
                    onChange={e => setLeadForm({ ...leadForm, ltv: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddLeadOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
                <button type="submit" className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm rounded-xl">Simpan Kontak</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Campaign Modal */}
      {isNewCampaignOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsNewCampaignOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-rose-500" /> Buat Siaran Kampanye Baru
              </h3>
              <button onClick={() => setIsNewCampaignOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleCreateCampaign} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Kampanye <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  required 
                  placeholder="Contoh: Undangan Silaturahmi Wali Santri"
                  value={campaignForm.name}
                  onChange={e => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kanal Siaran</label>
                  <select 
                    value={campaignForm.channel}
                    onChange={e => setCampaignForm({ ...campaignForm, channel: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Email">Email</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Target Audiens</label>
                  <select 
                    value={campaignForm.audience}
                    onChange={e => setCampaignForm({ ...campaignForm, audience: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    <option value="Prospects">Prospects (Calon Santri)</option>
                    <option value="Parents & Alumni">Parents & Alumni</option>
                    <option value="All Subscribed">All Subscribed</option>
                    <option value="Donors">Donors & Filantropi</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Isi Pesan Siaran</label>
                <textarea 
                  rows={4} 
                  required
                  placeholder="Tulis pesan pengumuman atau promosi di sini..."
                  value={campaignForm.content}
                  onChange={e => setCampaignForm({ ...campaignForm, content: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsNewCampaignOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
                <button type="submit" className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm rounded-xl">Jadwalkan Siaran</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

