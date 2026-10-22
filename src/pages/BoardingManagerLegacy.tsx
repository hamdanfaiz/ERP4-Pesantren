import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Key,
  Users,
  AlertCircle,
  FileText,
  CheckCircle2,
  Search,
  Filter,
  Plus,
  Home,
  Shield,
  History,
  MapPin,
  Download,
  CheckSquare,
  ClipboardCheck,
  Camera,
  Wrench,
  MessageCircle,
  Link2,
  UserPlus,
  UserMinus,
  Sparkles,
  Info,
  X,
  Phone,
  BedDouble
} from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MOCK_SANTRI } from '../data/mockRecords';
import { useAuth } from '../contexts/AuthContext';
import { useTenantOperationalCollection } from '../firebaseUtils';
import { useCentralStructure } from '../hooks/useCentralStructure';
import { CentralSyncBadge } from '../components/CentralSyncBadge';

type Tab = 'rooms' | 'permits' | 'discipline' | 'musyrif' | 'attendance' | 'audits' | 'tickets';

const STATS_DATA = [
  { name: 'Mon', ringan: 4, sedang: 1, berat: 0 },
  { name: 'Tue', ringan: 3, sedang: 2, berat: 1 },
  { name: 'Wed', ringan: 5, sedang: 0, berat: 0 },
  { name: 'Thu', ringan: 2, sedang: 1, berat: 0 },
  { name: 'Fri', ringan: 6, sedang: 3, berat: 2 },
  { name: 'Sat', ringan: 8, sedang: 2, berat: 1 },
  { name: 'Sun', ringan: 1, sedang: 0, berat: 0 },
];

export function BoardingManager() {
  const { role, user } = useAuth();

  // Rekomendasi 5: Centralized Structure Relations from Master Data
  const {
    rooms: centralRooms,
    buildings: centralBuildings,
    teachers: centralTeachers,
    santriList: centralSantriList,
    unassignedSantri: centralUnassignedSantri,
    getStudentsByRoom,
    autoAllocateRooms: centralAutoAllocateRooms,
    assignSantriToRoom: centralAssignSantriToRoom,
    removeSantriFromRoom: centralRemoveSantriFromRoom,
  } = useCentralStructure();

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedRoomDetail, setSelectedRoomDetail] = useState<any | null>(null);
  const [selectedSantriToAssign, setSelectedSantriToAssign] = useState<string>('');

  const canAddPermit = ['SuperAdmin', 'Admin', 'Santri', 'Walisantri'].includes(role);
  const canAddDiscipline = ['SuperAdmin', 'Admin', 'Ustadz'].includes(role);
  const canPerformActions = ['SuperAdmin', 'Admin', 'Ustadz'].includes(role);
  const canManageRooms = ['SuperAdmin', 'Admin'].includes(role);
  const canExportReports = ['SuperAdmin', 'Admin'].includes(role);

  const boardingStaffTenantId = ['SuperAdmin', 'Admin', 'Ustadz'].includes(role) ? user?.tenantId : null;
  const musyrifsStore = useTenantOperationalCollection<any>('boarding_musyrifs', boardingStaffTenantId);
  const musyrifs = musyrifsStore.records;
  const setMusyrifs = musyrifsStore.setRecords;

  const MOCK_LOGGED_IN_USTADZ = 'Ust. Fulan';
  const currentUstadzZone = musyrifs.find(m => m.name === MOCK_LOGGED_IN_USTADZ)?.assignedBuilding;

  const loggedInSantriName = user?.linkedSantriName;
  const loggedInSantriRoom = user?.linkedSantriRoom;

  const MOCK_LOGGED_IN_SANTRI = loggedInSantriName || 'Abdullah Al-Fatih';
  const MOCK_LOGGED_IN_SANTRI_ROOM = loggedInSantriRoom || 'R101';

  const attendanceStore = useTenantOperationalCollection<any>('boarding_attendance', boardingStaffTenantId);
  const attendance = attendanceStore.records;
  const setAttendance = attendanceStore.setRecords;

  const auditsStore = useTenantOperationalCollection<any>('boarding_audits', boardingStaffTenantId);
  const audits = auditsStore.records;
  const setAudits = auditsStore.setRecords;

  const ticketsStore = useTenantOperationalCollection<any>('boarding_tickets', boardingStaffTenantId);
  const tickets = ticketsStore.records;
  const setTickets = ticketsStore.setRecords;

  // Master Data is the source of truth for santri who have not been assigned to a room.
  const unassignedSantri = centralUnassignedSantri || [];

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    if (activeTab === 'permits') {
      csvContent += "ID,Santri Name,Room,Type,Reason,Start Date,End Date,Status\n";
      permits.forEach(p => {
        csvContent += `${p.id},${p.santriName},${p.room},${p.type},${p.reason},${p.startDate},${p.endDate},${p.status}\n`;
      });
    } else if (activeTab === 'discipline') {
      csvContent += "ID,Santri Name,Room,Offense,Category,Points,Date,Resolved\n";
      discipline.forEach(d => {
        csvContent += `${d.id},${d.santriName},${d.room},${d.offense},${d.category},${d.points},${d.date},${d.resolved ? 'Yes' : 'No'}\n`;
      });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeTab}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Rekomendasi 5: Centralized Auto-Assign algorithm with in-app feedback (Zero window.alert)
  const handleAutoAssign = async () => {
    if (unassignedSantri.length === 0) {
      setToast({ message: 'Semua santri telah memiliki alokasi kamar asrama di Master Data.', type: 'info' });
      return;
    }
    try {
      const result = await centralAutoAllocateRooms();
      setToast({ message: `✅ ${result.message}`, type: 'success' });
    } catch (e) {
      setToast({ message: 'Gagal melakukan alokasi otomatis.', type: 'error' });
    }
  };

  const roomsStore = useTenantOperationalCollection<any>('boarding_rooms', user?.tenantId);
  const localRooms = roomsStore.records;
  const setLocalRooms = roomsStore.setRecords;

  // Rekomendasi 5: Dynamically merge Master Data Kamar & calculate occupancy from actual Central Santri
  const rooms = useMemo(() => {
    const combined = [...localRooms];
    // Add central rooms from Master Data if not already present
    for (const cRoom of centralRooms) {
      const existsIndex = combined.findIndex(r => r.id === cRoom.id || r.name === cRoom.name);
      const occupants = getStudentsByRoom(cRoom.id);
      const cap = typeof cRoom.capacity === 'number' ? cRoom.capacity : parseInt(cRoom.capacity as string) || 6;
      const formattedRoom = {
        id: cRoom.id,
        name: cRoom.name,
        building: cRoom.building || cRoom.location || 'Asrama Umar',
        capacity: cap,
        occupied: occupants.length,
        musyrif: cRoom.musyrif || 'Ust. Fulan',
        facilities: cRoom.facilities || { beds: cap, lockers: cap, ac: 'Good' },
        isCentralMaster: true,
      };

      if (existsIndex >= 0) {
        combined[existsIndex] = { ...combined[existsIndex], ...formattedRoom };
      } else {
        combined.push(formattedRoom);
      }
    }
    return combined;
  }, [localRooms, centralRooms, getStudentsByRoom]);

  const permitsStore = useTenantOperationalCollection<any>('boarding_permits', user?.tenantId, ['SuperAdmin', 'Admin', 'Ustadz'].includes(role) ? null : user?.uid);
  const permits = permitsStore.records;
  const setPermits = permitsStore.setRecords;

  const disciplineStore = useTenantOperationalCollection<any>('boarding_discipline', boardingStaffTenantId);
  const discipline = disciplineStore.records;
  const setDiscipline = disciplineStore.setRecords;



  const [activeTab, setActiveTab] = useState<Tab>('rooms');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const filteredRooms = role === 'Ustadz' ? rooms.filter(r => r.building === currentUstadzZone)
                      : ['Santri', 'Walisantri'].includes(role) ? rooms.filter(r => r.id === MOCK_LOGGED_IN_SANTRI_ROOM)
                      : rooms;
  const filteredRoomIds = filteredRooms.map(r => r.id);

  const filteredPermits = role === 'Ustadz' ? permits.filter(p => filteredRoomIds.includes(p.room))
                        : ['Santri', 'Walisantri'].includes(role) ? permits.filter(p => p.santriName === MOCK_LOGGED_IN_SANTRI)
                        : permits;
  const filteredDiscipline = role === 'Ustadz' ? discipline.filter(d => filteredRoomIds.includes(d.room))
                           : ['Santri', 'Walisantri'].includes(role) ? discipline.filter(d => d.santriName === MOCK_LOGGED_IN_SANTRI)
                           : discipline;
  const filteredAttendance = role === 'Ustadz' ? attendance.filter(a => filteredRoomIds.includes(a.room))
                           : ['Santri', 'Walisantri'].includes(role) ? attendance.filter(a => a.santriName === MOCK_LOGGED_IN_SANTRI)
                           : attendance;
  const filteredAudits = role === 'Ustadz' ? audits.filter(a => filteredRoomIds.includes(a.room))
                       : ['Santri', 'Walisantri'].includes(role) ? audits.filter(a => a.room === MOCK_LOGGED_IN_SANTRI_ROOM)
                       : audits;
  const filteredTickets = role === 'Ustadz' ? tickets.filter(t => filteredRoomIds.includes(t.room))
                        : ['Santri', 'Walisantri'].includes(role) ? tickets.filter(t => t.room === MOCK_LOGGED_IN_SANTRI_ROOM)
                        : tickets;

  const handleAddRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'permits') {
      const newPermit = {
        id: generateUniqueId('Permit', permits),
        santriName: formData.santriName || 'Unknown',
        room: formData.room || 'Unknown',
        type: formData.type || 'Keluar Area',
        reason: formData.reason || '-',
        startDate: formData.startDate || new Date().toISOString().split('T')[0],
        endDate: formData.endDate || new Date().toISOString().split('T')[0],
        status: 'Pending Musyrif'
      };
      setPermits([newPermit, ...permits]);
      if (role === 'Santri') {
        setToast({ message: "Permit requested successfully. A notification has been sent to your Musyrif for approval.", type: 'success' });
      } else if (role === 'Walisantri') {
        setToast({ message: "Parental Leave Permit requested successfully. A notification has been sent to your child's Musyrif for approval.", type: 'success' });
      } else {
        setToast({ message: "Permit berhasil dicatat.", type: 'success' });
      }
    } else if (activeTab === 'discipline') {
      const newIncident = {
        id: generateUniqueId('Discipline', discipline),
        santriName: formData.santriName || 'Unknown',
        room: formData.room || 'Unknown',
        offense: formData.offense || '-',
        category: formData.category || 'Ringan',
        points: parseInt(formData.points) || 0,
        date: formData.date || new Date().toISOString().split('T')[0],
        resolved: false,
        photoUrl: formData.photoUrl || null,
        resolution: formData.resolution || ''
      };
      setDiscipline([newIncident, ...discipline]);
    } else if (activeTab === 'rooms') {
      const newRoom = {
        id: generateUniqueId('Room', rooms),
        name: formData.name || 'Unknown',
        building: formData.building || 'Unknown',
        capacity: parseInt(formData.capacity) || 1,
        occupied: 0,
        musyrif: formData.musyrif || 'Unknown',
        facilities: {
          beds: parseInt(formData.beds) || 0,
          lockers: parseInt(formData.lockers) || 0,
          ac: formData.ac || 'Good'
        }
      };
      setLocalRooms([newRoom, ...localRooms]);
    } else if (activeTab === 'musyrif') {
      const newMusyrif = {
        id: generateUniqueId('Musyrif', musyrifs),
        name: formData.name || 'Unknown',
        assignedBuilding: formData.assignedBuilding || 'Unknown',
        phone: formData.phone || '+6281234567894'
      };
      setMusyrifs([newMusyrif, ...musyrifs]);
    } else if (activeTab === 'audits') {
      const newAudit = {
        id: generateUniqueId('Audit', audits),
        room: formData.room || 'Unknown',
        date: formData.date || new Date().toISOString().split('T')[0],
        score: parseInt(formData.score) || 0,
        notes: formData.notes || '',
        inspector: role === 'Ustadz' ? MOCK_LOGGED_IN_USTADZ : 'Admin'
      };
      setAudits([newAudit, ...audits]);
    } else if (activeTab === 'tickets') {
      const newTicket = {
        id: generateUniqueId('Ticket', tickets),
        room: formData.room || 'Unknown',
        issue: formData.issue || '-',
        description: formData.description || '',
        priority: formData.priority || 'Medium',
        status: 'Open',
        reportedBy: role === 'Santri' ? MOCK_LOGGED_IN_SANTRI : MOCK_LOGGED_IN_USTADZ,
        date: new Date().toISOString().split('T')[0]
      };
      setTickets([newTicket, ...tickets]);
    }
    setIsModalOpen(false);
    setFormData({});
  };

  const renderRooms = () => {
    const childRoom = rooms.find(r => r.id === MOCK_LOGGED_IN_SANTRI_ROOM);
    const roomMusyrifInfo = childRoom ? musyrifs.find(m => m.name === childRoom.musyrif) : null;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {role === 'Walisantri' && roomMusyrifInfo && childRoom && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-2">
            <div className="lg:col-span-2 bg-gradient-to-r from-emerald-950/20 to-indigo-950/20 border border-emerald-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-lg backdrop-blur-md">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-full font-sans uppercase tracking-wider">
                  👨‍👦 Detail Asrama & Musyrif Anak
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                    Kartu Kontak Pembina (Musyrif)
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Musyrif bertanggung jawab mendampingi anak Anda di kamar, memantau tata tertib, jadwal harian, serta kebutuhan asrama lainnya.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-2">
                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Nama Lengkap Anak</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{MOCK_LOGGED_IN_SANTRI}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <Home className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Kamar & Gedung</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{childRoom.name} ({childRoom.building})</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Musyrif Pendamping</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{roomMusyrifInfo.name}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Nomor WhatsApp</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 font-mono">{roomMusyrifInfo.phone}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex flex-col gap-2.5 w-full md:w-auto">
                <a
                  href={`https://wa.me/${roomMusyrifInfo.phone.replace(/[^0-9]/g, '')}?text=Assalamualaikum%20${encodeURIComponent(roomMusyrifInfo.name)}%2C%20saya%20orang%20tua%20dari%20${encodeURIComponent(MOCK_LOGGED_IN_SANTRI)}%20ingin%20berkonsultasi%20mengenai%20kondisi%20dan%20perkembangan%20anak%20saya...`}
                  target="_blank"
                  referrerPolicy="no-referrer"
                  rel="noreferrer"
                  className="w-full md:w-auto px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm flex items-center justify-center gap-2 border border-emerald-500/30 hover:border-emerald-400 shadow-md transition-all duration-300 pointer-events-auto"
                >
                  <MessageCircle className="w-5 h-5 fill-white/10" />
                  Hubungi Musyrif (WA)
                </a>
                <div className="text-[10px] text-slate-500 text-center md:text-left">
                  Siap dihubungi oleh Orang Tua Wali
                </div>
              </div>
            </div>

            <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 flex flex-col justify-between shadow-lg">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Keadaan Fasilitas Kamar</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Laporan inventaris berkala asrama {childRoom.building}. Pembina kamar selalu memastikan kenyamanan istirahat belajar santri harian.
                </p>
              </div>
              <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 space-y-1.5 mt-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Kondisi Fasilitas</span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Tempat Tidur</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">Lengkap ({childRoom.facilities.beds}/{childRoom.capacity})</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Pendingin Ruangan (AC)</span>
                  <span className={cn(
                    "font-medium",
                    childRoom.facilities.ac === 'Good' ? "text-emerald-500" : "text-amber-500"
                  )}>{childRoom.facilities.ac}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredRooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.building.toLowerCase().includes(searchQuery.toLowerCase())).map(room => {
            const roomOccupants = getStudentsByRoom(room.id);
            const actualOccupied = roomOccupants.length > 0 ? roomOccupants.length : room.occupied;

            return (
              <div
                key={room.id}
                onClick={() => setSelectedRoomDetail({ ...room, occupied: actualOccupied })}
                className="bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl hover:border-emerald-500/40 hover:bg-slate-900/60 transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-slate-800 dark:text-slate-200 font-semibold group-hover:text-emerald-400 transition-colors">
                        {room.name}
                      </h3>
                      {room.isCentralMaster && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 font-mono" title="Tersinkronisasi dari Master Data">
                          Master
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {room.building}
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-md font-medium font-mono",
                    actualOccupied >= room.capacity
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  )}>
                    {actualOccupied}/{room.capacity}
                  </span>
                </div>

                <div className="space-y-3 mt-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 text-xs">Musyrif</span>
                    <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{room.musyrif}</span>
                  </div>

                  {roomOccupants.length > 0 ? (
                    <div className="pt-2 border-t border-white/5">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1 flex items-center justify-between">
                        <span>Penghuni Santri</span>
                        <span className="text-emerald-400 font-mono">{roomOccupants.length} Santri</span>
                      </div>
                      <div className="flex -space-x-1.5 overflow-hidden py-1">
                        {roomOccupants.slice(0, 4).map((s, idx) => (
                          <div
                            key={s.id || idx}
                            className="w-6 h-6 rounded-full bg-indigo-600/80 border border-slate-900 flex items-center justify-center text-[10px] text-white font-bold"
                            title={`${s.name} (${s.grade || 'Santri'})`}
                          >
                            {s.name.charAt(0)}
                          </div>
                        ))}
                        {roomOccupants.length > 4 && (
                          <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-900 flex items-center justify-center text-[9px] text-slate-300 font-mono">
                            +{roomOccupants.length - 4}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic py-1">
                      Belum ada santri teralokasi
                    </div>
                  )}

                  {room.facilities && (
                    <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-2.5 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400 text-[11px]">Beds / Kasur</span>
                        <span className="text-slate-800 dark:text-slate-200 font-mono text-[11px]">{room.facilities.beds}/{room.capacity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400 text-[11px]">AC / Ventilasi</span>
                        <span className={cn(
                          "font-medium text-[11px]",
                          room.facilities.ac === 'Good' ? "text-emerald-500" :
                          room.facilities.ac === 'Broken' ? "text-red-500" : "text-amber-500"
                        )}>{room.facilities.ac}</span>
                      </div>
                    </div>
                  )}

                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                    <div
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        actualOccupied >= room.capacity ? "bg-amber-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.min(100, (actualOccupied / room.capacity) * 100)}%` }}
                    />
                  </div>

                  <div className="pt-1 text-center">
                    <span className="text-[10px] text-indigo-400 group-hover:underline font-medium">
                      Kelola Penghuni & Alokasi &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPermits = () => (
    <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Santri</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type / Reason</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duration</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
            <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {filteredPermits.filter(p => p.santriName.toLowerCase().includes(searchQuery.toLowerCase())).map(permit => (
            <tr key={permit.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="p-4">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{permit.santriName}</div>
                <div className="text-xs text-slate-500">Room: {permit.room}</div>
              </td>
              <td className="p-4">
                <div className="text-sm text-slate-700 dark:text-slate-300">{permit.type}</div>
                <div className="text-xs text-slate-500 truncate max-w-xs">{permit.reason}</div>
              </td>
              <td className="p-4">
                <div className="text-sm text-slate-700 dark:text-slate-300 font-mono">{permit.startDate}</div>
                <div className="text-xs text-slate-500">to {permit.endDate}</div>
              </td>
              <td className="p-4">
                <span className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border",
                  permit.status === 'Approved' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                  permit.status.includes('Pending') ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                  permit.status === 'Active' ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                  permit.status === 'Returned' ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                  "bg-red-500/20 text-red-400 border-red-500/30"
                )}>
                  {permit.status}
                </span>
              </td>
              <td className="p-4 text-right space-x-2">
                {permit.status.includes('Pending') && canPerformActions && (
                  <>
                     <button
                       onClick={() => setPermits(prev => prev.map(p => p.id === permit.id ? { ...p, status: permit.status === 'Pending Musyrif' ? 'Pending Keamanan' : 'Approved' } : p))}
                       className="p-1.5 text-emerald-400 hover:bg-emerald-950/30 rounded-md transition-colors"
                       title="Approve / Forward"
                     >
                       <CheckCircle2 className="w-4 h-4" />
                     </button>
                     <button
                       onClick={() => setPermits(prev => prev.map(p => p.id === permit.id ? { ...p, status: 'Rejected' } : p))}
                       className="p-1.5 text-red-400 hover:bg-red-950/30 rounded-md transition-colors"
                       title="Reject"
                     >
                       <AlertCircle className="w-4 h-4" />
                     </button>
                  </>
                )}
                {permit.status === 'Approved' && (['Admin', 'SuperAdmin', 'Security'].includes(role) || canPerformActions) && (
                   <button
                     onClick={() => setPermits(prev => prev.map(p => p.id === permit.id ? { ...p, status: 'Active' } : p))}
                     className="px-2 py-1 text-[10px] uppercase font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-md transition-colors"
                     title="Mark as Checked Out (Active)"
                   >
                     Checkout
                   </button>
                )}
                {permit.status === 'Active' && (['Admin', 'SuperAdmin', 'Security'].includes(role) || canPerformActions) && (
                   <button
                     onClick={() => setPermits(prev => prev.map(p => p.id === permit.id ? { ...p, status: 'Returned' } : p))}
                     className="px-2 py-1 text-[10px] uppercase font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 rounded-md transition-colors"
                     title="Mark as Returned"
                   >
                     Return
                   </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderDiscipline = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Chart Section */}
      <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-6 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          Weekly Incident Trends
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={STATS_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: '#0f1115', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#cbd5e1' }}
              />
              <Bar dataKey="ringan" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} name="Ringan" />
              <Bar dataKey="sedang" stackId="a" fill="#f59e0b" name="Sedang" />
              <Bar dataKey="berat" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} name="Berat" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Santri</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Offense</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Points</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredDiscipline.filter(d => d.santriName.toLowerCase().includes(searchQuery.toLowerCase())).map(incident => {
              const totalPoints = discipline.filter(d => d.santriName === incident.santriName).reduce((sum, d) => sum + d.points, 0);
              const spLevel = totalPoints >= 100 ? 'SP 3' : totalPoints >= 60 ? 'SP 2' : totalPoints >= 30 ? 'SP 1' : null;

              return (
              <tr key={incident.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{incident.santriName}</div>
                  <div className="text-xs text-slate-500">Room: {incident.room}</div>
                  {spLevel && (
                    <div className="mt-1 inline-flex px-1.5 py-0.5 rounded-sm text-[9px] uppercase font-bold bg-red-500/20 text-red-500 border border-red-500/30">
                      {spLevel} (Total: {totalPoints})
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <div className="text-sm text-slate-700 dark:text-slate-300">{incident.offense}</div>
                  {incident.photoUrl && (
                    <div className="mt-2 text-xs flex items-center gap-1 text-slate-500">
                       <a href={incident.photoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-indigo-400">
                         <Camera className="w-3.5 h-3.5" />
                         Evidence
                       </a>
                    </div>
                  )}
                  <div className={cn(
                    "text-[10px] uppercase font-bold tracking-wider mt-1",
                    incident.category === 'Ringan' ? "text-emerald-400" :
                    incident.category === 'Sedang' ? "text-amber-400" : "text-red-400"
                  )}>{incident.category}</div>
                  {incident.resolution && (
                    <div className="mt-1 text-xs text-indigo-400 font-medium">
                      Action Plan: {incident.resolution}
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <div className="text-sm font-mono text-red-400">+{incident.points} pts</div>
                </td>
                <td className="p-4 text-sm text-slate-500 dark:text-slate-400 font-mono">
                  {incident.date}
                </td>
                <td className="p-4">
                  {canPerformActions ? (
                    <button
                      onClick={() => {
                        if (!incident.resolved) {
                          setDiscipline(prev => prev.map(d => d.id === incident.id ? { ...d, resolved: true } : d));
                        }
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border transition-colors",
                        incident.resolved ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 cursor-default" : "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30 cursor-pointer"
                      )}
                      title={!incident.resolved ? "Mark as Resolved" : undefined}
                    >
                      {incident.resolved ? 'Resolved' : 'Active'}
                    </button>
                  ) : (
                    <span className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border",
                      incident.resolved ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    )}>
                      {incident.resolved ? 'Resolved' : 'Active'}
                    </span>
                  )}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderMusyrifs = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          Musyrif Assignments
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {musyrifs.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(musyrif => (
          <div key={musyrif.id} className="bg-slate-100 dark:bg-white/5 p-4 rounded-lg flex flex-col gap-2 border border-slate-200 dark:border-white/10">
            <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{musyrif.name}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
              <Building2 className="w-3.5 h-3.5" />
              {musyrif.assignedBuilding}
            </div>
            <button
              onClick={() => {
                const newBldg = prompt("Assign new building to " + musyrif.name, musyrif.assignedBuilding);
                if (newBldg) setMusyrifs(prev => prev.map(m => m.id === musyrif.id ? { ...m, assignedBuilding: newBldg } : m));
              }}
              className="mt-3 text-xs w-max text-indigo-500 hover:text-indigo-400 font-medium"
            >
              Reassign Zone
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAttendance = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Curfew Nightly Attendance</h3>
        <div className="text-xs text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="p-4 text-xs font-medium text-slate-500 uppercase">Santri Name</th>
              <th className="p-4 text-xs font-medium text-slate-500 uppercase">Room</th>
              <th className="p-4 text-xs font-medium text-slate-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredAttendance.filter(a => a.santriName.toLowerCase().includes(searchQuery.toLowerCase())).map(record => (
              <tr key={record.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{record.santriName}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm text-slate-600 dark:text-slate-400">{record.room}</div>
                </td>
                <td className="p-4">
                  <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-1 w-max">
                    <button
                      disabled={!canPerformActions}
                      onClick={() => setAttendance(prev => prev.map(a => a.id === record.id ? { ...a, status: 'Hadir' } : a))}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                        record.status === 'Hadir' ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                        !canPerformActions && "cursor-default opacity-80"
                      )}
                    >
                      Hadir
                    </button>
                    <button
                      disabled={!canPerformActions}
                      onClick={() => setAttendance(prev => prev.map(a => a.id === record.id ? { ...a, status: 'Ghaib' } : a))}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                        record.status === 'Ghaib' ? "bg-red-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                        !canPerformActions && "cursor-default opacity-80"
                      )}
                    >
                      Ghaib
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredAttendance.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-500">No attendance records found for your assigned zones.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAudits = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Room</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Score</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Notes & Inspector</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredAudits.filter(a => a.room.toLowerCase().includes(searchQuery.toLowerCase())).map(audit => (
              <tr key={audit.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="text-sm text-slate-600 dark:text-slate-400 font-mono">{audit.date}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{audit.room}</div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-md font-medium font-mono border",
                      audit.score >= 90 ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" :
                      audit.score >= 75 ? "bg-amber-500/20 text-amber-500 border-amber-500/30" : "bg-red-500/20 text-red-500 border-red-500/30"
                    )}>{audit.score}/100</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1">{audit.notes || '-'}</div>
                  <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">By: {audit.inspector}</div>
                </td>
              </tr>
            ))}
            {filteredAudits.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">No cleanliness audits found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTickets = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date & Reporter</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Room</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Issue</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status & Priority</th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredTickets.filter(t => t.room.toLowerCase().includes(searchQuery.toLowerCase()) || t.issue.toLowerCase().includes(searchQuery.toLowerCase())).map(ticket => (
              <tr key={ticket.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{ticket.date}</div>
                  <div className="text-xs text-slate-500">{ticket.reportedBy}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{ticket.room}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm text-slate-800 dark:text-slate-200">{ticket.issue}</div>
                  <div className="text-xs text-slate-500 line-clamp-1">{ticket.description || '-'}</div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col items-start gap-1">
                    <span className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border",
                      ticket.status === 'Resolved' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    )}>
                      {ticket.status}
                    </span>
                    <span className={cn(
                      "text-[9px] uppercase font-bold tracking-wider",
                      ticket.priority === 'Urgent' ? "text-red-500" :
                      ticket.priority === 'High' ? "text-orange-500" :
                      ticket.priority === 'Low' ? "text-slate-500" : "text-blue-500"
                    )}>
                      {ticket.priority} Priority
                    </span>
                  </div>
                </td>
                <td className="p-4 text-right">
                  {ticket.status === 'Open' && canPerformActions && (
                    <button
                      onClick={() => setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: 'Resolved' } : t))}
                      className="p-1.5 text-emerald-400 hover:bg-emerald-950/30 rounded-md transition-colors"
                      title="Mark as Resolved"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredTickets.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">No maintenance tickets found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 border-b border-indigo-500 pb-1 inline-block">
              Boarding Management
            </h1>
            <CentralSyncBadge moduleName="Asrama" />
          </div>
          <p className="text-slate-500 text-sm mt-2">
            Pusat kendali Asrama, Perizinan, dan Kedisiplinan &mdash; Terintegrasi penuh dengan Master Data
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(activeTab === 'permits' || activeTab === 'discipline') && canExportReports && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-slate-700/50 text-slate-300 border border-slate-600/50 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}
          {activeTab === 'rooms' && canManageRooms && unassignedSantri.length > 0 && (
            <button
              onClick={handleAutoAssign}
              className="flex items-center gap-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-600/30 transition-colors"
              title="Alokasikan otomatis santri tanpa kamar berdasarkan kuota kamar kosong"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Auto-Assign ({unassignedSantri.length} Santri)</span>
            </button>
          )}
          {((activeTab === 'permits' && canAddPermit) || (activeTab === 'discipline' && canAddDiscipline) || (activeTab === 'rooms' && canManageRooms) || activeTab === 'musyrif' || activeTab === 'audits' || activeTab === 'tickets') && (
            <button
              onClick={() => {
                setIsModalOpen(true);
                if (['Santri', 'Walisantri'].includes(role)) {
                  setFormData({ santriName: MOCK_LOGGED_IN_SANTRI, room: MOCK_LOGGED_IN_SANTRI_ROOM });
                }
              }}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-indigo-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Record</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-time Severe "Berat" Incident Alert for Walisantri */}
      {role === 'Walisantri' && (() => {
        const activeHeavyIncident = discipline.find(
          d => d.santriName === MOCK_LOGGED_IN_SANTRI && d.category === 'Berat' && !d.resolved
        );
        if (!activeHeavyIncident) return null;

        // Find Musyrif to offer direct chat action
        const childRoomObj = rooms.find(r => r.id === MOCK_LOGGED_IN_SANTRI_ROOM);
        const musyrifObj = childRoomObj ? musyrifs.find(m => m.name === childRoomObj.musyrif) : null;

        return (
          <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden animate-in fade-in duration-500">
            <div className="absolute top-0 right-0 p-3 text-red-500/20 font-mono text-7xl font-bold select-none pointer-events-none">
              ALERT
            </div>
            <div className="flex flex-col md:flex-row items-start justify-between gap-6 relative z-10">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold rounded-full uppercase tracking-wider">
                  ⚠️ Peringatan Kedisiplinan Berat (Heavy Alert)
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Laporan Pelanggaran Berat Terbuka
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                  Telah dicatat adanya tindakan indisipliner kategori <span className="font-bold text-red-400">Berat</span> atas nama putra Anda, <strong>{activeHeavyIncident.santriName}</strong> (Kamar {activeHeavyIncident.room}). Mohon segera perhatikan detail laporan berikut dan ikuti rencana tindak lanjut pembinaan asrama.
                </p>

                <div className="bg-black/30 rounded-xl p-4 border border-red-500/15 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Jenis Pelanggaran</span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{activeHeavyIncident.offense}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Tanggal Kejadian</span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 font-mono">{activeHeavyIncident.date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Sanksi Poin</span>
                    <span className="text-sm font-semibold text-red-405 text-red-400 font-mono">+{activeHeavyIncident.points} Poin</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Status Tindakan</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      DALAM PROSES
                    </span>
                  </div>
                </div>

                {activeHeavyIncident.resolution && (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mt-3">
                    <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 block mb-1">📋 Rencana Tindak Lanjut & Resolusi (Corrective Action)</span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold italic">
                      &ldquo;{activeHeavyIncident.resolution}&rdquo;
                    </p>
                  </div>
                )}
              </div>

              {musyrifObj && (
                <div className="shrink-0 w-full md:w-auto bg-slate-100 dark:bg-white/5 border border-white/5 p-4 rounded-xl flex flex-col gap-3">
                  <div className="text-xs text-slate-500">
                    Sangat disarankan segera berkonsultasi dengan pembina kamar anak Anda:
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 text-sm font-bold">
                      {musyrifObj.name.substring(0, 4)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{musyrifObj.name}</div>
                      <div className="text-[11px] text-slate-500">Musyrif Kamar {activeHeavyIncident.room}</div>
                    </div>
                  </div>
                  <a
                    href={`https://wa.me/${musyrifObj.phone.replace(/[^0-9]/g, '')}?text=Assalamualaikum%20${encodeURIComponent(musyrifObj.name)}%2C%20saya%20orang%20tua%20dari%20${encodeURIComponent(activeHeavyIncident.santriName)}%20ingin%20berdiskusi%20mengenai%20laporan%20kedisiplinan%20berat%20anak%20saya%20yang%20dicatat%20pada%20tanggal%20${encodeURIComponent(activeHeavyIncident.date)}.`}
                    target="_blank"
                    referrerPolicy="no-referrer"
                    rel="noreferrer"
                    className="w-full text-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all"
                  >
                    <MessageCircle className="w-4 h-4 fill-white/10" />
                    Hubungi Pembina (WhatsApp)
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel  rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40 shrink-0">
              <h3 className="font-medium text-slate-800 dark:text-slate-200">
                {activeTab === 'permits' ? 'Add Permit' : activeTab === 'discipline' ? 'Add Incident' : activeTab === 'rooms' ? 'Add Room' : activeTab === 'musyrif' ? 'Add Musyrif' : activeTab === 'audits' ? 'Add Audit' : 'Add Ticket'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x w-5 h-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <form onSubmit={handleAddRecord} className="p-6 space-y-4 overflow-y-auto">
              {activeTab === 'rooms' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Room Name / ID</label>
                    <input
                      type="text" required
                      value={formData.name || ''}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Building (Gedung/Asrama)</label>
                    <input
                      type="text" required
                      value={formData.building || ''}
                      onChange={e => setFormData({...formData, building: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Capacity</label>
                      <input
                        type="number" required min="1"
                        value={formData.capacity || ''}
                        onChange={e => setFormData({...formData, capacity: e.target.value})}
                        className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Musyrif (Supervisor)</label>
                      <input
                        type="text" required
                        value={formData.musyrif || ''}
                        onChange={e => setFormData({...formData, musyrif: e.target.value})}
                        className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-white/5 space-y-4">
                    <div className="text-xs font-medium text-slate-500 uppercase">Facilities & Inventory</div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Beds</label>
                        <input
                          type="number" required min="0"
                          value={formData.beds || ''}
                          onChange={e => setFormData({...formData, beds: e.target.value})}
                          className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Lockers</label>
                        <input
                          type="number" required min="0"
                          value={formData.lockers || ''}
                          onChange={e => setFormData({...formData, lockers: e.target.value})}
                          className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">AC / Fan</label>
                        <select
                          value={formData.ac || 'Good'}
                          onChange={e => setFormData({...formData, ac: e.target.value})}
                          className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="Good">Good</option>
                          <option value="Maintenance">Maintenance</option>
                          <option value="Broken">Broken</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              ) : activeTab === 'musyrif' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Musyrif Name</label>
                    <input
                      type="text" required
                      value={formData.name || ''}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Assigned Building (Zone)</label>
                    <input
                      type="text" required
                      value={formData.assignedBuilding || ''}
                      onChange={e => setFormData({...formData, assignedBuilding: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">WhatsApp Number (e.g. +6281234567890)</label>
                    <input
                      type="text" required placeholder="+628..."
                      value={formData.phone || ''}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              ) : activeTab === 'audits' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Room ID target</label>
                    <select
                      required
                      value={formData.room || ''}
                      onChange={e => setFormData({...formData, room: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="" disabled>Select Room</option>
                      {filteredRoomIds.map(id => <option key={id} value={id}>{id}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Cleanliness Score (0-100)</label>
                    <input
                      type="number" required min="0" max="100"
                      value={formData.score || ''}
                      onChange={e => setFormData({...formData, score: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Notes (Optional)</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 h-20 resize-none"
                    />
                  </div>
                </>
              ) : activeTab === 'tickets' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Room</label>
                    <select
                      required
                      value={formData.room || ''}
                      onChange={e => setFormData({...formData, room: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="" disabled>Select Room</option>
                      {filteredRoomIds.map(id => <option key={id} value={id}>{id}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Issue Title</label>
                    <input
                      type="text" required placeholder="e.g. AC Bocor, Locker Rusak"
                      value={formData.issue || ''}
                      onChange={e => setFormData({...formData, issue: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Priority</label>
                    <select
                      value={formData.priority || 'Medium'}
                      onChange={e => setFormData({...formData, priority: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Description (Optional)</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 h-20 resize-none"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Santri Name</label>
                    <select
                      required
                      value={formData.santriName || ''}
                      onChange={e => setFormData({...formData, santriName: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={['Santri', 'Walisantri'].includes(role)}
                    >
                      <option value="" disabled>Select Santri</option>
                      {MOCK_SANTRI.filter(s => !['Santri', 'Walisantri'].includes(role) || s.name === MOCK_LOGGED_IN_SANTRI).map(santri => (
                        <option key={santri.id} value={santri.name}>{santri.name} ({santri.nis})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Room</label>
                    <select
                      required
                      value={formData.room || ''}
                      onChange={e => setFormData({...formData, room: e.target.value})}
                      className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={['Santri', 'Walisantri'].includes(role)}
                    >
                      <option value="" disabled>Select Room</option>
                      {filteredRooms.map(room => (
                        <option key={room.id} value={room.id}>{room.name} ({room.building})</option>
                      ))}
                    </select>
                  </div>

                  {activeTab === 'permits' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Permit Type</label>
                        <select
                          value={formData.type || ''}
                          onChange={e => setFormData({...formData, type: e.target.value})}
                          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="Pulang">Pulang</option>
                          <option value="Keluar Area">Keluar Area</option>
                          <option value="Kegiatan Eksternal">Kegiatan Eksternal</option>
                          <option value="Izin Walisantri (Parental Leave)">Izin Walisantri (Parental Leave)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Reason</label>
                        <input
                          type="text" required
                          value={formData.reason || ''}
                          onChange={e => setFormData({...formData, reason: e.target.value})}
                          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                          placeholder="e.g. Acara Keluarga, Liburan Semester, Penjemputan Sakit"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Start Date</label>
                          <input
                            type="date" required
                            value={formData.startDate || ''}
                            onChange={e => setFormData({...formData, startDate: e.target.value})}
                            className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">End Date</label>
                          <input
                            type="date" required
                            value={formData.endDate || ''}
                            onChange={e => setFormData({...formData, endDate: e.target.value})}
                            className="w-full bg-black/20 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {activeTab === 'discipline' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Offense Description</label>
                        <input
                          type="text" required
                          value={formData.offense || ''}
                          onChange={e => setFormData({...formData, offense: e.target.value})}
                          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Category</label>
                          <select
                            value={formData.category || 'Ringan'}
                            onChange={e => setFormData({...formData, category: e.target.value})}
                            className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="Ringan">Ringan</option>
                            <option value="Sedang">Sedang</option>
                            <option value="Berat">Berat</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Points</label>
                          <input
                            type="number" required min="1"
                            value={formData.points || ''}
                            onChange={e => setFormData({...formData, points: e.target.value})}
                            className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Photo Evidence (Optional URL)</label>
                        <input
                          type="url"
                          value={formData.photoUrl || ''}
                          onChange={e => setFormData({...formData, photoUrl: e.target.value})}
                          placeholder="https://..."
                          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Action Plan / Resolution (Tindakan/Resolusi)</label>
                        <input
                          type="text"
                          value={formData.resolution || ''}
                          onChange={e => setFormData({...formData, resolution: e.target.value})}
                          placeholder="e.g. Pembinaan khusus oleh Pembina, peringatan tertulis"
                          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-white/5 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                  Cancel
                </button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden min-h-[600px] relative">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-white/5 bg-black/40 p-2 flex gap-2 overflow-x-auto min-w-max">
          {[
            { id: 'rooms', label: 'Room Details', icon: <Home className="w-4 h-4" />, count: filteredRooms.length, visible: true },
            { id: 'permits', label: 'Permits (Izin)', icon: <FileText className="w-4 h-4" />, count: filteredPermits.filter(p => p.status === 'Pending').length, alert: true, visible: true },
            { id: 'discipline', label: 'Discipline', icon: <Shield className="w-4 h-4" />, count: filteredDiscipline.filter(d => !d.resolved).length, alert: true, visible: true },
            { id: 'attendance', label: 'Attendance', icon: <CheckSquare className="w-4 h-4" />, count: filteredAttendance.length, visible: role !== 'Santri' },
            { id: 'audits', label: 'Cleanliness Audits', icon: <ClipboardCheck className="w-4 h-4" />, count: filteredAudits.length, visible: role !== 'Santri' },
            { id: 'tickets', label: 'Maintenance Tickets', icon: <Wrench className="w-4 h-4" />, count: filteredTickets.filter(t => t.status === 'Open').length, alert: true, visible: true },
            ...(canManageRooms ? [{ id: 'musyrif', label: 'Musyrifs', icon: <Users className="w-4 h-4" />, count: musyrifs.length, visible: true }] : []),
          ].filter(t => t.visible).map(tab => (
            <button
              key={tab.id}
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`erp-tab-control flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap relative ${
                activeTab === tab.id
                  ? "bg-indigo-950/40 text-indigo-400 border border-indigo-500/30 shadow-inner"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-700 dark:text-slate-300"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ml-1",
                  activeTab === tab.id ? "bg-indigo-500/20 text-indigo-300" : "bg-black/50 text-slate-500"
                )}>
                  {tab.count}
                </span>
              )}
              {tab.alert && tab.count > 0 && activeTab !== tab.id && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse border border-[#090d16]" />
              )}
            </button>
          ))}
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
          {activeTab === 'rooms' && renderRooms()}
          {activeTab === 'permits' && renderPermits()}
          {activeTab === 'discipline' && renderDiscipline()}
          {activeTab === 'attendance' && renderAttendance()}
          {activeTab === 'audits' && renderAudits()}
          {activeTab === 'tickets' && renderTickets()}
          {activeTab === 'musyrif' && renderMusyrifs()}
        </div>
      </div>

      {/* Rekomendasi 5: Detail Penghuni & Alokasi Kamar Terpusat Modal */}
      {selectedRoomDetail && (() => {
        const occupants = getStudentsByRoom(selectedRoomDetail.id);
        const freeSlots = Math.max(0, selectedRoomDetail.capacity - occupants.length);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <BedDouble className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-100">
                        {selectedRoomDetail.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-medium">
                        {occupants.length}/{selectedRoomDetail.capacity} Terisi
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{selectedRoomDetail.building}</span>
                      <span>&bull;</span>
                      <span>Musyrif: <strong className="text-slate-300">{selectedRoomDetail.musyrif}</strong></span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRoomDetail(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-5 overflow-y-auto">
                {/* Occupants Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-400" />
                      Daftar Penghuni Santri Terpusat ({occupants.length})
                    </h4>
                    <span className="text-xs text-slate-500">
                      Sisa Kuota: <strong className={freeSlots > 0 ? "text-emerald-400" : "text-amber-400"}>{freeSlots} Kasur</strong>
                    </span>
                  </div>

                  {occupants.length > 0 ? (
                    <div className="space-y-2">
                      {occupants.map((santri) => (
                        <div
                          key={santri.id}
                          className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-4 hover:border-slate-600 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-bold flex items-center justify-center text-sm">
                              {santri.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-slate-200">
                                {santri.name}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-slate-400">{santri.nis ? `NIS: ${santri.nis}` : `ID: ${santri.id}`}</span>
                                {santri.grade && (
                                  <>
                                    <span>&bull;</span>
                                    <span className="px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 text-[10px]">
                                      {santri.grade}
                                    </span>
                                  </>
                                )}
                                {santri.parentName && (
                                  <>
                                    <span>&bull;</span>
                                    <span className="text-slate-400">Wali: {santri.parentName}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {santri.parentPhone && (
                              <a
                                href={`https://wa.me/${santri.parentPhone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs transition-colors"
                                title="Hubungi Orang Tua (WhatsApp)"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                            {canManageRooms && (
                              <button
                                onClick={async () => {
                                  await centralRemoveSantriFromRoom(santri.id);
                                  setToast({ message: `Santri ${santri.name} telah dikeluarkan dari kamar ${selectedRoomDetail.name}.`, type: 'info' });
                                }}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs transition-colors"
                                title="Keluarkan dari kamar ini"
                              >
                                <UserMinus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center rounded-xl bg-slate-800/30 border border-dashed border-slate-700/60 text-slate-400">
                      <BedDouble className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                      <p className="text-sm font-medium">Kamar ini saat ini masih kosong.</p>
                      <p className="text-xs text-slate-500 mt-1">Gunakan formulir di bawah untuk menempatkan santri dari Master Data.</p>
                    </div>
                  )}
                </div>

                {/* Allocate Unassigned Santri Form */}
                {canManageRooms && freeSlots > 0 && (
                  <div className="p-4 rounded-xl bg-slate-800/40 border border-indigo-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4" />
                        Alokasikan Santri Baru ke Kamar Ini
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {unassignedSantri.length} Santri belum ber-kamar
                      </span>
                    </div>

                    {unassignedSantri.length > 0 ? (
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        <select
                          value={selectedSantriToAssign}
                          onChange={(e) => setSelectedSantriToAssign(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Pilih Santri Tanpa Kamar --</option>
                          {unassignedSantri.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.gender === 'P' ? 'Putri' : 'Putra'} &bull; Kelas {s.grade || '-'})
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={!selectedSantriToAssign}
                          onClick={async () => {
                            if (!selectedSantriToAssign) return;
                            const res = await centralAssignSantriToRoom(
                              selectedSantriToAssign,
                              selectedRoomDetail.id,
                              selectedRoomDetail.building
                            );
                            if (res.success) {
                              setToast({ message: res.message, type: 'success' });
                              setSelectedSantriToAssign('');
                            } else {
                              setToast({ message: res.message, type: 'error' });
                            }
                          }}
                          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shrink-0 transition-colors"
                        >
                          Tempatkan
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Semua santri di Master Data sudah teralokasi ke kamar asrama.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
                <button
                  onClick={() => setSelectedRoomDetail(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating In-App Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border animate-in slide-in-from-bottom-5 duration-200 backdrop-blur-md bg-slate-900/95 text-slate-100 border-slate-700">
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}
          <span className="text-xs font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
