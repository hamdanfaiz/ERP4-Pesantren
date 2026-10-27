import { publicRuntimeConfigValue } from "../runtimeConfig";
import React, { useEffect, useState } from 'react';
import {
  Megaphone, MessageSquare, Send, Search, Filter, Plus,
  Users, Calendar, Clock, CheckCircle2, ChevronRight, Inbox, FileText,
  AlertCircle, LifeBuoy
} from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useSystemSettings } from '../hooks/useSystemSettings';
import { useTenantOperationalCollection } from '../firebaseUtils';
import { getAccessToken } from '../authSession';

const SUPABASE_COMMUNICATION_ANNOUNCEMENTS = publicRuntimeConfigValue("VITE_SUPABASE_COMMUNICATION_ANNOUNCEMENTS") === 'true';
const SUPABASE_COMMUNICATION_IMPORT = publicRuntimeConfigValue("VITE_SUPABASE_COMMUNICATION_IMPORT_ENABLED") === 'true';

async function requestSupabaseAnnouncementApi(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Pengumuman belum dapat diproses.');
  return payload;
}

type Tab = 'announcements' | 'messages' | 'templates' | 'permissions' | 'helpdesk';

const ANNOUNCEMENTS = [
  { id: 'A001', title: 'Jadwal Libur Semester Ganjil', content: 'Assalamu\'alaikum wr. wb. Diberitahukan kepada seluruh wali santri bahwa libur semester ganjil akan dimulai dari tanggal 20 Desember hingga 2 Januari.', target: 'Semua Wali Santri', date: '2023-11-20', status: 'Sent', readCount: 450, totalTarget: 500, acknowledgedBy: [] as string[] },
  { id: 'A002', title: 'Pemberitahuan Pembayaran SPP Bulan Desember', content: 'Mohon untuk segera melunasi pembayaran SPP selambat-lambatnya tanggal 10 Desember. Pembayaran dapat dilakukan via Virtual Account.', target: 'Semua Wali Santri', date: '2023-11-25', status: 'Scheduled', readCount: 0, totalTarget: 500, acknowledgedBy: [] as string[] },
  { id: 'A003', title: 'Rapat Persiapan Pembagian Raport', content: 'Kepada seluruh guru dan musyrif dimohon kehadirannya pada rapat persiapan pembagian raport besok pagi.', target: 'Guru & Musyrif', date: '2023-11-28', status: 'Draft', readCount: 0, totalTarget: 45, acknowledgedBy: [] as string[] },
  { id: 'A004', title: 'Tugas Tambahan Kelas VII - A', content: 'Dimohon untuk memantau tugas harian santri kelas VII - A melalui modul e-learning malam ini.', target: 'Wali Santri Kelas VII - A', date: '2023-11-29', status: 'Sent', readCount: 15, totalTarget: 30, acknowledgedBy: [] as string[] },
  { id: 'A005', title: 'PEMBERITAHUAN DARURAT: Penyesuaian Jadwal Terkait Cuaca', content: 'Mengingat cuaca ekstrem, seluruh jadwal kegiatan asrama malam hari dialihkan ke dalam ruangan. Diharapkan wali santri tetap tenang.', target: 'Semua Wali Santri', date: '2023-11-30', status: 'Sent', readCount: 200, totalTarget: 500, acknowledgedBy: [] as string[], isUrgent: true },
];

const MESSAGES = [
  { id: 'M001', to: 'Bpk. Budi (Wali Ahmad Muzakki)', fromUser: 'Ust. Hidayat Lc.', preview: 'Assalamu\'alaikum Bapak, menginformasikan bahwa Ahmad...', date: '10:30 AM', status: 'Read', role: 'Ustadz' },
  { id: 'M002', to: 'Ibu Siti (Wali Yusuf Mansur)', fromUser: 'Ust. Rahman', preview: 'Mohon maaf Ibu, Yusuf Mansur tidak hadir di kelas...', date: 'Yesterday', status: 'Delivered', role: 'Ustadz' },
  { id: 'M003', to: 'Pegawai Catering', fromUser: 'Admin Finance', preview: 'Tolong disiapkan makan malam tambahan untuk 10 porsi...', date: 'Nov 20', status: 'Sent', role: 'Admin' },

  // Walisantri specific dummy messages
  { id: 'M004', to: 'Ust. Hidayat Lc. (Wali Kelas)', fromUser: 'Bapak Ahmad Muzakki', preview: 'Wa\'alaikumsalam ustadz. Baik, terimakasih atas informasinya...', date: '10:35 AM', status: 'Read', role: 'Walisantri' },
  { id: 'M005', to: 'Ust. Rahman (Ustadz Asrama)', fromUser: 'Bapak Ahmad Muzakki', preview: 'Ustadz, apakah diperbolehkan menjenguk ananda akhir pekan ini?', date: 'Yesterday', status: 'Delivered', role: 'Walisantri' },
];

const TEMPLATES = [
  { id: 'T001', name: 'Reminder SPP', content: 'Assalamu\'alaikum Wr Wb. Yth. Wali Santri [NAMA_SANTRI], mohon untuk menyelesaikan pembayaran SPP bulan [BULAN] sebesar [NOMINAL]. Terima kasih.' },
  { id: 'T002', name: 'Pemberitahuan Sakit', content: 'Assalamu\'alaikum Wr Wb. Yth. Wali Santri, menginformasikan bahwa ananda [NAMA_SANTRI] saat ini sedang beristirahat di UKS karena sakit. Mohon doanya.' },
];

const PERMISSIONS = [
  { id: 'P001', santriName: 'Ahmad Muzakki', reason: 'Sakit', description: 'Demam tinggi sejak semalam, mohon izin pulang untuk berobat.', dateFrom: '2023-11-20', dateTo: '2023-11-22', status: 'Approved', requestedBy: 'Bapak Ahmad Muzakki', role: 'Walisantri' },
  { id: 'P002', santriName: 'Yusuf Mansur', reason: 'Izin Pulang', description: 'Menghadiri acara pernikahan kakak kandung di kampung halaman.', dateFrom: '2023-11-25', dateTo: '2023-11-27', status: 'Pending', requestedBy: 'Ibu Siti (Wali Yusuf Mansur)', role: 'Walisantri' },
];

const TICKETS = [
  { id: 'TKT-001', subject: 'Konfirmasi Error Pembayaran SPP', category: 'Keuangan', description: 'Saya sudah mentransfer melalui BSI Mobile namun status di aplikasi masih Unpaid. Terlampir bukti...', date: '2023-11-30', status: 'Open', requestedBy: 'Bapak Ahmad Muzakki', role: 'Walisantri' },
  { id: 'TKT-002', subject: 'Perubahan Alamat Domisili', category: 'Administrasi', description: 'Mohon update alamat rumah kami di data santri Yusuf Mansur karena kami baru saja pindah ke...', date: '2023-11-28', status: 'Resolved', requestedBy: 'Ibu Siti (Wali Yusuf Mansur)', role: 'Walisantri' },
];

export function CommunicationHub() {
  const { role, user } = useAuth();
  const { mobileConfig, orgInfo } = useSystemSettings();
  const [activeTab, setActiveTab] = useState<Tab>('announcements');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedAnnouncements, setExpandedAnnouncements] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<any>({});
  const [supabaseAnnouncements, setSupabaseAnnouncements] = useState<any[]>([]);
  const [supabaseAnnouncementsLoading, setSupabaseAnnouncementsLoading] = useState(SUPABASE_COMMUNICATION_ANNOUNCEMENTS);
  const [supabaseAnnouncementsError, setSupabaseAnnouncementsError] = useState('');
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [isAnnouncementMigrationOpen, setIsAnnouncementMigrationOpen] = useState(false);
  const [announcementMigrationReport, setAnnouncementMigrationReport] = useState<any>(null);
  const [announcementMigrationError, setAnnouncementMigrationError] = useState('');
  const [isAnnouncementMigrationBusy, setIsAnnouncementMigrationBusy] = useState(false);
  const canCreateInCurrentTab = activeTab === 'announcements'
    ? ['Admin', 'SuperAdmin'].includes(role)
    : (role !== 'Walisantri' || activeTab === 'messages' || (activeTab === 'permissions' && mobileConfig.allowLeaveRequests) || activeTab === 'helpdesk');

  const communicationStaffTenantId = ['SuperAdmin', 'Admin', 'Ustadz'].includes(role) ? user?.tenantId : null;
  const announcementsStore = useTenantOperationalCollection<any>(
    'communication_announcements',
    SUPABASE_COMMUNICATION_ANNOUNCEMENTS ? null : user?.tenantId,
  );
  const messagesStore = useTenantOperationalCollection<any>('communication_messages', user?.tenantId, communicationStaffTenantId ? null : user?.uid);
  const templatesStore = useTenantOperationalCollection<any>('communication_templates', communicationStaffTenantId);
  const permissionsStore = useTenantOperationalCollection<any>('communication_permissions', user?.tenantId, communicationStaffTenantId ? null : user?.uid);
  const ticketsStore = useTenantOperationalCollection<any>('communication_tickets', user?.tenantId, communicationStaffTenantId ? null : user?.uid);
  const announcements = SUPABASE_COMMUNICATION_ANNOUNCEMENTS ? supabaseAnnouncements : announcementsStore.records;
  const setLegacyAnnouncements = announcementsStore.setRecords;
  const messages = messagesStore.records;
  const setMessages = messagesStore.setRecords;
  const templates = templatesStore.records;
  const setTemplates = templatesStore.setRecords;
  const permissions = permissionsStore.records;
  const setPermissions = permissionsStore.setRecords;
  const tickets = ticketsStore.records;
  const setTickets = ticketsStore.setRecords;

  useEffect(() => {
    if (!SUPABASE_COMMUNICATION_ANNOUNCEMENTS) return;
    let active = true;
    if (!user?.tenantId || !user?.uid) {
      setSupabaseAnnouncements([]);
      setSupabaseAnnouncementsLoading(false);
      setSupabaseAnnouncementsError('Profil tenant aktif diperlukan untuk membaca pengumuman.');
      return () => { active = false; };
    }
    setSupabaseAnnouncementsLoading(true);
    setSupabaseAnnouncementsError('');
    requestSupabaseAnnouncementApi('/api/communication/announcements')
      .then((payload) => {
        if (active) setSupabaseAnnouncements(Array.isArray(payload.announcements) ? payload.announcements : []);
      })
      .catch((error: any) => {
        if (active) setSupabaseAnnouncementsError(error?.message || 'Pengumuman belum dapat dimuat.');
      })
      .finally(() => {
        if (active) setSupabaseAnnouncementsLoading(false);
      });
    return () => { active = false; };
  }, [user?.tenantId, user?.uid]);

  const runAnnouncementMigration = async (apply: boolean) => {
    setIsAnnouncementMigrationBusy(true);
    setAnnouncementMigrationError('');
    try {
      const payload = await requestSupabaseAnnouncementApi('/api/communication/announcements/migrate', {
        method: 'POST',
        body: JSON.stringify(apply
          ? {
              apply: true,
              confirmation: 'IMPORT_COMMUNICATION_ANNOUNCEMENTS',
              previewFingerprint: announcementMigrationReport?.previewFingerprint,
            }
          : { apply: false }),
      });
      setAnnouncementMigrationReport(payload);
    } catch (error: any) {
      setAnnouncementMigrationError(error?.message || 'Preview/impor pengumuman belum dapat diproses.');
    } finally {
      setIsAnnouncementMigrationBusy(false);
    }
  };



  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'announcements') {
      if (SUPABASE_COMMUNICATION_ANNOUNCEMENTS) {
        setIsSavingAnnouncement(true);
        setSupabaseAnnouncementsError('');
        try {
          const payload = await requestSupabaseAnnouncementApi('/api/communication/announcements', {
            method: 'POST',
            body: JSON.stringify({
              title: formData.title || '',
              content: formData.content || '',
              target: formData.target || 'Semua Wali Santri',
              isUrgent: formData.isUrgent === true,
            }),
          });
          if (payload.announcement) setSupabaseAnnouncements((previous) => [payload.announcement, ...previous]);
        } catch (error: any) {
          setSupabaseAnnouncementsError(error?.message || 'Pengumuman belum dapat disimpan.');
          setIsSavingAnnouncement(false);
          return;
        }
        setIsSavingAnnouncement(false);
      } else {
      const newAnn = {
        id: generateUniqueId('Announcement', announcements),
        title: (formData.isUrgent ? 'DARURAT: ' : '') + (formData.title || 'Untitled'),
        content: formData.content || '',
        target: formData.target || 'Semua Wali Santri',
        date: new Date().toISOString().split('T')[0],
        status: 'Sent',
        readCount: 0,
        totalTarget: formData.target === 'Guru & Musyrif' ? 45 : 500,
        acknowledgedBy: [] as string[],
        isUrgent: formData.isUrgent || false
      };
      setLegacyAnnouncements([newAnn, ...announcements]);
      }
    } else if (activeTab === 'messages') {
      const newMsg = {
        id: generateUniqueId('Message', messages),
        to: formData.to || 'Unknown',
        fromUser: user?.name || role,
        preview: formData.content?.substring(0, 50) + '...' || 'No content',
        date: 'Just now',
        status: 'Sent',
        role: role
      };
      setMessages([newMsg, ...messages]);
    } else if (activeTab === 'templates') {
      const newTpl = {
        id: generateUniqueId('Template', templates),
        name: formData.name || 'New Template',
        content: formData.content || ''
      };
      setTemplates([newTpl, ...templates]);
    } else if (activeTab === 'permissions') {
      const newPerm = {
        id: generateUniqueId('Permission', permissions),
        santriName: formData.santriName || 'Unknown Student',
        reason: formData.reason || 'Sakit',
        description: formData.description || '',
        dateFrom: formData.dateFrom || new Date().toISOString().split('T')[0],
        dateTo: formData.dateTo || new Date().toISOString().split('T')[0],
        status: 'Pending',
        requestedBy: user?.name || role,
        role: role
      };
      setPermissions([newPerm, ...permissions]);
    } else if (activeTab === 'helpdesk') {
      const newTicket = {
        id: generateUniqueId('Ticket', tickets),
        subject: formData.subject || 'Laporan Kendala Baru',
        category: formData.category || 'Lainnya',
        description: formData.description || '',
        date: new Date().toISOString().split('T')[0],
        status: 'Open',
        requestedBy: user?.name || role,
        role: role
      };
      setTickets([newTicket, ...tickets]);
    }
    setIsModalOpen(false);
    setFormData({});
  };

  const toggleAnnouncement = (id: string) => {
    const newSet = new Set(expandedAnnouncements);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedAnnouncements(newSet);
  };

  const handleAcknowledge = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.name) return;
    const actorName = user.name;
    if (SUPABASE_COMMUNICATION_ANNOUNCEMENTS) {
      setSupabaseAnnouncementsError('');
      try {
        const result = await requestSupabaseAnnouncementApi(`/api/communication/announcements/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' });
        if (!result.alreadyRead) {
          setSupabaseAnnouncements((previous) => previous.map((announcement) => announcement.id === id
            ? {
                ...announcement,
                acknowledgedBy: [...(announcement.acknowledgedBy || []), actorName],
                readCount: Number(announcement.readCount || 0) + 1,
              }
            : announcement));
        }
      } catch (error: any) {
        setSupabaseAnnouncementsError(error?.message || 'Konfirmasi baca belum dapat disimpan.');
      }
      return;
    }
    setLegacyAnnouncements(announcements.map(a => {
      if (a.id === id && !a.acknowledgedBy.includes(user.name!)) {
        return {
           ...a,
           acknowledgedBy: [...a.acknowledgedBy, user.name!],
           readCount: a.readCount + 1
        };
      }
      return a;
    }));
  };

  const renderWalisantriAnnouncements = () => {
    const relevantAnnouncements = announcements.filter(a => a.target === 'Semua Wali Santri' || a.target === 'Wali Santri Kelas VII - A' || a.target.includes('Wali Santri '));

    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {SUPABASE_COMMUNICATION_ANNOUNCEMENTS && supabaseAnnouncementsError && (
          <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-300">{supabaseAnnouncementsError}</div>
        )}
        {SUPABASE_COMMUNICATION_ANNOUNCEMENTS && supabaseAnnouncementsLoading ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-white/50 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/5 dark:bg-black/20">Memuat pengumuman tenant…</div>
        ) : relevantAnnouncements.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-black/20 rounded-xl border border-white/5">
            <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>Tidak ada pengumuman baru untuk saat ini.</p>
          </div>
        ) : relevantAnnouncements.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase())).map(item => {
          const isAcknowledged = user?.name ? item.acknowledgedBy.includes(user.name) : false;
          const isExpanded = expandedAnnouncements.has(item.id);

          return (
            <div key={item.id}
              onClick={() => toggleAnnouncement(item.id)}
              className={cn(
                "border rounded-xl overflow-hidden cursor-pointer transition-colors relative",
                item.isUrgent
                  ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/30 hover:border-rose-300 dark:hover:border-rose-500/50"
                  : "bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10"
              )}
            >
              {item.isUrgent && (
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
              )}
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-3 items-start">
                  <div className={cn(
                    "mt-1 p-2 rounded-lg",
                    isAcknowledged ? "bg-slate-200 dark:bg-white/5 text-slate-500" :
                    item.isUrgent ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" :
                    "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                  )}>
                    {item.isUrgent ? <AlertCircle className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className={cn("text-sm font-medium", isAcknowledged ? "text-slate-600 dark:text-slate-400" : "text-slate-800 dark:text-slate-200")}>{item.title}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                      <Calendar className="w-3 h-3" /> {item.date}
                      <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-600"></span>
                      <span>{item.target}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {isAcknowledged ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Telah Dibaca
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
                      Belum Dibaca
                    </span>
                  )}
                  <ChevronRight className={cn("w-4 h-4 text-slate-500 transition-transform", isExpanded ? "rotate-90" : "")} />
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-200 dark:border-white/5 p-4 bg-white dark:bg-black/20">
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{item.content}</p>

                  {!isAcknowledged && (
                    <div className="mt-4 flex justify-end">
                      <button
                         onClick={(e) => handleAcknowledge(item.id, e)}
                         className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Tandai Sudah Dibaca & Mengerti
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderAnnouncements = () => (
    <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {SUPABASE_COMMUNICATION_ANNOUNCEMENTS && supabaseAnnouncementsError && (
        <div role="alert" className="m-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-300">{supabaseAnnouncementsError}</div>
      )}
      {SUPABASE_COMMUNICATION_ANNOUNCEMENTS && supabaseAnnouncementsLoading && (
        <div role="status" className="px-4 py-6 text-center text-sm text-slate-500">Memuat pengumuman tenant…</div>
      )}
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Announcement</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Target</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Engagement</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {announcements.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
            <tr key={item.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
              <td className="p-4">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-slate-500" />
                  {item.title}
                </div>
              </td>
              <td className="p-4">
                <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-white/5  text-slate-700 dark:text-slate-300">
                  {item.target}
                </span>
              </td>
              <td className="p-4">
                <div className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  {item.date}
                </div>
              </td>
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 max-w-[100px] bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${item.totalTarget > 0 ? Math.min(100, (item.readCount / item.totalTarget) * 100) : 0}%` }}
                    />
                  </div>
                  <span title={item.legacyReadCount > 0 ? `Termasuk ${item.legacyReadCount} hitungan baca agregat dari migrasi lama` : undefined} className="text-xs text-slate-500 dark:text-slate-400 font-mono">{item.readCount}/{item.totalTarget}</span>
                </div>
              </td>
              <td className="p-4">
                <span className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border",
                  item.status === 'Sent' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                  item.status === 'Scheduled' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                  "bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30"
                )}>
                  {item.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderMessages = () => {
    const visibleMessages = role === 'Walisantri' ? messages.filter(m => m.role === 'Walisantri') : messages;

    return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="md:col-span-1 bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl flex flex-col h-[600px]">
        <div className="p-4 border-b border-slate-200 dark:border-white/5 text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Inbox className="w-4 h-4" />
          Recent Messages
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-white/5">
          {visibleMessages.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">Belum ada pesan.</div>
          ) : visibleMessages.map((msg, i) => (
            <div key={msg.id} className={cn(
              "p-4 cursor-pointer hover:bg-white/[0.02] transition-colors",
              i === 0 ? "bg-white/[0.02] border-l-2 border-indigo-500" : ""
            )}>
              <div className="flex justify-between items-center mb-1">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {role === 'Walisantri' ? msg.to : (msg.role === 'Walisantri' ? msg.fromUser : msg.to)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{msg.date}</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{msg.preview}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="md:col-span-2 bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl flex flex-col h-[600px]">
        {/* Chat Placeholder */}
        {visibleMessages.length > 0 ? (
          <>
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-black/20">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {role === 'Walisantri' ? visibleMessages[0]?.to : (visibleMessages[0]?.role === 'Walisantri' ? visibleMessages[0]?.fromUser : visibleMessages[0]?.to)}
                </div>
                <div className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                   <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Online
                </div>
              </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-4 flex flex-col justify-end">
              <div className="bg-slate-100 dark:bg-white/5  rounded-2xl rounded-tl-none p-3 max-w-[80%] self-start">
                 <p className="text-sm text-slate-700 dark:text-slate-300">Wa'alaikumsalam. Silahkan jika ada yang ingin ditanyakan atau didiskusikan.</p>
                 <span className="text-[10px] text-slate-500 block mt-1">10:32 AM</span>
              </div>
              <div className="bg-indigo-600/30 border border-indigo-500/30 rounded-2xl rounded-tr-none p-3 max-w-[80%] self-end">
                 <p className="text-sm text-indigo-100">{visibleMessages[0]?.preview}</p>
                 <div className="flex justify-end mt-1 items-center gap-1">
                   <span className="text-[10px] text-indigo-300/70">{visibleMessages[0]?.date}</span>
                   <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                 </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-black/20">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Ketik pesan Anda..."
                  className="w-full bg-black/40  rounded-full pl-4 pr-12 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
             <MessageSquare className="w-10 h-10 opacity-50" />
             <p className="text-sm">Pilih pesan untuk memulai obrolan</p>
          </div>
        )}
      </div>
    </div>
  );
};

  const renderTemplates = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())).map(template => (
        <div key={template.id} className="bg-black/40 border border-slate-200 dark:border-white/5 p-5 rounded-xl hover:border-slate-200 dark:border-white/10 transition-colors flex flex-col h-full">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              {template.name}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 leading-relaxed border border-dashed border-slate-200 dark:border-white/10 p-3 rounded-lg bg-black/20">
            {template.content}
          </p>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 py-1.5 rounded-lg text-xs font-medium transition-colors border border-slate-200 dark:border-white/5">
              Edit
            </button>
            <button className="flex-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 py-1.5 rounded-lg text-xs font-medium transition-colors border border-indigo-500/20">
              Use Template
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const handleUpdatePermissionStatus = (id: string, newStatus: string) => {
    setPermissions(permissions.map(p => p.id === id ? { ...p, status: newStatus } : p));
  };

  const renderPermissions = () => {
    const visiblePermissions = role === 'Walisantri' ? permissions.filter(p => p.role === 'Walisantri' && p.requestedBy === (user?.name || 'Walisantri')) : permissions;
    const isLeaveDisabled = !mobileConfig.allowLeaveRequests && role === 'Walisantri';
    return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {isLeaveDisabled && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold">Pengajuan Izin Kepulangan Santri Mandiri Ditutup</span>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Administrator pesantren sedang menonaktifkan pengajuan izin mandiri melalui aplikasi. Untuk keperluan darurat, silakan hubungi hotline CS di {mobileConfig.supportWhatsapp}.
            </p>
          </div>
        </div>
      )}
      <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama Santri</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Alasan & Durasi</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Detail</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
            {role !== 'Walisantri' && <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Aksi</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {visiblePermissions.filter(p => p.santriName.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
            <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
              <td className="p-4">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  {item.santriName}
                </div>
                <div className="text-xs text-slate-500 mt-1">Oleh: {item.requestedBy}</div>
              </td>
              <td className="p-4">
                <span className="px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                  {item.reason}
                </span>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  {item.dateFrom} - {item.dateTo}
                </div>
              </td>
              <td className="p-4">
                <div className="text-xs text-slate-600 dark:text-slate-400 max-w-[200px] truncate">{item.description}</div>
              </td>
              <td className="p-4">
                <span className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border inline-flex items-center gap-1",
                  item.status === 'Approved' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
                  item.status === 'Rejected' ? "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30" :
                  "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                )}>
                  {item.status}
                </span>
              </td>
              {role !== 'Walisantri' && (
                <td className="p-4 text-right">
                  {item.status === 'Pending' && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleUpdatePermissionStatus(item.id, 'Approved')} className="p-1.5 text-emerald-600 hover:bg-emerald-500/10 rounded-md transition-colors">
                         <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleUpdatePermissionStatus(item.id, 'Rejected')} className="p-1.5 text-red-600 hover:bg-red-500/10 rounded-md transition-colors">
                         <AlertCircle className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
          {visiblePermissions.length === 0 && (
             <tr>
               <td colSpan={role === 'Walisantri' ? 4 : 5} className="p-8 text-center text-slate-500 text-sm">
                 Belum ada pengajuan izin santri.
               </td>
             </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )};

  const handleUpdateTicketStatus = (id: string, newStatus: string) => {
    setTickets(tickets.map(t => t.id === id ? { ...t, status: newStatus } : t));
  };

  const renderHelpdesk = () => {
    const visibleTickets = role === 'Walisantri' ? tickets.filter(t => t.requestedBy === (user?.name || 'Walisantri')) : tickets;
    return (
    <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ticket / Subjek</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kategori</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Detail Laporan</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
            {role !== 'Walisantri' && <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Aksi</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {visibleTickets.filter(t => t.subject.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
            <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
              <td className="p-4 text-sm">
                <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-indigo-500" />
                  {item.subject}
                </div>
                <div className="text-xs text-slate-500 mt-1">Oleh: {item.requestedBy} • {item.date}</div>
              </td>
              <td className="p-4">
                <span className="px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                  {item.category}
                </span>
              </td>
              <td className="p-4">
                <div className="text-xs text-slate-600 dark:text-slate-400 max-w-[250px] truncate">{item.description}</div>
              </td>
              <td className="p-4">
                <span className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border inline-flex items-center gap-1",
                  item.status === 'Resolved' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
                  item.status === 'Closed' ? "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30" :
                  "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                )}>
                  {item.status}
                </span>
              </td>
              {role !== 'Walisantri' && (
                <td className="p-4 text-right">
                  {item.status === 'Open' && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleUpdateTicketStatus(item.id, 'Resolved')} className="p-1.5 text-emerald-600 hover:bg-emerald-500/10 rounded-md transition-colors" title="Tandai Selesai">
                         <CheckCircle2 className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
          {visibleTickets.length === 0 && (
             <tr>
               <td colSpan={role === 'Walisantri' ? 4 : 5} className="p-8 text-center text-slate-500 text-sm">
                 Belum ada tiket bantuan.
               </td>
             </tr>
          )}
        </tbody>
      </table>
    </div>
  )};

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-12">
      {/* URGENT ALERTS BANNER */}
      {role === 'Walisantri' && announcements.filter(a => a.isUrgent && a.target.includes('Wali Santri') && (!user?.name || !a.acknowledgedBy.includes(user.name))).map(urgentAnn => (
        <div key={urgentAnn.id} className="bg-red-500 text-white rounded-xl shadow-xl shadow-red-500/20 overflow-hidden animate-in slide-in-from-top flex flex-col md:flex-row items-center justify-between">
          <div className="p-4 md:p-6 flex gap-4 items-start md:items-center">
            <div className="bg-white/20 p-3 rounded-full shrink-0 animate-pulse">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold uppercase tracking-wider">{urgentAnn.title}</h2>
              <p className="text-red-100 text-sm mt-1 whitespace-pre-wrap">{urgentAnn.content}</p>
            </div>
          </div>
          <div className="p-4 md:p-6 md:border-l border-white/20 w-full md:w-auto flex shrink-0 justify-center">
            <button
              onClick={(e) => handleAcknowledge(urgentAnn.id, e)}
              className="bg-white text-red-600 hover:bg-red-50 px-6 py-3 rounded-xl font-bold text-sm shadow-lg whitespace-nowrap w-full md:w-auto active:scale-95 transition-all"
            >
              Saya Sudah Membaca & Mengerti
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-indigo-500 pb-1 inline-block">Communication Hub</h1>
          <p className="text-slate-500 text-sm mt-2">Centralized messaging, announcements, and parent communication</p>
        </div>

        <div className="flex items-center gap-3">
          {SUPABASE_COMMUNICATION_IMPORT && ['Admin', 'SuperAdmin'].includes(role) && (
            <button
              onClick={() => {
                setIsAnnouncementMigrationOpen(true);
                setAnnouncementMigrationReport(null);
                void runAnnouncementMigration(false);
              }}
              className="flex items-center gap-2 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Preview Impor Pengumuman</span>
            </button>
          )}
          {canCreateInCurrentTab && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">
                {activeTab === 'announcements' ? 'New Announcement' : activeTab === 'messages' ? 'Tulis Pesan (Konsultasi)' : activeTab === 'permissions' ? 'Pengajuan Izin Santri' : activeTab === 'helpdesk' ? 'Buat Tiket Bantuan' : 'New Template'}
              </span>
            </button>
          )}
        </div>
      </div>

      {isAnnouncementMigrationOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="announcement-migration-title" className="glass-panel w-full max-w-2xl overflow-hidden rounded-xl shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/5">
              <div>
                <h2 id="announcement-migration-title" className="font-semibold text-slate-800 dark:text-slate-100">Migrasi Pengumuman Lama</h2>
                <p className="mt-1 text-xs text-slate-500">Preview membaca Firestore tenant ini; apply menyimpan snapshot ke Supabase sekali.</p>
              </div>
              <button type="button" onClick={() => setIsAnnouncementMigrationOpen(false)} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">Tutup</button>
            </header>
            <div className="space-y-4 p-5">
              {announcementMigrationError && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-300">{announcementMigrationError}</div>}
              {isAnnouncementMigrationBusy && <div role="status" className="text-sm text-slate-500">Memeriksa snapshot tenant…</div>}
              {announcementMigrationReport && (
                <>
                  {announcementMigrationReport.ok ? (
                    <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                      Impor selesai: {announcementMigrationReport.imported} baru, {announcementMigrationReport.alreadyImported} sudah pernah diimpor.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><span className="block text-xs text-slate-500">Dibaca</span><strong>{announcementMigrationReport.scanned}</strong></div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><span className="block text-xs text-slate-500">Siap diimpor</span><strong>{announcementMigrationReport.ready}</strong></div>
                    </div>
                  )}
                  {Array.isArray(announcementMigrationReport.blockingIssues) && announcementMigrationReport.blockingIssues.length > 0 && (
                    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-500/30 dark:bg-rose-950/20">
                      <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300">Perlu rekonsiliasi ({announcementMigrationReport.blockingIssues.length})</h3>
                      <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-rose-700 dark:text-rose-200">
                        {announcementMigrationReport.blockingIssues.map((issue: any, index: number) => <li key={`${issue.sourceId}-${index}`}>{issue.sourceId}: {issue.reason}</li>)}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(announcementMigrationReport.warnings) && announcementMigrationReport.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
                      Statistik baca lama yang tidak dapat dikaitkan ke identitas akan disimpan sebagai hitungan agregat, terpisah dari konfirmasi baru. {announcementMigrationReport.warnings.length} record memiliki hitungan agregat.
                    </div>
                  )}
                </>
              )}
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/5">
              <button type="button" disabled={isAnnouncementMigrationBusy} onClick={() => void runAnnouncementMigration(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">Refresh Preview</button>
              <button type="button" disabled={isAnnouncementMigrationBusy || announcementMigrationReport?.canApply !== true || !announcementMigrationReport?.previewFingerprint || announcementMigrationReport?.ok === true} onClick={() => void runAnnouncementMigration(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{isAnnouncementMigrationBusy ? 'Memproses…' : 'Konfirmasi & Impor'}</button>
            </footer>
          </section>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel  rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40 shrink-0">
              <h3 className="font-medium text-slate-800 dark:text-slate-200">
                {activeTab === 'announcements' ? 'Broadcast Announcement' : activeTab === 'messages' ? 'Compose Message' : activeTab === 'permissions' ? 'Formulir Perizinan' : activeTab === 'helpdesk' ? 'Formulir Tiket Bantuan' : 'Create Template'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <form onSubmit={handleAddRecord} className="p-6 space-y-4 overflow-y-auto">
              {activeTab === 'announcements' && supabaseAnnouncementsError && (
                <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-300">{supabaseAnnouncementsError}</div>
              )}
              {activeTab === 'announcements' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Announcement Title</label>
                    <input
                      type="text" required
                      value={formData.title || ''}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Target Audience</label>
                    <select
                      value={formData.target || 'Semua Wali Santri'}
                      onChange={e => setFormData({...formData, target: e.target.value})}
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Semua Wali Santri">Semua Wali Santri</option>
                      <option value="Guru & Musyrif">Guru & Musyrif</option>
                      <option value="Semua Santri">Semua Santri</option>
                      <option value="Wali Santri Kelas VII - A">Wali Santri Kelas VII - A</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="isUrgent"
                      checked={formData.isUrgent || false}
                      onChange={e => setFormData({...formData, isUrgent: e.target.checked})}
                      className="w-4 h-4 text-red-600 bg-slate-100 border-slate-300 rounded focus:ring-red-500 dark:focus:ring-red-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                    />
                    <label htmlFor="isUrgent" className="text-sm font-medium text-red-600 dark:text-red-400">
                      Tandai sebagai Pengumuman Darurat (Wajib dibaca & konfirmasi)
                    </label>
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Message Content</label>
                     <textarea
                        required
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[100px] resize-y"
                     />
                  </div>
                </>
              )}

              {activeTab === 'messages' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Recipient</label>
                    {role === 'Walisantri' ? (
                       <select
                         required
                         value={formData.to || ''}
                         onChange={e => setFormData({...formData, to: e.target.value})}
                         className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                       >
                         <option value="" disabled>Pilih Ustadz / Admin...</option>
                         <option value="Ust. Hidayat Lc. (Wali Kelas VII-A)">Ust. Hidayat Lc. (Wali Kelas VII-A)</option>
                         <option value="Ust. Rahman (Ustadz Asrama)">Ust. Rahman (Ustadz Asrama)</option>
                         <option value="Admin Finance">Admin Keuangan (Info Pembayaran)</option>
                       </select>
                    ) : (
                      <input
                        type="text" required placeholder="Search user or group..."
                        value={formData.to || ''}
                        onChange={e => setFormData({...formData, to: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Message</label>
                     <textarea
                        required
                        value={formData.content || ''}
                        onChange={e => setFormData({...formData, content: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[100px] resize-y"
                     />
                  </div>
                </>
              )}

              {activeTab === 'templates' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Template Name</label>
                    <input
                      type="text" required
                      value={formData.name || ''}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Content (Use brackets for variables e.g. [NAMA])</label>
                     <textarea
                        required
                        value={formData.content || ''}
                        onChange={e => setFormData({...formData, content: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[120px] resize-y"
                     />
                  </div>
                </>
              )}

              {activeTab === 'permissions' && (
                <>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Nama Santri</label>
                     <input
                        type="text" required
                        value={formData.santriName || ''}
                        onChange={e => setFormData({...formData, santriName: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Alasan (Sakit/Izin Pulang dll.)</label>
                     <select
                        required
                        value={formData.reason || 'Sakit'}
                        onChange={e => setFormData({...formData, reason: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                     >
                       <option value="Sakit">Sakit</option>
                       <option value="Izin Pulang">Izin Pulang</option>
                       <option value="Urusan Keluarga">Urusan Keluarga</option>
                       <option value="Lainnya">Lainnya...</option>
                     </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Dari Tanggal</label>
                       <input
                          type="date" required
                          value={formData.dateFrom || ''}
                          onChange={e => setFormData({...formData, dateFrom: e.target.value})}
                          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Sampai Tanggal</label>
                       <input
                          type="date" required
                          value={formData.dateTo || ''}
                          onChange={e => setFormData({...formData, dateTo: e.target.value})}
                          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                       />
                    </div>
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Detail & Keterangan Tambahan</label>
                     <textarea
                        required
                        value={formData.description || ''}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[100px] resize-y"
                     />
                  </div>
                </>
              )}

              {activeTab === 'helpdesk' && (
                <>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Kategori Bantuan</label>
                     <select
                        required
                        value={formData.category || 'Administrasi'}
                        onChange={e => setFormData({...formData, category: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                     >
                       <option value="Administrasi">Administrasi (Data Santri/Perubahan Alamat)</option>
                       <option value="Keuangan">Keuangan (Konfirmasi SPP/Tagihan)</option>
                       <option value="Teknis">Teknis (Lupa Password/Error App)</option>
                       <option value="Lainnya">Lainnya...</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Subjek Kendala</label>
                     <input
                        type="text" required placeholder="Cth: Konfirmasi Error Pembayaran SPP"
                        value={formData.subject || ''}
                        onChange={e => setFormData({...formData, subject: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Deskripsi Detil Laporan</label>
                     <textarea
                        required placeholder="Jelaskan kendala Anda..."
                        value={formData.description || ''}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[100px] resize-y"
                     />
                  </div>
                </>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-white/5 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-white transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={activeTab === 'announcements' && isSavingAnnouncement} className="bg-indigo-600 hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  {activeTab === 'announcements' && isSavingAnnouncement ? 'Menyimpan…' : activeTab === 'announcements' ? 'Publish Target' : activeTab === 'permissions' ? 'Kirim Pengajuan' : activeTab === 'helpdesk' ? 'Buat Tiket' : activeTab === 'messages' ? 'Kirim Pesan' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-white/5 bg-black/40 overflow-x-auto">
          <div className="flex p-2 gap-2 min-w-max">
            {[
              { id: 'announcements', label: 'Announcements', icon: <Megaphone className="w-4 h-4" />, visible: true },
              { id: 'helpdesk', label: 'Helpdesk & Bantuan', icon: <LifeBuoy className="w-4 h-4" />, visible: true },
              { id: 'messages', label: 'Direct Messages', icon: <MessageSquare className="w-4 h-4" />, visible: role !== 'Walisantri' },
              { id: 'permissions', label: 'Sistem Perizinan', icon: <Inbox className="w-4 h-4" />, visible: true },
              { id: 'templates', label: 'Templates', icon: <FileText className="w-4 h-4" />, visible: role !== 'Walisantri' },
            ].filter(t => t.visible).map(tab => (
              <button
                key={tab.id}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn("erp-tab-control",
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative",
                  activeTab === tab.id
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/20 border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2  rounded-lg text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-80 bg-slate-50 dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300"
              />
            </div>
            <button className="p-2  rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center gap-2 transition-colors">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">Filter</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {activeTab === 'announcements' && (role === 'Walisantri' ? renderWalisantriAnnouncements() : renderAnnouncements())}
          {activeTab === 'messages' && renderMessages()}
          {activeTab === 'helpdesk' && renderHelpdesk()}
          {activeTab === 'permissions' && renderPermissions()}
          {activeTab === 'templates' && renderTemplates()}
        </div>
      </div>
    </div>
  );
}
