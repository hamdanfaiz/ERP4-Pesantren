import React, { useState } from 'react';
import { Stethoscope, Activity, FileText, Pill, Plus, Search, Calendar, Clock, CheckCircle2, User, UserPlus, AlertTriangle } from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useTenantOperationalCollection } from '../firebaseUtils';

const INITIAL_VISITS = [
  { id: 'V001', santriName: 'Ahmad Muzakki', nis: '2324001', date: '2023-11-20', time: '09:30', complaint: 'Sakit Kepala & Demam', temp: '38.5°C', diagnosis: 'Demam Ringan', action: 'Istirahat di UKS, obat penurun panas', status: 'Completed' },
  { id: 'V002', santriName: 'Yusuf Mansur', nis: '2324002', date: '2023-11-21', time: '14:15', complaint: 'Sakit Perut', temp: '36.8°C', diagnosis: 'Maag', action: 'Diberikan obat antasida, diminta makan teratur', status: 'Completed' },
  { id: 'V003', santriName: 'Ahmad Muzakki', nis: '2324001', date: '2023-11-25', time: '10:00', complaint: 'Batuk Pilek', temp: '37.2°C', diagnosis: 'ISPA ringan', action: 'Obat batuk, istirahat di asrama', status: 'Monitoring' },
];

const INITIAL_RECORDS = [
  { id: 'R001', santriName: 'Ahmad Muzakki', nis: '2324001', bloodType: 'O', height: '165 cm', weight: '55 kg', allergies: 'Kacang', chronicIllness: 'Asma Ringan', lastCheck: '2023-10-01' },
  { id: 'R002', santriName: 'Yusuf Mansur', nis: '2324002', bloodType: 'AB', height: '170 cm', weight: '60 kg', allergies: '-', chronicIllness: '-', lastCheck: '2023-10-05' },
];

const INITIAL_INVENTORY = [
  { id: 'M001', name: 'Paracetamol 500mg', category: 'Analgesik/Antipiretik', stock: 150, unit: 'Tablet', expDate: '2025-08-10', status: 'Sufficient' },
  { id: 'M002', name: 'Antasida Doen', category: 'Obat Maag', stock: 20, unit: 'Tablet', expDate: '2024-12-01', status: 'Low Stock' },
  { id: 'M003', name: 'Amoxicillin 500mg', category: 'Antibiotik', stock: 0, unit: 'Kapsul', expDate: '2024-05-15', status: 'Out of Stock' },
  { id: 'M004', name: 'Betadine Cair 15ml', category: 'Antiseptik', stock: 5, unit: 'Botol', expDate: '2026-01-20', status: 'Low Stock' }
];

export function HealthcareManager() {
  const { role, user } = useAuth();
  const [activeTab, setActiveTab] = useState('visits'); // default to visits for Phase 1
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'visit' | 'record' | 'medicine'>('visit');
  const [formData, setFormData] = useState<any>({});
  
  const healthcareStaffTenantId = ['SuperAdmin', 'Admin', 'Ustadz'].includes(role) ? user?.tenantId : null;
  const visitsStore = useTenantOperationalCollection<any>('healthcare_visits', healthcareStaffTenantId);
  const recordsStore = useTenantOperationalCollection<any>('healthcare_records', healthcareStaffTenantId);
  const inventoryStore = useTenantOperationalCollection<any>('healthcare_inventory', healthcareStaffTenantId);
  const notificationsStore = useTenantOperationalCollection<any>('healthcare_notifications', healthcareStaffTenantId);
  const visits = visitsStore.records;
  const setVisits = visitsStore.setRecords;
  const records = recordsStore.records;
  const setRecords = recordsStore.setRecords;
  const inventory = inventoryStore.records;
  const setInventory = inventoryStore.setRecords;
  const notifications = notificationsStore.records;
  const setHealthcareNotifications = notificationsStore.setRecords;

  const handleExport = () => {
    if (role === 'Walisantri') {
      window.alert('Ekspor laporan UKS hanya tersedia untuk petugas pesantren.');
      return;
    }
    if (activeTab === 'dashboard') {
      window.alert('Pilih tab data UKS sebelum mengekspor laporan.');
      return;
    }
    const exportRows = activeTab === 'records' ? records : activeTab === 'medicine' ? inventory : visits;
    if (!exportRows.length) {
      window.alert('Tidak ada data untuk diekspor.');
      return;
    }
    const columns = Object.keys(exportRows[0]);
    const escapeCsv = (value: unknown) => `\"${String(value ?? '').replace(/\"/g, '\"\"')}\"`;
    const csvRows = [
      columns.map(escapeCsv).join(','),
      ...exportRows.map((row) => columns.map((column) => escapeCsv((row as any)[column])).join(',')),
    ];
    const blob = new Blob(['\uFEFF', csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const reportName = activeTab === 'records' ? 'rekam-medis' : activeTab === 'medicine' ? 'inventaris-obat' : 'kunjungan-uks';
    link.href = objectUrl;
    link.download = `${reportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };


  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalType === 'visit') {
      const newVisit = {
        id: generateUniqueId('Visit', visits),
        santriName: formData.santriName || 'Unknown',
        nis: formData.nis || '-',
        date: formData.date || new Date().toISOString().split('T')[0],
        time: formData.time || new Date().toTimeString().substring(0, 5),
        complaint: formData.complaint || '-',
        temp: formData.temp || '-',
        diagnosis: formData.diagnosis || '-',
        action: formData.action || '-',
        status: formData.status || 'Monitoring'
      };
      setVisits([newVisit, ...visits]);

      // Send the notification through the tenant-scoped communication collection.
      if (newVisit.status === 'Referred') {
        const announcement = {
          id: generateUniqueId('Announcement', notifications),
          title: 'DARURAT MEDIS: ' + newVisit.santriName,
          content: 'Terdapat laporan medis darurat dari UKS. Ananda ' + newVisit.santriName + ' mengalami keluhan ' + newVisit.complaint + ' (Suhu: ' + newVisit.temp + '). Diagnosis awal: ' + newVisit.diagnosis + '. Tindakan saat ini dirujuk ke RS / Penanganan Khusus. Mohon segera melihat ke UKS / menghubungi penanggung jawab asrama.',
          target: 'Wali Santri ' + newVisit.santriName,
          date: newVisit.date,
          status: 'Sent',
          readCount: 0,
          totalTarget: 1,
          acknowledgedBy: [],
          isUrgent: true,
          sourceModule: 'healthcare'
        };
        setHealthcareNotifications(previous => [{ ...announcement, notificationType: 'urgent' }, ...previous]);
      } else {
        const message = {
          id: generateUniqueId('Message', notifications),
          to: 'Admin UKS',
          fromUser: user?.name || role,
          preview: 'Laporan kunjungan UKS: Ananda ' + newVisit.santriName + ' mengalami keluhan ' + newVisit.complaint + ' dan diberikan tindakan ' + newVisit.action + '. Status: ' + newVisit.status + '.',
          date: newVisit.date,
          status: 'Sent',
          role,
          sourceModule: 'healthcare'
        };
        setHealthcareNotifications(previous => [{ ...message, notificationType: 'message' }, ...previous]);
      }
      
    } else if (modalType === 'record') {
      const newRecord = {
        id: generateUniqueId('Record', records),
        santriName: formData.santriName || 'Unknown',
        nis: formData.nis || '-',
        bloodType: formData.bloodType || '-',
        height: formData.height || '-',
        weight: formData.weight || '-',
        allergies: formData.allergies || '-',
        chronicIllness: formData.chronicIllness || '-',
        lastCheck: new Date().toISOString().split('T')[0]
      };
      setRecords([newRecord, ...records]);
    } else if (modalType === 'medicine') {
      const newMed = {
        id: generateUniqueId('Medicine', []),
        name: formData.name || 'Unknown',
        category: formData.category || '-',
        stock: formData.stock ? parseInt(formData.stock) : 0,
        unit: formData.unit || '-',
        expDate: formData.expDate || new Date().toISOString().split('T')[0],
        status: (formData.stock && parseInt(formData.stock) > 20) ? 'Sufficient' : (formData.stock && parseInt(formData.stock) > 0) ? 'Low Stock' : 'Out of Stock'
      };
      setInventory([newMed, ...inventory]);
    }
    setIsModalOpen(false);
    setFormData({});
  };

  const renderVisits = () => {
    const visibleVisits = role === 'Walisantri' 
      ? visits.filter(v => v.santriName === (user?.name === 'Bapak Ahmad Muzakki' ? 'Ahmad Muzakki' : v.santriName)) // dummy filter for walisantri viewing their child
      : visits;
      
    // Additional basic filtering if needed based on search
    const filteredVisits = visibleVisits.filter(v => v.santriName.toLowerCase().includes(searchQuery.toLowerCase()) || v.complaint.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Waktu & Tanggal</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama Santri</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Keluhan & Suhu</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Diagnosis & Tindakan</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredVisits.map(item => (
              <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 font-medium">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    {item.date}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    {item.time}
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.santriName}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">NIS: {item.nis}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm text-slate-700 dark:text-slate-300">{item.complaint}</div>
                  <div className="text-xs font-medium mt-1">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded",
                      parseFloat(item.temp) > 37.5 ? "bg-red-500/20 text-red-600 dark:text-red-400" : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    )}>
                      Suhu: {item.temp}
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.diagnosis}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-1" title={item.action}>{item.action}</div>
                </td>
                <td className="p-4">
                  <span className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border",
                    item.status === 'Completed' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  )}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
            {filteredVisits.length === 0 && (
               <tr>
                 <td colSpan={5} className="p-8 text-center text-slate-500 text-sm">
                   Tidak ada data kunjungan.
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRecords = () => {
    const filteredRecords = records.filter(r => r.santriName.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data Santri</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fisik</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Peringatan Medis</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cek Terakhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredRecords.map(item => (
              <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.santriName}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">NIS: {item.nis}</div>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-1 rounded font-medium border border-rose-500/20">Gol Darah: {item.bloodType}</span>
                    <span className="bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 px-2 py-1 rounded border border-slate-300 dark:border-white/10">TB: {item.height}</span>
                    <span className="bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 px-2 py-1 rounded border border-slate-300 dark:border-white/10">BB: {item.weight}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-sm">
                    {item.allergies !== '-' || item.chronicIllness !== '-' ? (
                       <div className="flex flex-col gap-1">
                          {item.allergies !== '-' && (
                            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" /> Alergi: {item.allergies}
                            </span>
                          )}
                          {item.chronicIllness !== '-' && (
                            <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" /> Riwayat: {item.chronicIllness}
                            </span>
                          )}
                       </div>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded-md w-fit">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sehat
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> {item.lastCheck}
                  </div>
                </td>
              </tr>
            ))}
             {filteredRecords.length === 0 && (
               <tr>
                 <td colSpan={4} className="p-8 text-center text-slate-500 text-sm">
                   Tidak ada data rekam medis.
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMedicine = () => {
    const filteredInventory = inventory.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.category.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama Obat & Kategori</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stok</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tgl Kedaluwarsa</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredInventory.map(item => (
              <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <Pill className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.category}</div>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.stock} <span className="text-xs text-slate-500 font-normal">{item.unit}</span></div>
                </td>
                <td className="p-4">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> {item.expDate}
                  </div>
                </td>
                <td className="p-4">
                  <span className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border inline-flex items-center gap-1",
                    item.status === 'Sufficient' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : 
                    item.status === 'Low Stock' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" : 
                    "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                  )}>
                    {item.status === 'Out of Stock' && <AlertTriangle className="w-3 h-3" />}
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
             {filteredInventory.length === 0 && (
               <tr>
                 <td colSpan={4} className="p-8 text-center text-slate-500 text-sm">
                   Tidak ada data obat yang ditemukan.
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderDashboard = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayVisits = visits.filter(v => v.date === today).length;
    const activeMonitoring = visits.filter(v => v.status === 'Monitoring').length;
    const lowStockCount = inventory.filter(m => m.status !== 'Sufficient').length;
    const totalRecords = records.length;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg"><Stethoscope className="w-5 h-5"/></div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Kunjungan Hari Ini</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-200">{todayVisits}</p>
          </div>
          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg"><Activity className="w-5 h-5"/></div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Sedang Observasi</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-200">{activeMonitoring}</p>
          </div>
          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg"><FileText className="w-5 h-5"/></div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Rekam Medis</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-200">{totalRecords}</p>
          </div>
          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg"><Pill className="w-5 h-5"/></div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Obat Menipis/Habis</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-200">{lowStockCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-500" />
              Santri Dalam Observasi
            </h3>
            <div className="space-y-3">
              {visits.filter(v => v.status === 'Monitoring').map(v => (
                <div key={v.id} className="p-3 bg-white/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{v.santriName}</p>
                    <p className="text-xs text-slate-500">{v.complaint} • Suhu: {v.temp}</p>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                    MONITORING
                  </span>
                </div>
              ))}
              {activeMonitoring === 0 && (
                <p className="text-sm text-slate-500 italic">Tidak ada santri yang sedang diobservasi.</p>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Peringatan Stok Obat
            </h3>
            <div className="space-y-3">
              {inventory.filter(m => m.status !== 'Sufficient').map(m => (
                <div key={m.id} className="p-3 bg-white/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{m.name}</p>
                    <p className="text-xs text-slate-500">{m.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{m.stock} <span className="text-xs font-normal text-slate-500">{m.unit}</span></p>
                    <p className="text-[10px] text-rose-500 font-medium">{m.status}</p>
                  </div>
                </div>
              ))}
              {lowStockCount === 0 && (
                <p className="text-sm text-slate-500 italic">Stok obat aman.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-rose-500 pb-1 inline-block">Healthcare & UKS</h1>
          <p className="text-slate-500 text-sm mt-2">Manage student health records, medication, and clinic visits</p>
        </div>
        
        {role !== 'Walisantri' && (
          <div className="flex items-center gap-3">
            {activeTab === 'medicine' ? (
              <button 
                onClick={() => { setModalType('medicine'); setIsModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Tambah Stok Obat</span>
              </button>
            ) : (
              <>
                <button 
                  onClick={() => { setModalType('visit'); setIsModalOpen(true); }}
                  className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Kunjungan Baru</span>
                </button>
                <button 
                  onClick={() => { setModalType('record'); setIsModalOpen(true); }}
                  className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors border border-slate-700"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Update Profil Medis</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40 shrink-0">
              <h3 className="font-medium text-slate-800 dark:text-slate-200">
                {modalType === 'visit' ? 'Catat Kunjungan UKS Baru' : modalType === 'medicine' ? 'Tambah Stok Obat' : 'Update Profil Medis Santri'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="p-6 overflow-y-auto flex-1 bg-white dark:bg-black/20">
              <div className="space-y-4">
                {modalType === 'visit' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Nama Santri</label>
                         <input type="text" required value={formData.santriName || ''} onChange={e => setFormData({...formData, santriName: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">NIS</label>
                         <input type="text" required value={formData.nis || ''} onChange={e => setFormData({...formData, nis: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Keluhan Utama</label>
                         <input type="text" required value={formData.complaint || ''} onChange={e => setFormData({...formData, complaint: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Suhu Tubuh (°C)</label>
                         <input type="text" placeholder="e.g., 36.5" value={formData.temp || ''} onChange={e => setFormData({...formData, temp: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Diagnosis / Observasi</label>
                       <input type="text" required value={formData.diagnosis || ''} onChange={e => setFormData({...formData, diagnosis: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Tindakan / Obat yang diberikan</label>
                       <textarea required value={formData.action || ''} onChange={e => setFormData({...formData, action: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500 min-h-[80px]" />
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Status Akhir & Notifikasi</label>
                       <select value={formData.status || 'Monitoring'} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500">
                         <option value="Completed">Selesai (Completed)</option>
                         <option value="Monitoring">Observasi (Monitoring)</option>
                         <option value="Referred">Rujuk RS (Referred)</option>
                       </select>
                       <p className="text-[10px] text-slate-500 mt-1">Notifikasi akan dikirimkan otomatis ke wali santri.</p>
                    </div>
                  </>
                ) : modalType === 'medicine' ? (
                  <>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Nama Obat / Alat</label>
                       <input type="text" required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Kategori / Fungsi</label>
                       <input type="text" required value={formData.category || ''} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Stok</label>
                         <input type="number" required min="0" value={formData.stock || ''} onChange={e => setFormData({...formData, stock: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Satuan</label>
                         <input type="text" placeholder="e.g., Tablet, Botol" required value={formData.unit || ''} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Tanggal Kedaluwarsa</label>
                       <input type="date" required value={formData.expDate || ''} onChange={e => setFormData({...formData, expDate: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                    </div>
                  </>
                ) : (
                   <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Nama Santri</label>
                         <input type="text" required value={formData.santriName || ''} onChange={e => setFormData({...formData, santriName: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">NIS</label>
                         <input type="text" required value={formData.nis || ''} onChange={e => setFormData({...formData, nis: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Gol. Darah</label>
                         <select value={formData.bloodType || 'A'} onChange={e => setFormData({...formData, bloodType: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500">
                           <option value="A">A</option><option value="B">B</option><option value="AB">AB</option><option value="O">O</option>
                         </select>
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Tinggi (cm)</label>
                         <input type="number" required value={formData.height || ''} onChange={e => setFormData({...formData, height: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Berat (kg)</label>
                         <input type="number" required value={formData.weight || ''} onChange={e => setFormData({...formData, weight: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                      </div>
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Riwayat Alergi</label>
                       <input type="text" placeholder="Isi '-' jika tidak ada" value={formData.allergies || ''} onChange={e => setFormData({...formData, allergies: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Riwayat Penyakit Menahun/Keturunan</label>
                       <input type="text" placeholder="Isi '-' jika tidak ada" value={formData.chronicIllness || ''} onChange={e => setFormData({...formData, chronicIllness: e.target.value})} className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500" />
                    </div>
                   </>
                )}
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-white/5 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-white transition-colors">Batal</button>
                <button type="submit" className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-rose-600/20">Simpan Data</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-slate-50 dark:bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/5 bg-black/40 overflow-x-auto">
          <div className="flex p-2 gap-2 min-w-max">
            {[
              { id: 'visits', label: 'Riwayat Kunjungan UKS', icon: <Stethoscope className="w-4 h-4" /> },
              { id: 'records', label: 'Profil Medis Santri', icon: <FileText className="w-4 h-4" /> },
              { id: 'medicine', label: 'Inventory Obat', icon: <Pill className="w-4 h-4" /> },
              { id: 'dashboard', label: 'Statistik Harian', icon: <Activity className="w-4 h-4" /> },
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn("erp-tab-control", 
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative",
                  activeTab === tab.id 
                    ? "bg-rose-500/10 text-rose-400" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/20 border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
  type="button"
  onClick={handleExport}
  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-rose-200/20 bg-rose-600/10 px-3 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-600/20"
>
  <FileText className="h-4 w-4" />
  Ekspor CSV
</button>
<div className="relative min-w-0 flex-1 sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Cari santri..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:border-rose-500 w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'visits' && renderVisits()}
          {activeTab === 'records' && renderRecords()}
          {activeTab === 'medicine' && renderMedicine()}
          {activeTab === 'dashboard' && renderDashboard()}
        </div>
      </div>
    </div>
  );
}

