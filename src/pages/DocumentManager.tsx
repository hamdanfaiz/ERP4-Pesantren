import React, { useState } from "react";
import {
  FileBox,
  FileSignature,
  Files,
  Search,
  Plus,
  Mail,
  Download,
  FileText,
  ScanFace,
  Upload,
  Loader2,
  CheckCircle,
  Clock,
  Eye,
  Send,
  Filter,
  CheckSquare,
  XCircle,
  QrCode
} from "lucide-react";
import { cn } from "../lib/utils";
import { getAllMasterDataRecords } from "../data/mockRecords";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// --- MOCK DATA ---
const MOCK_INCOMING = [
  { id: "SM-26/001", sender: "Kemenag Kab. Malang", date: "2026-06-10", subject: "Undangan Sosialisasi Kurikulum", category: "Pendidikan", status: "Needs Disposition" },
  { id: "SM-26/002", sender: "Dinas Kesehatan", date: "2026-06-12", subject: "Penyuluhan Kesehatan Santri", category: "Kesehatan", status: "Disposed" },
  { id: "SM-26/003", sender: "Universitas Brawijaya", date: "2026-06-14", subject: "Penawaran Beasiswa Jalur Tahfidz", category: "Akademik", status: "Needs Disposition" },
];

const MOCK_OUTGOING = [
  { id: "SK-26/015", recipient: "Wali Santri Kelas 12", date: "2026-06-14", subject: "Pemberitahuan Ujian Akhir", category: "Akademik", status: "Draft" },
  { id: "SK-26/016", recipient: "Pimpinan Daerah Muhammadiyah", date: "2026-06-15", subject: "Laporan Perkembangan Pesantren Q2", category: "Laporan", status: "Waiting Approval" },
  { id: "SK-26/017", recipient: "Dinas Pendidikan", date: "2026-06-01", subject: "Permohonan Akreditasi Ulang", category: "Legal", status: "Sent" },
];

const MOCK_APPROVALS = [
  { id: "APP-001", docRef: "SK-26/016", requestor: "Admin TU", type: "Surat Keluar", date: "2026-06-15", status: "Pending" },
  { id: "APP-002", docRef: "PR-26/040", requestor: "Dept. Keuangan", type: "Purchase Request", date: "2026-06-14", status: "Pending" },
];

const MOCK_ARCHIVES = [
  { id: "ARC-001", title: "SK Pengangkatan Staf 2026", category: "HRD", date: "2026-01-10", size: "2.4 MB" },
  { id: "ARC-002", title: "MOU Rumah Sakit Medika", category: "Legal", date: "2026-02-15", size: "1.1 MB" },
  { id: "ARC-003", title: "Laporan Keuangan Tahun 2025", category: "Keuangan", date: "2026-01-05", size: "4.5 MB" },
];

export function DocumentManager() {
  const [activeTab, setActiveTab] = useState("incoming");

  const handleExportCSV = () => {
    const data = getAllMasterDataRecords();
    if (data.length === 0) return;

    // Get all unique keys for headers
    const allKeys = new Set<string>();
    data.forEach((item) => {
      Object.keys(item).forEach((key) => allKeys.add(key));
    });
    const headersArray = Array.from(allKeys);

    const csvContent = [
      headersArray.join(","),
      ...data.map((item) =>
        headersArray.map((key) => `"${(item as any)[key] || ""}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "master_data_export.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const data = getAllMasterDataRecords();
    if (data.length === 0) return;

    const doc = new jsPDF("landscape");

    const headers = [
      ["ID", "Name", "Gender", "Phone", "Email", "Role / Grade"],
    ];

    const rows = data.map((item: any) => [
      item.id || "-",
      item.name || "-",
      item.gender || "-",
      item.phone || item.parentPhone || "-",
      item.email || "-",
      item.grade || item.studentGrade || item.occupation || "-",
    ]);

    doc.text("Master Data Report", 14, 15);

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 20,
    });

    doc.save("master_data_export.pdf");
  };

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-blue-500 pb-1 inline-block">
            Document & Letter Management
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Manage incoming/outgoing mails, digital signatures, and e-documents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors "
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-600/30 border border-blue-500/20 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/5 bg-black/40 overflow-x-auto">
          <div className="flex p-2 gap-2 min-w-max">
            {[
              {
                id: "incoming",
                label: "Surat Masuk",
                icon: <Mail className="w-4 h-4" />,
              },
              {
                id: "outgoing",
                label: "Surat Keluar",
                icon: <Files className="w-4 h-4" />,
              },
              {
                id: "approval",
                label: "E-Approval",
                icon: <FileSignature className="w-4 h-4" />,
              },
              {
                id: "archive",
                label: "Arsip Digital",
                icon: <FileBox className="w-4 h-4" />,
              },
              {
                id: "ocr",
                label: "AI OCR Scanner",
                icon: <ScanFace className="w-4 h-4" />,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn("erp-tab-control", 
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative",
                  activeTab === tab.id
                    ? "bg-blue-500/10 text-blue-400"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5",
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/20 border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search letter ID..."
                className="pl-9 pr-4 py-2  rounded-lg text-sm focus:outline-none focus:border-blue-500 w-full sm:w-80 bg-slate-50 dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'ocr' ? <OcrScannerView /> : null}
          {activeTab === 'incoming' ? <IncomingLettersView /> : null}
          {activeTab === 'outgoing' ? <OutgoingLettersView /> : null}
          {activeTab === 'approval' ? <ApprovalView /> : null}
          {activeTab === 'archive' ? <ArchiveView /> : null}
        </div>
      </div>
    </div>
  );
}

function IncomingLettersView() {
  const [search, setSearch] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [incoming, setIncoming] = useState(MOCK_INCOMING);
  const [formData, setFormData] = useState({ sender: '', subject: '', category: '' });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const newDoc = {
      id: `SM-26/00${incoming.length + 1}`,
      sender: formData.sender,
      date: new Date().toISOString().split('T')[0],
      subject: formData.subject,
      category: formData.category,
      status: "Needs Disposition"
    };
    setIncoming([newDoc, ...incoming]);
    setIsRegistering(false);
    setFormData({ sender: '', subject: '', category: '' });
  };

  const filteredIncoming = incoming.filter(item => item.subject.toLowerCase().includes(search.toLowerCase()) || item.sender.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {isRegistering && (
         <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                     <Mail className="w-5 h-5 text-blue-500" /> Register Incoming Letter
                  </h3>
                  <button onClick={() => setIsRegistering(false)} className="text-slate-400 hover:text-slate-600 transition tracking-wider">
                     <Plus className="w-6 h-6 rotate-45" />
                  </button>
               </div>
               <form onSubmit={handleRegister} className="p-6 space-y-4">
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Sender / Institution</label>
                     <input 
                       required 
                       type="text" 
                       value={formData.sender}
                       onChange={e => setFormData({...formData, sender: e.target.value})}
                       className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-slate-200" 
                       placeholder="e.g. Kementerian Agama" 
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Subject</label>
                     <input 
                       required 
                       type="text" 
                       value={formData.subject}
                       onChange={e => setFormData({...formData, subject: e.target.value})}
                       className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-slate-200" 
                       placeholder="e.g. Undangan Rapat Evaluasi" 
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
                     <select 
                       required 
                       value={formData.category}
                       onChange={e => setFormData({...formData, category: e.target.value})}
                       className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-slate-200"
                     >
                       <option value="">Select Category</option>
                       <option value="Pendidikan">Pendidikan</option>
                       <option value="Kesehatan">Kesehatan</option>
                       <option value="Legal">Legal</option>
                       <option value="Keuangan">Keuangan</option>
                     </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Scan / Upload Document</label>
                     <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4 text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer">
                        <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">Click to upload scanned PDF or Image</p>
                     </div>
                  </div>
                  <div className="pt-4 flex justify-end gap-3">
                     <button type="button" onClick={() => setIsRegistering(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">Cancel</button>
                     <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-sm">Save & Register</button>
                  </div>
               </form>
            </div>
         </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Surat Masuk (Incoming)</h2>
        <div className="flex items-center gap-2">
           <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                 type="text"
                 placeholder="Search sender or subject..."
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 className="pl-9 pr-4 py-2 rounded-lg text-sm border border-slate-200 dark:border-white/10 focus:outline-none focus:border-blue-500 w-full sm:w-64 bg-white dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300"
              />
           </div>
           <button onClick={() => setIsRegistering(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm whitespace-nowrap">
             <Plus className="w-4 h-4" /> Register Incoming
           </button>
        </div>
      </div>
      <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">ID / Date</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Sender</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Subject</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Category</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredIncoming.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{item.id}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> {item.date}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{item.sender}</td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{item.subject}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{item.category}</td>
                  <td className="px-6 py-4">
                     <span className={cn(
                       "px-2.5 py-1 rounded-full text-xs font-bold",
                       item.status === 'Needs Disposition' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                       "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                     )}>
                       {item.status}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      {item.status === 'Needs Disposition' && (
                        <button className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors" title="Disposisi">
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function OutgoingLettersView() {
  const [search, setSearch] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [outgoing, setOutgoing] = useState(MOCK_OUTGOING);
  const [formData, setFormData] = useState({ recipient: '', subject: '', category: '' });

  const handleDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const newDoc = {
      id: `SK-26/01${outgoing.length + 5}`,
      recipient: formData.recipient,
      date: new Date().toISOString().split('T')[0],
      subject: formData.subject,
      category: formData.category,
      status: "Draft"
    };
    setOutgoing([newDoc, ...outgoing]);
    setIsDrafting(false);
    setFormData({ recipient: '', subject: '', category: '' });
  };

  const filteredOutgoing = outgoing.filter(item => item.subject.toLowerCase().includes(search.toLowerCase()) || item.recipient.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {isDrafting && (
         <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                     <Files className="w-5 h-5 text-blue-500" /> Draft Outgoing Letter
                  </h3>
                  <button onClick={() => setIsDrafting(false)} className="text-slate-400 hover:text-slate-600 transition tracking-wider">
                     <Plus className="w-6 h-6 rotate-45" />
                  </button>
               </div>
               <form onSubmit={handleDraft} className="p-6 space-y-4">
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Recipient / To</label>
                     <input 
                       required 
                       type="text" 
                       value={formData.recipient}
                       onChange={e => setFormData({...formData, recipient: e.target.value})}
                       className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-slate-200" 
                       placeholder="e.g. Dinas Pendidikan" 
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Subject</label>
                     <input 
                       required 
                       type="text" 
                       value={formData.subject}
                       onChange={e => setFormData({...formData, subject: e.target.value})}
                       className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-slate-200" 
                       placeholder="e.g. Permohonan Data Akademik" 
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
                     <select 
                       required 
                       value={formData.category}
                       onChange={e => setFormData({...formData, category: e.target.value})}
                       className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-slate-200"
                     >
                       <option value="">Select Category</option>
                       <option value="Akademik">Akademik</option>
                       <option value="Legal">Legal</option>
                       <option value="Kepegawaian">Kepegawaian</option>
                       <option value="Umum">Umum</option>
                     </select>
                  </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Editor</label>
                     <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-xs text-slate-500 flex items-center gap-1"><FileText className="w-3 h-3" /> E-Document template editor will launch upon saving draft.</p>
                     </div>
                  </div>
                  <div className="pt-4 flex justify-end gap-3">
                     <button type="button" onClick={() => setIsDrafting(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">Cancel</button>
                     <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-sm">Save Draft</button>
                  </div>
               </form>
            </div>
         </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Surat Keluar (Outgoing)</h2>
        <div className="flex items-center gap-2">
           <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                 type="text"
                 placeholder="Search recipient or subject..."
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 className="pl-9 pr-4 py-2 rounded-lg text-sm border border-slate-200 dark:border-white/10 focus:outline-none focus:border-blue-500 w-full sm:w-64 bg-white dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300"
              />
           </div>
           <button onClick={() => setIsDrafting(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm whitespace-nowrap">
             <Plus className="w-4 h-4" /> Draft Outgoing
           </button>
        </div>
      </div>
      <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">ID / Date</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Recipient</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Subject</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredOutgoing.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{item.id}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> {item.date}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{item.recipient}</td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{item.subject}</td>
                  <td className="px-6 py-4">
                     <span className={cn(
                       "px-2.5 py-1 rounded-full text-xs font-bold",
                       item.status === 'Draft' ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400" :
                       item.status === 'Waiting Approval' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                       "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                     )}>
                       {item.status}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ApprovalView() {
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">E-Approval & Digital Signature</h2>
      </div>

      {selectedDoc && (
         <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedDoc(null)}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
               <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                     <FileSignature className="w-5 h-5 text-blue-500" /> Review Document
                  </h3>
                  <button onClick={() => setSelectedDoc(null)} className="text-slate-400 hover:text-slate-600 transition tracking-wider">
                     <Plus className="w-6 h-6 rotate-45" />
                  </button>
               </div>
               
               <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/10">
                     <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Doc Reference</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDoc.docRef}</span>
                     </div>
                     <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Type</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{selectedDoc.type}</span>
                     </div>
                  </div>

                  <div className="w-full h-48 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-center text-slate-500 flex-col gap-2 relative">
                     <FileText className="w-8 h-8 opacity-50" />
                     <span className="text-sm">Document Preview Area</span>
                     <div className="absolute bottom-4 right-4 bg-blue-500/10 text-blue-500 px-3 py-1 rounded border border-blue-500/20 text-xs font-mono flex items-center gap-2">
                        <QrCode className="w-3 h-3" /> Digital Sign Placeholder
                     </div>
                  </div>
               </div>

               <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
                  <button onClick={() => setSelectedDoc(null)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-white dark:hover:bg-slate-800 transition">Close</button>
                  <button className="px-4 py-2 flex items-center gap-2 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 rounded-lg transition font-medium">
                     <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button className="px-4 py-2 flex items-center gap-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition">
                     <CheckSquare className="w-4 h-4" /> Sign & Approve
                  </button>
               </div>
            </div>
         </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {MOCK_APPROVALS.map(item => (
           <div key={item.id} className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 p-5 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-blue-500/30 transition-colors group cursor-pointer" onClick={() => setSelectedDoc(item)}>
             <div className="flex items-start gap-4">
               <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                 <FileSignature className="w-5 h-5 text-blue-600 dark:text-blue-400" />
               </div>
               <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                     {item.docRef}
                     <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Action Required</span>
                  </h3>
                  <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                     <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {item.type}</span>
                     <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Requested on {item.date} by {item.requestor}</span>
                  </div>
               </div>
             </div>
             <div className="flex gap-2">
               <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded font-medium text-sm transition-colors">
                  Review
               </button>
             </div>
           </div>
        ))}
      </div>
    </div>
  )
}

function ArchiveView() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Arsip Digital (Unified Repository)</h2>
      </div>
      <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Document ID</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Title</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Category</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Size</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {MOCK_ARCHIVES.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{item.id}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> {item.date}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{item.title}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                     <span className="px-2 py-1 bg-slate-100 dark:bg-white/10 rounded text-xs">{item.category}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{item.size}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Download">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function OcrScannerView() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setOcrResult(null);
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScan = async () => {
    if (!imagePreview) return;
    setIsScanning(true);
    setError(null);

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imagePreview })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scan document");
      setOcrResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during scanning");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-blue-500" />
            AI Document OCR
          </h3>
          
          <div className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 h-64 relative overflow-hidden group hover:border-blue-500/50 hover:bg-blue-500/5 transition-all">
            {imagePreview ? (
              <img src={imagePreview} alt="Document preview" className="h-full object-contain" />
            ) : (
              <div className="text-center">
                <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Click to upload or drag & drop</p>
                <p className="text-xs text-slate-500 mt-1">PNG, JPG or PDF up to 10MB</p>
              </div>
            )}
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          <div className="mt-4 flex gap-3">
             <button 
               onClick={handleScan}
               disabled={!selectedFile || isScanning}
               className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-white/10 text-white py-3 rounded-xl font-bold shadow-sm transition-all flex justify-center items-center gap-2"
             >
               {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanFace className="w-5 h-5" />}
               {isScanning ? "Extracting Metadata..." : "Scan & Extract"}
             </button>
             {imagePreview && (
               <button 
                 onClick={() => { setImagePreview(null); setSelectedFile(null); setOcrResult(null); }}
                 disabled={isScanning}
                 className="px-4 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 rounded-xl font-bold transition-all"
               >
                 Clear
               </button>
             )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}
        </div>

        <div className="bg-slate-100 dark:bg-black/40 rounded-xl border border-slate-200 dark:border-white/5 p-6 h-full min-h-[400px]">
           <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
             Extracted Data
             {ocrResult && <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-1 rounded text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Success</span>}
           </h3>
           
           {isScanning ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p className="animate-pulse">Analyzing document structure using AI...</p>
             </div>
           ) : ocrResult ? (
             <div className="space-y-4">
                <div className="bg-white dark:bg-white/5 p-4 rounded-lg border border-slate-200 dark:border-white/10">
                   <div className="text-xs text-slate-500 mb-1">Document Type</div>
                   <div className="font-bold text-slate-800 dark:text-slate-200 text-lg border-b border-slate-100 dark:border-white/5 pb-2 mb-2">
                     {ocrResult.documentType || 'Unknown'}
                   </div>
                   
                   <div className="grid grid-cols-1 gap-y-3 mt-4">
                     {ocrResult.extractedData && Object.entries(ocrResult.extractedData).map(([key, value]) => (
                        <div key={key}>
                          <div className="text-xs text-slate-500 uppercase font-medium">{key}</div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{String(value)}</div>
                        </div>
                     ))}
                   </div>
                </div>

                <button className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-lg font-medium shadow-sm transition-all flex justify-center items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Save to Repository
                </button>
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
               <FileText className="w-12 h-12 mb-3" />
               <p className="text-center px-4 text-sm">Upload a document and click "Scan" to auto-extract metadata.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
