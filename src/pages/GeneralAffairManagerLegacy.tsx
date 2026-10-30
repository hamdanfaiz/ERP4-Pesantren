import { ERPTabs } from "../components/ERPDesignSystem";
import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Box, Monitor, Armchair, Car, Wrench, QrCode,
  AlertTriangle, Plus, Search, Filter, ShieldCheck,
  DollarSign, Activity, FileText, CheckCircle, Tag, Pencil, MapPin, Printer, UserCheck, UserMinus, X, ChevronLeft, ChevronRight,
  Wrench as MaintenanceIcon, ClipboardList, CheckSquare, Coffee, Truck, ShoppingCart, Users, Upload, Info,
  Clock, Package, Star, Calendar, FilePlus, Database, Trash2, Edit3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { cn, generateUniqueId } from '../lib/utils';
import { QRCodeSVG } from 'qrcode.react';

// --- MOCK DATA ---
const MOCK_TICKETS = [
  { id: 'TKT-001', title: 'AC Ruang Kelas X-A Mati', category: 'Listrik & AC', reporter: 'Ust. Ahmad', location: 'Gedung A, Kelas X-A', status: 'Open', priority: 'High', date: '2026-08-09', assignedTo: 'Teknisi Budi' },
  { id: 'TKT-002', title: 'Kran Air Asrama Bocor', category: 'Plumbing', reporter: 'Santri Budi', location: 'Asrama Al-Farabi Lt 2', status: 'In Progress', priority: 'Medium', date: '2026-08-08', assignedTo: 'Teknisi Anton' },
  { id: 'TKT-003', title: 'Lampu Teras Putus', category: 'Listrik & AC', reporter: 'Satpam Yanto', location: 'Pos Satpam Utama', status: 'Resolved', priority: 'Low', date: '2026-08-07', assignedTo: 'Teknisi Budi' },
];

const PREVENTIVE_SCHEDULES = [
  { id: 'PM-001', task: 'Kuras Toren Air Asrama', schedule: 'Setiap Bulan, Tgl 15', lastDone: '2026-07-15', nextDue: '2026-08-15', status: 'Upcoming' },
  { id: 'PM-002', task: 'Servis AC Lab Komputer', schedule: 'Setiap 3 Bulan', lastDone: '2026-05-10', nextDue: '2026-08-10', status: 'Due Soon' },
];

const MOCK_ASSETS = [
  { id: 'AST-26-001', name: 'Lenovo ThinkPad T14', category: 'Electronics', location: 'Lab Komputer 1', status: 'Active', pic: 'Ust. Rahman' },
  { id: 'AST-26-002', name: 'Proyektor Epson EB-X51', category: 'Electronics', location: 'Ruang Kelas X-A', status: 'Active', pic: 'Ust. Ahmad' },
];

const STOCK_ITEMS = [
  { id: 'STK-001', name: 'Sapu Lidi', category: 'Kebersihan', currentStock: 5, minStock: 10, unit: 'Pcs', status: 'Low Stock' },
  { id: 'STK-002', name: 'Kertas HVS A4', category: 'ATK', currentStock: 45, minStock: 20, unit: 'Rim', status: 'In Stock' },
];

const MOCK_PROCUREMENT = [
  { id: 'PR-2026-08-01', item: 'Kertas HVS A4 (50 Rim)', requestor: 'Tata Usaha', estimatedCost: 2500000, status: 'Pending Approval', vendor: 'CV. Maju Jaya' },
  { id: 'PR-2026-08-02', item: 'Sapu Lidi (100 Pcs)', requestor: 'Housekeeping', estimatedCost: 1500000, status: 'Approved (Kepala GA)', vendor: 'Toko Makmur' },
];

const VENDORS = [
  { id: 'VND-001', name: 'CV. Maju Jaya', category: 'ATK', rating: 4.8, completedOrders: 15 },
  { id: 'VND-002', name: 'Toko Makmur', category: 'Kebersihan', rating: 4.5, completedOrders: 8 },
];

const MOCK_FLEET = [
  { id: 'VHC-001', name: 'Toyota HiAce (B 1234 CD)', type: 'Bus Santri', status: 'Available', nextService: '2026-09-10', taxDue: '2027-01-15', currentOdo: 45085, nextServiceOdo: 45000 },
  { id: 'VHC-002', name: 'Ambulans APV (B 9999 RS)', type: 'Ambulance', status: 'In Use', nextService: '2026-08-20', taxDue: '2026-11-05', currentOdo: 14600, nextServiceOdo: 15000 },
];

const VEHICLE_LOGS = [
  { id: 'LOG-001', vehicle: 'Toyota HiAce (B 1234 CD)', driver: 'Pak Yanto', date: '2026-08-08', purpose: 'Jemput Santri Baru', startOdo: 45010, endOdo: 45085, bbmCost: 150000 },
];

const MOCK_HOUSEKEEPING = [
  { id: 'HK-001', area: 'Asrama Al-Farabi', task: 'Pembersihan Kamar Mandi', assignee: 'Pak Mamat', status: 'Completed', time: '07:30 AM', photo: true },
  { id: 'HK-002', area: 'Masjid Utama', task: 'Vakum Karpet', assignee: 'Pak Yono', status: 'Pending', time: '09:00 AM', photo: false },
];

const GUEST_LOGS = [
  { id: 'GST-001', name: 'Bpk. Ridwan', type: 'Wali Santri', purpose: 'Jenguk Anak', timeIn: '08:15', timeOut: '10:30', status: 'Checked Out' },
  { id: 'GST-002', name: 'Tim PLN', type: 'Vendor', purpose: 'Perbaikan Gardu', timeIn: '09:00', timeOut: '-', status: 'In Area' },
];

const MOCK_KITCHEN = [
  { id: 'MNU-001', date: '2026-08-10', meal: 'Makan Siang', menu: 'Nasi, Ayam Goreng, Sayur Sop, Tempe', portions: 1250, status: 'Planned' },
  { id: 'MNU-002', date: '2026-08-10', meal: 'Makan Malam', menu: 'Nasi, Telur Balado, Cah Kangkung', portions: 1250, status: 'Planned' },
];

const KITCHEN_AUDIT = [
  { id: 'AUD-001', date: '2026-08-09', inspector: 'GA Team', score: '92/100', status: 'Pass', notes: 'Kondisi dapur bersih, alat masak disanitasi.' },
];

// --- SUB-COMPONENTS ---

const MaintenanceCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 7, 1)); // Start at August 2026

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentYear, currentMonth);

  const totalSlots = Math.ceil((daysInMonth + firstDayOfMonth) / 7) * 7;

  const dates = Array.from({ length: totalSlots }, (_, i) => {
    const day = i - firstDayOfMonth + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  const schedules = [
    { date: 10, month: 7, title: 'Servis AC Lab Komputer', type: 'ac' },
    { date: 15, month: 7, title: 'Kuras Toren Air Asrama', type: 'water' },
    { date: 22, month: 7, title: 'Cek Genset Utama', type: 'genset' },
    { date: 28, month: 7, title: 'Pest Control Asrama', type: 'pest' },
    { date: 5, month: 8, title: 'Maintenance Server', type: 'ac' },
    { date: 12, month: 8, title: 'Pengecekan Filter Air', type: 'water' }
  ];

  const handlePrevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm mt-6">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-500" /> Maintenance Calendar
        </h4>
        <div className="flex items-center gap-4">
          <button onClick={handlePrevMonth} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
          <span className="font-medium text-slate-700 dark:text-slate-300 w-32 text-center">{monthNames[currentMonth]} {currentYear}</span>
          <button onClick={handleNextMonth} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-7 gap-px mb-2">
          {days.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {dates.map((d, i) => {
            const daySchedules = schedules.filter(s => s.date === d && s.month === currentMonth);
            const isToday = d === 9 && currentMonth === 7 && currentYear === 2026; // Hardcoded today for mockup
            return (
              <div
                key={i}
                className={cn(
                  "min-h-[80px] p-2 rounded-lg border flex flex-col transition-colors",
                  d ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700" : "bg-slate-50 dark:bg-slate-900/50 border-transparent",
                  isToday ? "ring-2 ring-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/10" : ""
                )}
              >
                {d && (
                  <>
                    <span className={cn(
                      "text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1",
                      isToday ? "bg-emerald-500 text-white" : "text-slate-700 dark:text-slate-300"
                    )}>{d}</span>
                    <div className="space-y-1 mt-auto">
                      {daySchedules.map((hasSchedule, idx) => (
                        <div key={idx} className={cn(
                          "text-[10px] leading-tight p-1 rounded font-medium truncate cursor-pointer",
                          hasSchedule.type === 'ac' ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 hover:bg-blue-200" :
                          hasSchedule.type === 'water' ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400 hover:bg-cyan-200" :
                          hasSchedule.type === 'genset' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 hover:bg-amber-200" :
                          "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 hover:bg-purple-200"
                        )} title={hasSchedule.title}>
                          {hasSchedule.title}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const TicketsModule = () => {
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [schedules, setSchedules] = useState(PREVENTIVE_SCHEDULES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: '', category: 'Listrik & AC', location: '', reporter: '' });

  const handleAddTicket = () => {
    if (!newTicket.title || !newTicket.location || !newTicket.reporter) return;

    const ticket = {
      id: `TKT-${String(tickets.length + 1).padStart(3, '0')}`,
      title: newTicket.title,
      category: newTicket.category,
      reporter: newTicket.reporter,
      location: newTicket.location,
      status: 'Open',
      priority: 'Medium',
      date: new Date().toISOString().split('T')[0],
      assignedTo: 'Belum Disposisi'
    };

    setTickets([ticket, ...tickets]);
    setIsModalOpen(false);
    setNewTicket({ title: '', category: 'Listrik & AC', location: '', reporter: '' });
  };

  const handleToggleTicketStatus = (id: string) => {
    setTickets(tickets.map(t => {
      if (t.id === id) {
        const nextStatus = t.status === 'Open' ? 'In Progress' : (t.status === 'In Progress' ? 'Resolved' : 'Open');
        return { ...t, status: nextStatus };
      }
      return t;
    }));
  };

  const handleMarkScheduleDone = (id: string) => {
    setSchedules(schedules.map(s => {
      if (s.id === id) {
        return { ...s, status: 'Completed', lastDone: new Date().toISOString().split('T')[0] };
      }
      return s;
    }));
  };

  return (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Maintenance & Ticketing</h3>
      <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2">
        <Plus className="w-4 h-4" /> Lapor Kerusakan
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
          <h4 className="font-medium text-slate-700 dark:text-slate-300">Daftar Aduan (Ticketing)</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {tickets.map(t => (
            <div key={t.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
              <div className="flex justify-between mb-2">
                <span className="font-medium text-slate-800 dark:text-slate-200">{t.title}</span>
                <button
                  onClick={() => handleToggleTicketStatus(t.id)}
                  className={cn(
                  "px-2.5 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors border",
                  t.status === 'Open' ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400 hover:bg-rose-100" :
                  t.status === 'In Progress' ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400 hover:bg-amber-100" :
                  "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 hover:bg-emerald-100"
                )}>{t.status}</button>
              </div>
              <div className="text-sm text-slate-500 mb-2">{t.location} • Pelapor: {t.reporter}</div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">Disposisi: {t.assignedTo}</span>
                <span>{t.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
          <h4 className="font-medium text-slate-700 dark:text-slate-300">Preventive Maintenance</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {schedules.map(p => (
            <div key={p.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between items-center">
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  {p.task}
                  {p.status === 'Completed' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                </div>
                <div className="text-sm text-slate-500">Siklus: {p.schedule}</div>
                {p.status !== 'Completed' ? (
                  <div className="text-xs text-slate-500 mt-1">Due: <span className="font-bold text-rose-500">{p.nextDue}</span></div>
                ) : (
                  <div className="text-xs text-slate-500 mt-1">Selesai: <span className="font-bold text-emerald-600">{p.lastDone}</span></div>
                )}
              </div>
              {p.status !== 'Completed' && (
                <button onClick={() => handleMarkScheduleDone(p.id)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors">
                  Mark Done
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    <MaintenanceCalendar />

    {/* Lapor Kerusakan Modal */}
    {isModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
             <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-500" /> Lapor Kerusakan Baru
             </h3>
             <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
               <X className="w-5 h-5" />
             </button>
          </div>
          <div className="p-6 space-y-4">
             <div>
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Judul / Kendala</label>
               <input
                 type="text"
                 value={newTicket.title}
                 onChange={e => setNewTicket({...newTicket, title: e.target.value})}
                 placeholder="Contoh: AC Kelas X-A Mati"
                 className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
               />
             </div>

             <div>
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
               <select
                 value={newTicket.category}
                 onChange={e => setNewTicket({...newTicket, category: e.target.value})}
                 className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
               >
                 <option>Listrik & AC</option>
                 <option>Plumbing (Air & Saluran)</option>
                 <option>Sipil & Bangunan</option>
                 <option>IT & Jaringan</option>
               </select>
             </div>

             <div>
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Lokasi</label>
               <input
                 type="text"
                 value={newTicket.location}
                 onChange={e => setNewTicket({...newTicket, location: e.target.value})}
                 placeholder="Contoh: Gedung A, Kelas X-A"
                 className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
               />
             </div>

             <div>
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Pelapor</label>
               <input
                 type="text"
                 value={newTicket.reporter}
                 onChange={e => setNewTicket({...newTicket, reporter: e.target.value})}
                 placeholder="Contoh: Ust. Ahmad"
                 className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
               />
             </div>

             <button onClick={handleAddTicket} className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
               Submit Laporan
             </button>
          </div>
        </div>
      </div>
    )}
  </div>
  );
}

// --- DEFAULT SEED DATA FOR FACILITIES AND INVENTORY ---
const DEFAULT_GA_FACILITIES = [
  { id: 'AST-26-001', name: 'Lenovo ThinkPad T14 (Admin GA)', category: 'Electronics', location: 'Kantor GA Lt. 1', status: 'Active', pic: 'Ust. Rahman', condition: 'Baik', value: 14500000, acquisitionDate: '2025-01-15' },
  { id: 'AST-26-002', name: 'Proyektor Epson EB-X51', category: 'Electronics', location: 'Ruang Kelas X-A', status: 'Active', pic: 'Ust. Ahmad', condition: 'Baik', value: 6800000, acquisitionDate: '2025-03-20' },
  { id: 'AST-26-003', name: 'AC Split Daikin 1.5 PK', category: 'Machinery', location: 'Lab Komputer 1', status: 'Active', pic: 'Teknisi Budi', condition: 'Perlu Servis', value: 5200000, acquisitionDate: '2024-06-10' },
  { id: 'AST-26-004', name: 'Genset Silent Perkins 50 kVA', category: 'Machinery', location: 'Rumah Genset Belakang', status: 'Active', pic: 'Pak Yanto', condition: 'Baik', value: 185000000, acquisitionDate: '2023-11-05' },
  { id: 'AST-26-005', name: 'Meja Santri Kayu Jati (Set 20)', category: 'Furniture', location: 'Ruang Kelas XI-B', status: 'Active', pic: 'Ust. Farhan', condition: 'Baik', value: 16000000, acquisitionDate: '2024-08-01' },
  { id: 'AST-26-006', name: 'Pompa Air Booster Grundfos', category: 'Sanitary', location: 'Toren Utama Asrama Putri', status: 'Active', pic: 'Pak Anton', condition: 'Baik', value: 8500000, acquisitionDate: '2024-02-18' },
];

const DEFAULT_GA_INVENTORY = [
  { id: 'STK-001', name: 'Sapu Lidi & Ijuk Gagang', category: 'Kebersihan', currentStock: 8, minStock: 15, unit: 'Pcs', costPerUnit: 18000, location: 'Gudang GA Lt. 1', status: 'Low Stock' },
  { id: 'STK-002', name: 'Kertas HVS PaperOne A4 75gr', category: 'ATK', currentStock: 42, minStock: 20, unit: 'Rim', costPerUnit: 48000, location: 'Gudang ATK', status: 'In Stock' },
  { id: 'STK-003', name: 'Lampu LED Philips 14W Putih', category: 'Elektrikal', currentStock: 5, minStock: 10, unit: 'Pcs', costPerUnit: 42000, location: 'Gudang Teknisi', status: 'Low Stock' },
  { id: 'STK-004', name: 'Cairan Karbol Pembersih Lantai 5L', category: 'Kebersihan', currentStock: 12, minStock: 5, unit: 'Jerigen', costPerUnit: 65000, location: 'Gudang Kebersihan', status: 'In Stock' },
  { id: 'STK-005', name: 'Kran Air PVC 1/2 Inch', category: 'Sanitary', currentStock: 0, minStock: 8, unit: 'Pcs', costPerUnit: 25000, location: 'Gudang Teknisi', status: 'Out of Stock' },
  { id: 'STK-006', name: 'Spidol Whiteboard Snowman Hitam', category: 'ATK', currentStock: 35, minStock: 24, unit: 'Lusin', costPerUnit: 85000, location: 'Gudang ATK', status: 'In Stock' },
];

const FACILITY_CATEGORIES = ['All', 'Electronics', 'Furniture', 'Machinery', 'Sanitary', 'Kendaraan', 'Bangunan'];
const INVENTORY_CATEGORIES = ['All', 'ATK', 'Kebersihan', 'Elektrikal', 'Sanitary', 'Perkakas'];

const LegacyAssetsModule = () => {
  const { user } = useAuth();
  // State management for Firestore data
  const [facilities, setFacilities] = useState<any[]>(DEFAULT_GA_FACILITIES);
  const [inventory, setInventory] = useState<any[]>(DEFAULT_GA_INVENTORY);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(true);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);

  // Sub-tabs & filter state
  const [activeSubTab, setActiveSubTab] = useState<'facilities' | 'inventory'>('facilities');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modals state
  const [qrModalAsset, setQrModalAsset] = useState<any>(null);
  const [isOpnameOpen, setIsOpnameOpen] = useState(false);
  const [opnameStatus, setOpnameStatus] = useState<Record<string, string>>({});

  // Facility modals
  const [isAddFacilityOpen, setIsAddFacilityOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<any>(null);
  const [deleteFacilityModal, setDeleteFacilityModal] = useState<any>(null);
  const [facilityForm, setFacilityForm] = useState({
    name: '',
    category: 'Electronics',
    location: '',
    pic: '',
    condition: 'Baik',
    value: 0,
    acquisitionDate: new Date().toISOString().split('T')[0]
  });

  // Inventory modals
  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false);
  const [editingInventory, setEditingInventory] = useState<any>(null);
  const [adjustingInventory, setAdjustingInventory] = useState<any>(null);
  const [adjustForm, setAdjustForm] = useState({ type: 'IN', quantity: 1, reason: 'Penerimaan barang' });
  const [deleteInventoryModal, setDeleteInventoryModal] = useState<any>(null);
  const [inventoryForm, setInventoryForm] = useState({
    name: '',
    category: 'Kebersihan',
    currentStock: 0,
    minStock: 10,
    unit: 'Pcs',
    costPerUnit: 0,
    location: 'Gudang GA Lt. 1'
  });

  // --- FIRESTORE SUBSCRIPTIONS & AUTO-SEEDING ---
  useEffect(() => {
    let isFacilitySeeded = false;
    let isInventorySeeded = false;

    // 1. Facilities listener
    const unsubFacilities = onSnapshot(tenantScopedQuery(collection(db, 'ga_facilities'), user?.tenantId), async (snapshot) => {
      if (snapshot.empty && !isFacilitySeeded) {
        isFacilitySeeded = true;
        try {
          for (const item of DEFAULT_GA_FACILITIES) {
            await addDoc(collection(db, 'ga_facilities'), tenantRecord(user?.tenantId, {
              ...item,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }));
          }
        } catch (e) {
          console.warn('Fallback: Seeding ga_facilities in-memory only', e);
          setFacilities(DEFAULT_GA_FACILITIES);
        }
      } else if (!snapshot.empty) {
        const loaded = snapshot.docs.map(d => ({ firestoreId: d.id, ...(d.data() as Record<string, any>) }));
        setFacilities(loaded);
      } else {
        setFacilities(DEFAULT_GA_FACILITIES);
      }
      setIsLoadingFacilities(false);
    }, (error) => {
      console.warn('Firestore ga_facilities offline/error, using fallback data:', error);
      setFacilities(DEFAULT_GA_FACILITIES);
      setIsLoadingFacilities(false);
    });

    // 2. Inventory listener
    const unsubInventory = onSnapshot(tenantScopedQuery(collection(db, 'ga_inventory'), user?.tenantId), async (snapshot) => {
      if (snapshot.empty && !isInventorySeeded) {
        isInventorySeeded = true;
        try {
          for (const item of DEFAULT_GA_INVENTORY) {
            await addDoc(collection(db, 'ga_inventory'), tenantRecord(user?.tenantId, {
              ...item,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }));
          }
        } catch (e) {
          console.warn('Fallback: Seeding ga_inventory in-memory only', e);
          setInventory(DEFAULT_GA_INVENTORY);
        }
      } else if (!snapshot.empty) {
        const loaded = snapshot.docs.map(d => ({ firestoreId: d.id, ...(d.data() as Record<string, any>) }));
        setInventory(loaded);
      } else {
        setInventory(DEFAULT_GA_INVENTORY);
      }
      setIsLoadingInventory(false);
    }, (error) => {
      console.warn('Firestore ga_inventory offline/error, using fallback data:', error);
      setInventory(DEFAULT_GA_INVENTORY);
      setIsLoadingInventory(false);
    });

    return () => {
      unsubFacilities();
      unsubInventory();
    };
  }, [user?.tenantId, user?.uid]);

  // --- CRUD FUNCTIONS: FACILITIES ---
  const handleAddFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityForm.name.trim() || !facilityForm.location.trim()) return;

    const newId = `AST-26-${String(facilities.length + 1).padStart(3, '0')}`;
    const newRecord = {
      id: newId,
      name: facilityForm.name.trim(),
      category: facilityForm.category,
      location: facilityForm.location.trim(),
      pic: facilityForm.pic.trim() || 'Bagian GA',
      condition: facilityForm.condition || 'Baik',
      value: Number(facilityForm.value) || 0,
      acquisitionDate: facilityForm.acquisitionDate,
      status: 'Active'
    };

    try {
      await addDoc(collection(db, 'ga_facilities'), tenantRecord(user?.tenantId, {
        ...newRecord,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    } catch (err) {
      console.warn('Local fallback for adding facility:', err);
      setFacilities(prev => [{ ...newRecord, firestoreId: `temp-${Date.now()}` }, ...prev]);
    }

    setFacilityForm({
      name: '',
      category: 'Electronics',
      location: '',
      pic: '',
      condition: 'Baik',
      value: 0,
      acquisitionDate: new Date().toISOString().split('T')[0]
    });
    setIsAddFacilityOpen(false);
  };

  const handleUpdateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacility) return;

    const updatedData = {
      name: editingFacility.name,
      category: editingFacility.category,
      location: editingFacility.location,
      pic: editingFacility.pic,
      condition: editingFacility.condition,
      value: Number(editingFacility.value) || 0,
      acquisitionDate: editingFacility.acquisitionDate,
      status: editingFacility.status || 'Active'
    };

    try {
      if (editingFacility.firestoreId) {
        await updateDoc(doc(db, 'ga_facilities', editingFacility.firestoreId), {
          ...updatedData,
          updatedAt: serverTimestamp()
        });
      } else {
        setFacilities(prev => prev.map(f => f.id === editingFacility.id ? { ...f, ...updatedData } : f));
      }
    } catch (err) {
      console.warn('Local fallback for updating facility:', err);
      setFacilities(prev => prev.map(f => f.id === editingFacility.id ? { ...f, ...updatedData } : f));
    }

    setEditingFacility(null);
  };

  const handleDeleteFacility = async () => {
    if (!deleteFacilityModal) return;

    try {
      if (deleteFacilityModal.firestoreId) {
        await deleteDoc(doc(db, 'ga_facilities', deleteFacilityModal.firestoreId));
      }
      setFacilities(prev => prev.filter(f => f.id !== deleteFacilityModal.id));
    } catch (err) {
      console.warn('Local fallback for deleting facility:', err);
      setFacilities(prev => prev.filter(f => f.id !== deleteFacilityModal.id));
    }

    setDeleteFacilityModal(null);
  };

  const handleMarkOpname = async (facilityId: string, firestoreId: string | undefined, condition: string) => {
    setOpnameStatus(prev => ({ ...prev, [facilityId]: condition }));

    try {
      if (firestoreId) {
        await updateDoc(doc(db, 'ga_facilities', firestoreId), {
          condition,
          lastOpname: new Date().toISOString().slice(0, 10),
          updatedAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.warn('Local update for opname:', err);
    }
  };

  // --- CRUD FUNCTIONS: INVENTORY ---
  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventoryForm.name.trim()) return;

    const newStock = Number(inventoryForm.currentStock) || 0;
    const minStk = Number(inventoryForm.minStock) || 1;
    const computedStatus = newStock <= 0 ? 'Out of Stock' : newStock <= minStk ? 'Low Stock' : 'In Stock';

    const newId = `STK-${String(inventory.length + 1).padStart(3, '0')}`;
    const newRecord = {
      id: newId,
      name: inventoryForm.name.trim(),
      category: inventoryForm.category,
      currentStock: newStock,
      minStock: minStk,
      unit: inventoryForm.unit.trim() || 'Pcs',
      costPerUnit: Number(inventoryForm.costPerUnit) || 0,
      location: inventoryForm.location.trim() || 'Gudang GA',
      status: computedStatus
    };

    try {
      await addDoc(collection(db, 'ga_inventory'), tenantRecord(user?.tenantId, {
        ...newRecord,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    } catch (err) {
      console.warn('Local fallback for adding inventory:', err);
      setInventory(prev => [{ ...newRecord, firestoreId: `temp-${Date.now()}` }, ...prev]);
    }

    setInventoryForm({
      name: '',
      category: 'Kebersihan',
      currentStock: 0,
      minStock: 10,
      unit: 'Pcs',
      costPerUnit: 0,
      location: 'Gudang GA Lt. 1'
    });
    setIsAddInventoryOpen(false);
  };

  const handleUpdateInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInventory) return;

    const newStock = Number(editingInventory.currentStock) || 0;
    const minStk = Number(editingInventory.minStock) || 1;
    const computedStatus = newStock <= 0 ? 'Out of Stock' : newStock <= minStk ? 'Low Stock' : 'In Stock';

    const updatedData = {
      name: editingInventory.name,
      category: editingInventory.category,
      currentStock: newStock,
      minStock: minStk,
      unit: editingInventory.unit,
      costPerUnit: Number(editingInventory.costPerUnit) || 0,
      location: editingInventory.location,
      status: computedStatus
    };

    try {
      if (editingInventory.firestoreId) {
        await updateDoc(doc(db, 'ga_inventory', editingInventory.firestoreId), {
          ...updatedData,
          updatedAt: serverTimestamp()
        });
      } else {
        setInventory(prev => prev.map(i => i.id === editingInventory.id ? { ...i, ...updatedData } : i));
      }
    } catch (err) {
      console.warn('Local fallback for updating inventory:', err);
      setInventory(prev => prev.map(i => i.id === editingInventory.id ? { ...i, ...updatedData } : i));
    }

    setEditingInventory(null);
  };

  const handleExecuteStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingInventory) return;

    const delta = adjustForm.type === 'IN' ? Number(adjustForm.quantity) : -Number(adjustForm.quantity);
    const newStock = Math.max(0, (Number(adjustingInventory.currentStock) || 0) + delta);
    const minStk = Number(adjustingInventory.minStock) || 1;
    const computedStatus = newStock <= 0 ? 'Out of Stock' : newStock <= minStk ? 'Low Stock' : 'In Stock';

    try {
      if (adjustingInventory.firestoreId) {
        await updateDoc(doc(db, 'ga_inventory', adjustingInventory.firestoreId), {
          currentStock: newStock,
          status: computedStatus,
          lastAdjusted: new Date().toISOString(),
          lastReason: adjustForm.reason,
          updatedAt: serverTimestamp()
        });
      }
      setInventory(prev => prev.map(i => i.id === adjustingInventory.id ? { ...i, currentStock: newStock, status: computedStatus } : i));
    } catch (err) {
      console.warn('Local fallback for adjusting stock:', err);
      setInventory(prev => prev.map(i => i.id === adjustingInventory.id ? { ...i, currentStock: newStock, status: computedStatus } : i));
    }

    setAdjustingInventory(null);
    setAdjustForm({ type: 'IN', quantity: 1, reason: 'Penerimaan barang' });
  };

  const handleDeleteInventory = async () => {
    if (!deleteInventoryModal) return;

    try {
      if (deleteInventoryModal.firestoreId) {
        await deleteDoc(doc(db, 'ga_inventory', deleteInventoryModal.firestoreId));
      }
      setInventory(prev => prev.filter(i => i.id !== deleteInventoryModal.id));
    } catch (err) {
      console.warn('Local fallback for deleting inventory:', err);
      setInventory(prev => prev.filter(i => i.id !== deleteInventoryModal.id));
    }

    setDeleteInventoryModal(null);
  };

  // --- FILTERED DATA ---
  const filteredFacilities = facilities.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (f.pic && f.pic.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || f.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredInventory = inventory.filter(i => {
    const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          i.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (i.location && i.location.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || i.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // KPI Calculations
  const totalFacilityValue = facilities.reduce((sum, f) => sum + (Number(f.value) || 0), 0);
  const goodConditionCount = facilities.filter(f => f.condition === 'Baik').length;
  const needsRepairCount = facilities.filter(f => f.condition === 'Perlu Servis' || f.condition === 'Rusak Berat').length;
  const lowStockCount = inventory.filter(i => i.status === 'Low Stock' || i.status === 'Out of Stock').length;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase">Total Fasilitas</span>
            <Box className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{facilities.length}</div>
          <div className="text-xs text-slate-400 mt-1">Est. Nilai: Rp {(totalFacilityValue / 1000000).toFixed(1)}M</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase">Kondisi Baik</span>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{goodConditionCount}</div>
          <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">Siap operasional santri</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase">Perlu Servis</span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{needsRepairCount}</div>
          <div className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">Butuh disposisi teknisi</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase">Stok Logistik Rendah</span>
            <Package className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{lowStockCount}</div>
          <div className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-1">Perlu reorder / pengadaan</div>
        </div>
      </div>

      {/* SUB-TAB NAVIGATOR & ACTION BUTTONS */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => { setActiveSubTab('facilities'); setSelectedCategory('All'); }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2",
              activeSubTab === 'facilities'
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Box className="w-4 h-4" />
            Fasilitas & Aset Tetap ({facilities.length})
          </button>
          <button
            onClick={() => { setActiveSubTab('inventory'); setSelectedCategory('All'); }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2",
              activeSubTab === 'inventory'
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Package className="w-4 h-4" />
            Stok & Logistik Operasional ({inventory.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {activeSubTab === 'facilities' ? (
            <>
              <button
                onClick={() => setIsOpnameOpen(true)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-medium text-sm flex items-center gap-2 transition"
              >
                <QrCode className="w-4 h-4" /> Audit Opname Fisik
              </button>
              <button
                onClick={() => setIsAddFacilityOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-sm transition"
              >
                <Plus className="w-4 h-4" /> Tambah Aset Fasilitas
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsAddInventoryOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Tambah Item Logistik
            </button>
          )}
        </div>
      </div>

      {/* SEARCH AND CATEGORY BAR */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={activeSubTab === 'facilities' ? "Cari nama aset, lokasi, atau PIC..." : "Cari nama barang logistik atau kode stok..."}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(activeSubTab === 'facilities' ? FACILITY_CATEGORIES : INVENTORY_CATEGORIES).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition",
                selectedCategory === cat
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* DATA VIEW 1: FACILITIES TABLE */}
      {activeSubTab === 'facilities' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" /> Daftar Fasilitas & Inventaris Fisik (Real-time Firestore)
            </h4>
            <span className="text-xs text-slate-500 font-medium">{filteredFacilities.length} Item Ditampilkan</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">Kode Aset</th>
                  <th className="px-4 py-3 font-semibold">Nama Barang & Kategori</th>
                  <th className="px-4 py-3 font-semibold">Lokasi Ruangan</th>
                  <th className="px-4 py-3 font-semibold">PIC Penanggung Jawab</th>
                  <th className="px-4 py-3 font-semibold text-center">Kondisi Fisik</th>
                  <th className="px-4 py-3 font-semibold text-right">Nilai Perolehan</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredFacilities.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {f.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{f.name}</div>
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                        {f.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{f.location}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                      {f.pic || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "px-2.5 py-1 text-xs font-semibold rounded-full inline-block",
                        f.condition === 'Baik' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                        f.condition === 'Perlu Servis' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                        "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                      )}>
                        {f.condition || 'Baik'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300 text-xs">
                      Rp {Number(f.value || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setQrModalAsset(f)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title="Cetak Label & QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingFacility(f)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title="Edit Fasilitas"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteFacilityModal(f)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title="Hapus Fasilitas"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredFacilities.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                      Tidak ada catatan fasilitas yang sesuai dengan pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DATA VIEW 2: INVENTORY TABLE */}
      {activeSubTab === 'inventory' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" /> Stok Logistik & Habis Pakai (Real-time Firestore)
            </h4>
            <span className="text-xs text-slate-500 font-medium">{filteredInventory.length} Item Ditampilkan</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">Kode Stok</th>
                  <th className="px-4 py-3 font-semibold">Nama Barang & Kategori</th>
                  <th className="px-4 py-3 font-semibold">Lokasi Penyimpanan</th>
                  <th className="px-4 py-3 font-semibold text-center">Stok Saat Ini</th>
                  <th className="px-4 py-3 font-semibold text-center">Batas Minimum</th>
                  <th className="px-4 py-3 font-semibold text-center">Status Stok</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInventory.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {item.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</div>
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                      {item.location || 'Gudang GA'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "text-base font-bold",
                        item.status === 'Out of Stock' ? "text-rose-600" :
                        item.status === 'Low Stock' ? "text-amber-600" :
                        "text-slate-800 dark:text-slate-100"
                      )}>
                        {item.currentStock} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 font-medium">
                      {item.minStock} {item.unit}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "px-2.5 py-1 text-xs font-semibold rounded-full inline-block",
                        item.status === 'In Stock' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                        item.status === 'Low Stock' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                        "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                      )}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setAdjustingInventory(item); setAdjustForm({ type: 'IN', quantity: 1, reason: 'Penerimaan barang' }); }}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 rounded-lg text-xs font-semibold transition"
                          title="Sesuaikan Stok"
                        >
                          ± Stok
                        </button>
                        <button
                          onClick={() => setEditingInventory(item)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title="Edit Item"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteInventoryModal(item)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title="Hapus Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                      Tidak ada catatan inventaris yang sesuai dengan pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: QR CODE & LABEL CETAK */}
      {qrModalAsset && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white" onClick={() => setQrModalAsset(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 print:border-none print:shadow-none" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center print:hidden">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-500" /> Label QR Code Aset
              </h3>
              <button onClick={() => setQrModalAsset(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center">
              <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 shadow-sm">
                <QRCodeSVG value={JSON.stringify({ id: qrModalAsset.id, name: qrModalAsset.name })} size={180} />
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-lg text-center">{qrModalAsset.name}</h4>
              <p className="text-blue-600 dark:text-blue-400 text-sm mt-1 font-mono font-bold">{qrModalAsset.id}</p>
              <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 text-center space-y-1">
                <div>Lokasi: <span className="font-semibold text-slate-700 dark:text-slate-300">{qrModalAsset.location}</span></div>
                <div>PIC: <span className="font-semibold text-slate-700 dark:text-slate-300">{qrModalAsset.pic}</span></div>
                <div>Kondisi: <span className="font-semibold text-slate-700 dark:text-slate-300">{qrModalAsset.condition}</span></div>
              </div>
              <button
                onClick={() => window.print()}
                className="mt-6 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-sm print:hidden"
              >
                <Printer className="w-4 h-4" /> Cetak Label Aset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TAMBAH ASET FASILITAS */}
      {isAddFacilityOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsAddFacilityOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" /> Tambah Fasilitas & Aset Baru
              </h3>
              <button onClick={() => setIsAddFacilityOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddFacility} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nama Barang / Fasilitas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: AC Daikin 1.5 PK"
                  value={facilityForm.name}
                  onChange={e => setFacilityForm({ ...facilityForm, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kategori</label>
                  <select
                    value={facilityForm.category}
                    onChange={e => setFacilityForm({ ...facilityForm, category: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Electronics">Electronics</option>
                    <option value="Furniture">Furniture & Mebel</option>
                    <option value="Machinery">Machinery & Genset</option>
                    <option value="Sanitary">Sanitary & Plumbing</option>
                    <option value="Kendaraan">Kendaraan</option>
                    <option value="Bangunan">Bangunan & Ruangan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kondisi Awal</label>
                  <select
                    value={facilityForm.condition}
                    onChange={e => setFacilityForm({ ...facilityForm, condition: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Baik">Baik (Layak)</option>
                    <option value="Perlu Servis">Perlu Servis</option>
                    <option value="Rusak Berat">Rusak Berat</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Lokasi Penempatan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Lab Komputer 1 / Ruang Kelas X-A"
                  value={facilityForm.location}
                  onChange={e => setFacilityForm({ ...facilityForm, location: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">PIC Penanggung Jawab</label>
                  <input
                    type="text"
                    placeholder="Contoh: Ust. Ahmad"
                    value={facilityForm.pic}
                    onChange={e => setFacilityForm({ ...facilityForm, pic: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nilai Perolehan (Rp)</label>
                  <input
                    type="number"
                    value={facilityForm.value}
                    onChange={e => setFacilityForm({ ...facilityForm, value: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddFacilityOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Batal</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">Simpan ke Firestore</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT FASILITAS */}
      {editingFacility && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingFacility(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" /> Edit Fasilitas: {editingFacility.id}
              </h3>
              <button onClick={() => setEditingFacility(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateFacility} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Barang / Fasilitas</label>
                <input
                  type="text"
                  required
                  value={editingFacility.name}
                  onChange={e => setEditingFacility({ ...editingFacility, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kategori</label>
                  <select
                    value={editingFacility.category}
                    onChange={e => setEditingFacility({ ...editingFacility, category: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Electronics">Electronics</option>
                    <option value="Furniture">Furniture & Mebel</option>
                    <option value="Machinery">Machinery & Genset</option>
                    <option value="Sanitary">Sanitary & Plumbing</option>
                    <option value="Kendaraan">Kendaraan</option>
                    <option value="Bangunan">Bangunan & Ruangan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kondisi</label>
                  <select
                    value={editingFacility.condition}
                    onChange={e => setEditingFacility({ ...editingFacility, condition: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Baik">Baik (Layak)</option>
                    <option value="Perlu Servis">Perlu Servis</option>
                    <option value="Rusak Berat">Rusak Berat</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Lokasi Penempatan</label>
                <input
                  type="text"
                  required
                  value={editingFacility.location}
                  onChange={e => setEditingFacility({ ...editingFacility, location: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">PIC Penanggung Jawab</label>
                  <input
                    type="text"
                    value={editingFacility.pic}
                    onChange={e => setEditingFacility({ ...editingFacility, pic: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nilai Aset (Rp)</label>
                  <input
                    type="number"
                    value={editingFacility.value}
                    onChange={e => setEditingFacility({ ...editingFacility, value: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingFacility(null)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Batal</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: HAPUS FASILITAS (IN-APP CONFIRMATION) */}
      {deleteFacilityModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteFacilityModal(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Hapus Fasilitas?</h3>
              <p className="text-slate-500 text-xs mt-1">
                Apakah Anda yakin ingin menghapus data aset <span className="font-semibold text-slate-800 dark:text-slate-200">{deleteFacilityModal.name}</span> ({deleteFacilityModal.id}) dari Firestore?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setDeleteFacilityModal(null)} className="flex-1 py-2 border rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
                Batal
              </button>
              <button onClick={handleDeleteFacility} className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold">
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: AUDIT OPNAME FISIK */}
      {isOpnameOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsOpnameOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600" /> Stock Opname & Verifikasi Fisik Aset
              </h3>
              <button onClick={() => setIsOpnameOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 flex-1">
              {facilities.map(f => (
                <div key={f.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{f.name}</div>
                    <div className="text-xs text-slate-500">{f.id} • {f.location} • PIC: {f.pic}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleMarkOpname(f.id, f.firestoreId, 'Baik')}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition",
                        (opnameStatus[f.id] || f.condition) === 'Baik' ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30"
                      )}
                    >
                      Kondisi Baik
                    </button>
                    <button
                      onClick={() => handleMarkOpname(f.id, f.firestoreId, 'Perlu Servis')}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition",
                        (opnameStatus[f.id] || f.condition) === 'Perlu Servis' ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30"
                      )}
                    >
                      Perlu Servis
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button onClick={() => setIsOpnameOpen(false)} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl">
                Selesai Opname
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: TAMBAH ITEM INVENTORY */}
      {isAddInventoryOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsAddInventoryOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" /> Tambah Item Logistik Baru
              </h3>
              <button onClick={() => setIsAddInventoryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddInventory} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nama Barang Logistik <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kertas HVS A4 80gr"
                  value={inventoryForm.name}
                  onChange={e => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kategori</label>
                  <select
                    value={inventoryForm.category}
                    onChange={e => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="Kebersihan">Kebersihan</option>
                    <option value="ATK">ATK & Kertas</option>
                    <option value="Elektrikal">Elektrikal & Lampu</option>
                    <option value="Sanitary">Sanitary & Keran</option>
                    <option value="Perkakas">Perkakas / Tools</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Satuan Unit</label>
                  <input
                    type="text"
                    placeholder="Pcs / Rim / Box"
                    value={inventoryForm.unit}
                    onChange={e => setInventoryForm({ ...inventoryForm, unit: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Stok Awal</label>
                  <input
                    type="number"
                    required
                    value={inventoryForm.currentStock}
                    onChange={e => setInventoryForm({ ...inventoryForm, currentStock: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Batas Minimum (Alert)</label>
                  <input
                    type="number"
                    required
                    value={inventoryForm.minStock}
                    onChange={e => setInventoryForm({ ...inventoryForm, minStock: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Harga Satuan (Rp)</label>
                  <input
                    type="number"
                    value={inventoryForm.costPerUnit}
                    onChange={e => setInventoryForm({ ...inventoryForm, costPerUnit: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Lokasi Rak / Gudang</label>
                  <input
                    type="text"
                    value={inventoryForm.location}
                    onChange={e => setInventoryForm({ ...inventoryForm, location: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddInventoryOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Batal</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold">Simpan Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: EDIT ITEM INVENTORY */}
      {editingInventory && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingInventory(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-600" /> Edit Item: {editingInventory.id}
              </h3>
              <button onClick={() => setEditingInventory(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateInventory} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Barang Logistik</label>
                <input
                  type="text"
                  required
                  value={editingInventory.name}
                  onChange={e => setEditingInventory({ ...editingInventory, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kategori</label>
                  <select
                    value={editingInventory.category}
                    onChange={e => setEditingInventory({ ...editingInventory, category: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="Kebersihan">Kebersihan</option>
                    <option value="ATK">ATK & Kertas</option>
                    <option value="Elektrikal">Elektrikal & Lampu</option>
                    <option value="Sanitary">Sanitary & Keran</option>
                    <option value="Perkakas">Perkakas / Tools</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Satuan Unit</label>
                  <input
                    type="text"
                    value={editingInventory.unit}
                    onChange={e => setEditingInventory({ ...editingInventory, unit: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Stok Saat Ini</label>
                  <input
                    type="number"
                    required
                    value={editingInventory.currentStock}
                    onChange={e => setEditingInventory({ ...editingInventory, currentStock: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Batas Minimum</label>
                  <input
                    type="number"
                    required
                    value={editingInventory.minStock}
                    onChange={e => setEditingInventory({ ...editingInventory, minStock: Number(e.target.value) })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingInventory(null)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Batal</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: ADJUST STOK (PENERIMAAN / PENGELUARAN) */}
      {adjustingInventory && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAdjustingInventory(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                Penyesuaian Stok: {adjustingInventory.name}
              </h3>
              <button onClick={() => setAdjustingInventory(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExecuteStockAdjustment} className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl flex justify-between items-center text-xs">
                <span className="text-slate-500">Stok Saat Ini:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {adjustingInventory.currentStock} {adjustingInventory.unit}
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Jenis Aksi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustForm({ ...adjustForm, type: 'IN' })}
                    className={cn(
                      "py-2 rounded-xl text-xs font-bold border transition",
                      adjustForm.type === 'IN'
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    )}
                  >
                    + Barang Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustForm({ ...adjustForm, type: 'OUT' })}
                    className={cn(
                      "py-2 rounded-xl text-xs font-bold border transition",
                      adjustForm.type === 'OUT'
                        ? "bg-rose-600 text-white border-rose-600"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    )}
                  >
                    - Pengeluaran
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Jumlah ({adjustingInventory.unit})
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={adjustForm.quantity}
                  onChange={e => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Alasan / Catatan</label>
                <input
                  type="text"
                  placeholder="Contoh: Pembelian baru / Permintaan Kebersihan"
                  value={adjustForm.reason}
                  onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setAdjustingInventory(null)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Batal</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">Terapkan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: HAPUS INVENTORY (IN-APP CONFIRMATION) */}
      {deleteInventoryModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteInventoryModal(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Hapus Item Logistik?</h3>
              <p className="text-slate-500 text-xs mt-1">
                Apakah Anda yakin ingin menghapus item <span className="font-semibold text-slate-800 dark:text-slate-200">{deleteInventoryModal.name}</span> ({deleteInventoryModal.id}) dari Firestore?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setDeleteInventoryModal(null)} className="flex-1 py-2 border rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
                Batal
              </button>
              <button onClick={handleDeleteInventory} className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold">
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AssetsModule = LegacyAssetsModule;

const ProcurementModule = () => {
  const [procurements, setProcurements] = useState(MOCK_PROCUREMENT);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPR, setNewPR] = useState({ item: '', requestor: 'Tata Usaha', estimatedCost: 0, vendor: 'CV. Maju Jaya' });

  const handleCreatePR = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPR.item.trim() || newPR.estimatedCost <= 0) return;

    const prId = `PR-2026-08-${String(procurements.length + 1).padStart(2, '0')}`;
    const added = {
      id: prId,
      item: newPR.item.trim(),
      requestor: newPR.requestor,
      estimatedCost: Number(newPR.estimatedCost),
      status: 'Pending Approval',
      vendor: newPR.vendor
    };

    setProcurements([added, ...procurements]);
    setNewPR({ item: '', requestor: 'Tata Usaha', estimatedCost: 0, vendor: 'CV. Maju Jaya' });
    setIsModalOpen(false);
  };

  const handleToggleStatus = (id: string) => {
    setProcurements(procurements.map(p => {
      if (p.id === id) {
        const nextStatus = p.status.includes('Approved') ? 'Pending Approval' : 'Approved (Kepala GA)';
        return { ...p, status: nextStatus };
      }
      return p;
    }));
  };

  return (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    {isModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FilePlus className="w-5 h-5 text-blue-600" /> Buat E-Purchase Request Baru
            </h3>
            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreatePR} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Barang / Pengadaan</label>
              <input
                type="text"
                required
                placeholder="Contoh: Kertas HVS A4 (50 Rim)"
                value={newPR.item}
                onChange={e => setNewPR({ ...newPR, item: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Divisi Pemohon</label>
              <select
                value={newPR.requestor}
                onChange={e => setNewPR({ ...newPR, requestor: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="Tata Usaha">Tata Usaha</option>
                <option value="Housekeeping">Housekeeping</option>
                <option value="Dapur & Catering">Dapur & Catering</option>
                <option value="Maintenance / Teknisi">Maintenance / Teknisi</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Estimasi Biaya (Rp)</label>
              <input
                type="number"
                required
                placeholder="0"
                value={newPR.estimatedCost || ''}
                onChange={e => setNewPR({ ...newPR, estimatedCost: Number(e.target.value) })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Pilihan Vendor</label>
              <input
                type="text"
                placeholder="Contoh: CV. Maju Jaya"
                value={newPR.vendor}
                onChange={e => setNewPR({ ...newPR, vendor: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">Kirim Permintaan</button>
            </div>
          </form>
        </div>
      </div>
    )}

    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Procurement & Vendor</h3>
      <button
        onClick={() => setIsModalOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition shadow-sm"
      >
        <FilePlus className="w-4 h-4" /> E-Purchase Request
      </button>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <h4 className="font-medium text-slate-700 dark:text-slate-300">Purchase Requests (Approval Workflow)</h4>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Request</th>
              <th className="px-4 py-3 font-medium">Est. Cost</th>
              <th className="px-4 py-3 font-medium">Status / Approval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {procurements.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800 dark:text-slate-200">{p.item}</div>
                  <div className="text-xs text-slate-500">{p.requestor} • {p.vendor}</div>
                </td>
                <td className="px-4 py-3 font-medium">Rp {p.estimatedCost.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleStatus(p.id)}
                    title="Klik untuk ubah persetujuan"
                    className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-full block w-max transition cursor-pointer border",
                    p.status.includes('Approved') ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                    "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                  )}>
                    {p.status}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <h4 className="font-medium text-slate-700 dark:text-slate-300">Database Vendor & Rating</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {VENDORS.map(v => (
            <div key={v.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200">{v.name}</div>
                <div className="text-xs text-slate-500">{v.category} • {v.completedOrders} Orders</div>
              </div>
              <div className="flex items-center gap-1 text-amber-500 font-bold">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm">{v.rating}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  );
};

const FleetModule = () => {
  const [fleet, setFleet] = useState(MOCK_FLEET);
  const [vehicleLogs, setVehicleLogs] = useState(VEHICLE_LOGS);
  const [isBBMModalOpen, setIsBBMModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('Toyota HiAce (B 1234 CD)');
  const [bookings, setBookings] = useState([
    { id: 'BK-001', vehicle: 'Toyota HiAce (B 1234 CD)', user: 'Ust. Rahman (Akademik)', date: '2026-08-12', time: '08:00 - 14:00', purpose: 'Kunjungan Studi Banding', status: 'Approved' },
    { id: 'BK-002', vehicle: 'Ambulans APV (B 9999 RS)', user: 'Tim Medis UKS', date: '2026-08-10', time: '10:00 - 12:00', purpose: 'Rujukan Santri ke RSUD', status: 'In Use' },
  ]);

  const [bbmForm, setBbmForm] = useState({
    vehicle: 'Toyota HiAce (B 1234 CD)',
    date: '2026-08-09',
    purpose: '',
    startOdo: 45085,
    endOdo: 45150,
    bbmCost: 150000,
    driver: 'Pak Yanto'
  });

  const [bookingForm, setBookingForm] = useState({
    vehicle: 'Toyota HiAce (B 1234 CD)',
    user: '',
    date: '2026-08-11',
    time: '08:00 - 12:00',
    purpose: ''
  });

  const lastLog = vehicleLogs.filter(v => v.vehicle === selectedVehicle).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const handleSaveBBM = (e: React.FormEvent) => {
    e.preventDefault();
    if (bbmForm.endOdo < bbmForm.startOdo || bbmForm.bbmCost <= 0) return;

    const newLog = {
      id: `LOG-${String(vehicleLogs.length + 1).padStart(3, '0')}`,
      vehicle: bbmForm.vehicle,
      driver: bbmForm.driver,
      date: bbmForm.date,
      purpose: bbmForm.purpose || 'Operasional Rutin',
      startOdo: Number(bbmForm.startOdo),
      endOdo: Number(bbmForm.endOdo),
      bbmCost: Number(bbmForm.bbmCost)
    };

    setVehicleLogs([newLog, ...vehicleLogs]);
    // update current odo of the vehicle
    setFleet(fleet.map(f => f.name === bbmForm.vehicle ? { ...f, currentOdo: Number(bbmForm.endOdo) } : f));
    setIsBBMModalOpen(false);
  };

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingForm.user.trim() || !bookingForm.purpose.trim()) return;

    const newBk = {
      id: `BK-${String(bookings.length + 1).padStart(3, '0')}`,
      vehicle: bookingForm.vehicle,
      user: bookingForm.user.trim(),
      date: bookingForm.date,
      time: bookingForm.time,
      purpose: bookingForm.purpose.trim(),
      status: 'Scheduled'
    };

    setBookings([newBk, ...bookings]);
    setBookingForm({ vehicle: 'Toyota HiAce (B 1234 CD)', user: '', date: '2026-08-11', time: '08:00 - 12:00', purpose: '' });
    setIsBookingModalOpen(false);
  };

  return (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Fleet & Transport</h3>
      <div className="flex gap-2">
         <button onClick={() => setIsBBMModalOpen(true)} className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition">
          <FileText className="w-4 h-4" /> Input BBM
        </button>
        <button onClick={() => setIsBookingModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition shadow-sm">
          <Calendar className="w-4 h-4" /> Booking Kendaraan
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="grid grid-cols-1 gap-4">
          {fleet.map(f => (
            <div key={f.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col gap-3 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                    <Car className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200">{f.name}</h4>
                    <div className="text-sm text-slate-500">{f.type}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm flex-wrap">
                  <div>
                    <div className="text-slate-500 text-xs">Odometer</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{f.currentOdo.toLocaleString()} Km</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">Next Service</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">{f.nextService}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">Pajak STNK</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">{f.taxDue}</div>
                  </div>
                  <span className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-full border whitespace-nowrap",
                    f.status === 'Available' ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400" :
                    "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400"
                  )}>
                    {f.status}
                  </span>
                </div>
              </div>
              {f.currentOdo >= (f.nextServiceOdo - 500) && (
                <div className={cn("text-xs px-3.5 py-2 rounded-xl flex items-center gap-2",
                  f.currentOdo >= f.nextServiceOdo
                    ? "text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20"
                    : "text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                )}>
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Peringatan: Odometer {f.currentOdo >= f.nextServiceOdo ? 'telah melewati' : 'mendekati'} batas servis <strong>({f.nextServiceOdo.toLocaleString()} Km)</strong>. Segera jadwalkan servis bengkel.</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Jadwal Booking Kendaraan */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Jadwal Peminjaman Kendaraan</h4>
            <span className="text-xs text-slate-500">{bookings.length} Reservasi</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {bookings.map(b => (
              <div key={b.id} className="p-4 flex items-center justify-between text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{b.purpose}</div>
                  <div className="text-xs text-slate-500">{b.vehicle} • Pemohon: {b.user}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{b.date} ({b.time})</div>
                </div>
                <span className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-full",
                  b.status === 'Approved' ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                  b.status === 'In Use' ? "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" :
                  "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                )}>
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Logbook Digital BBM</h4>
          <span className="text-xs text-slate-500">{vehicleLogs.length} Riwayat</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {vehicleLogs.map(v => (
            <div key={v.id} className="p-4 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">{v.driver} • {v.date}</div>
              <div className="text-slate-500 text-xs mb-2">{v.vehicle} - {v.purpose}</div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-mono">KM {v.startOdo} → {v.endOdo} (+{v.endOdo - v.startOdo} km)</span>
                <span className="font-bold text-rose-600">Rp {v.bbmCost.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* BBM Modal */}
    {isBBMModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsBBMModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
             <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" /> Input Logbook BBM
             </h3>
             <button onClick={() => setIsBBMModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
               <X className="w-5 h-5" />
             </button>
          </div>
          <form onSubmit={handleSaveBBM} className="p-6 space-y-4">
             {lastLog && (
               <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-800 dark:text-blue-300">
                 Odo terakhir untuk <strong>{selectedVehicle}</strong>: <strong>{lastLog.endOdo.toLocaleString()} Km</strong> ({lastLog.date})
               </div>
             )}

             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kendaraan</label>
                 <select
                   value={bbmForm.vehicle}
                   onChange={e => {
                     setBbmForm({ ...bbmForm, vehicle: e.target.value });
                     setSelectedVehicle(e.target.value);
                   }}
                   className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                 >
                   <option>Toyota HiAce (B 1234 CD)</option>
                   <option>Ambulans APV (B 9999 RS)</option>
                 </select>
               </div>
               <div>
                 <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tanggal</label>
                 <input
                   type="date"
                   value={bbmForm.date}
                   onChange={e => setBbmForm({ ...bbmForm, date: e.target.value })}
                   className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                 />
               </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Driver</label>
                 <input
                   type="text"
                   value={bbmForm.driver}
                   onChange={e => setBbmForm({ ...bbmForm, driver: e.target.value })}
                   className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                 />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tujuan / Keperluan</label>
                 <input
                   type="text"
                   required
                   placeholder="Contoh: Jemput Santri"
                   value={bbmForm.purpose}
                   onChange={e => setBbmForm({ ...bbmForm, purpose: e.target.value })}
                   className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                 />
               </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Odometer Awal (Km)</label>
                 <input
                   type="number"
                   value={bbmForm.startOdo}
                   onChange={e => setBbmForm({ ...bbmForm, startOdo: Number(e.target.value) })}
                   className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                 />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Odometer Akhir (Km)</label>
                 <input
                   type="number"
                   value={bbmForm.endOdo}
                   onChange={e => setBbmForm({ ...bbmForm, endOdo: Number(e.target.value) })}
                   className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                 />
               </div>
             </div>

             <div>
               <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Biaya BBM (Rp)</label>
               <input
                 type="number"
                 required
                 value={bbmForm.bbmCost}
                 onChange={e => setBbmForm({ ...bbmForm, bbmCost: Number(e.target.value) })}
                 className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
               />
             </div>

             <div className="pt-2 flex justify-end gap-2">
               <button type="button" onClick={() => setIsBBMModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
               <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">Simpan Logbook BBM</button>
             </div>
          </form>
        </div>
      </div>
    )}

    {/* Booking Modal */}
    {isBookingModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsBookingModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" /> Form Reservasi Kendaraan
            </h3>
            <button onClick={() => setIsBookingModalOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreateBooking} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Pilih Kendaraan</label>
              <select
                value={bookingForm.vehicle}
                onChange={e => setBookingForm({ ...bookingForm, vehicle: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option>Toyota HiAce (B 1234 CD)</option>
                <option>Ambulans APV (B 9999 RS)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Pemohon / Divisi</label>
              <input
                type="text"
                required
                placeholder="Contoh: Ust. Rahman / Humas Pesantren"
                value={bookingForm.user}
                onChange={e => setBookingForm({ ...bookingForm, user: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tanggal</label>
                <input
                  type="date"
                  value={bookingForm.date}
                  onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Waktu</label>
                <input
                  type="text"
                  placeholder="08:00 - 14:00"
                  value={bookingForm.time}
                  onChange={e => setBookingForm({ ...bookingForm, time: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tujuan & Keperluan</label>
              <textarea
                rows={3}
                required
                placeholder="Jelaskan rute dan agenda penggunaan armada..."
                value={bookingForm.purpose}
                onChange={e => setBookingForm({ ...bookingForm, purpose: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setIsBookingModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">Jadwalkan</button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
  );
};

const HousekeepingModule = () => {
  const [tasks, setTasks] = useState(MOCK_HOUSEKEEPING);
  const [guestLogs, setGuestLogs] = useState(GUEST_LOGS);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ area: '', task: '', assignee: '', time: '08:00 AM' });
  const [newGuest, setNewGuest] = useState({ name: '', type: 'Wali Santri', purpose: '', timeIn: '09:00' });

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.area.trim() || !newTask.task.trim()) return;

    const added = {
      id: `HK-${String(tasks.length + 1).padStart(3, '0')}`,
      area: newTask.area.trim(),
      task: newTask.task.trim(),
      assignee: newTask.assignee.trim() || 'Staf Kebersihan',
      status: 'Pending',
      time: newTask.time,
      photo: false
    };

    setTasks([added, ...tasks]);
    setNewTask({ area: '', task: '', assignee: '', time: '08:00 AM' });
    setIsTaskModalOpen(false);
  };

  const handleAddGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuest.name.trim() || !newGuest.purpose.trim()) return;

    const added = {
      id: `GST-${String(guestLogs.length + 1).padStart(3, '0')}`,
      name: newGuest.name.trim(),
      type: newGuest.type,
      purpose: newGuest.purpose.trim(),
      timeIn: newGuest.timeIn || new Date().toTimeString().slice(0, 5),
      timeOut: '-',
      status: 'In Area'
    };

    setGuestLogs([added, ...guestLogs]);
    setNewGuest({ name: '', type: 'Wali Santri', purpose: '', timeIn: '09:00' });
    setIsGuestModalOpen(false);
  };

  const handleCheckOutGuest = (id: string) => {
    const nowTime = new Date().toTimeString().slice(0, 5);
    setGuestLogs(guestLogs.map(g => g.id === id ? { ...g, timeOut: nowTime, status: 'Checked Out' } : g));
  };

  const handleToggleTaskStatus = (id: string) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        return { ...t, status: t.status === 'Completed' ? 'Pending' : 'Completed' };
      }
      return t;
    }));
  };

  return (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Housekeeping & Security</h3>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Daily Patrol & Cleaning Checklist</h4>
          <button onClick={() => setIsTaskModalOpen(true)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
            <Plus className="w-3.5 h-3.5" /> Add Task
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {tasks.map(h => (
            <div key={h.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleToggleTaskStatus(h.id)}
                  title="Klik untuk ubah status checklist"
                  className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition cursor-pointer",
                  h.status === 'Completed' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-slate-100 text-slate-400 dark:bg-slate-700 hover:bg-slate-200"
                )}>
                  <CheckSquare className="w-5 h-5" />
                </button>
                <div>
                  <div className={cn("font-semibold text-sm", h.status === 'Completed' ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200")}>{h.task}</div>
                  <div className="text-xs text-slate-500">{h.area} • {h.assignee}</div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <span className="text-xs font-medium text-slate-500">{h.time}</span>
                {h.photo && <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold">Photo Attached</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Sistem Buku Tamu (Guest Log)</h4>
          <button onClick={() => setIsGuestModalOpen(true)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
            <Plus className="w-3.5 h-3.5" /> Add Guest
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {guestLogs.map(g => (
            <div key={g.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{g.name} <span className="text-xs font-normal text-slate-500">({g.type})</span></div>
                <div className="text-xs text-slate-500">Tujuan: {g.purpose}</div>
                <div className="text-xs text-slate-400 mt-1">In: {g.timeIn} | Out: {g.timeOut}</div>
              </div>
              <div className="text-right flex flex-col items-end gap-1.5">
                <span className={cn(
                  "px-2.5 py-0.5 text-xs font-semibold rounded-full",
                  g.status === 'In Area' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                )}>{g.status}</span>
                {g.status === 'In Area' && (
                  <button
                    onClick={() => handleCheckOutGuest(g.id)}
                    className="text-[11px] text-blue-600 hover:underline font-semibold"
                  >
                    Check Out Sekarang
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Add Task Modal */}
    {isTaskModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsTaskModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" /> Tambah Tugas Kebersihan / Patroli
            </h3>
            <button onClick={() => setIsTaskModalOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleAddTask} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Area Lokasi</label>
              <input
                type="text"
                required
                placeholder="Contoh: Asrama Al-Farabi / Masjid Utama"
                value={newTask.area}
                onChange={e => setNewTask({ ...newTask, area: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Tugas</label>
              <input
                type="text"
                required
                placeholder="Contoh: Pembersihan Kamar Mandi Lt 2"
                value={newTask.task}
                onChange={e => setNewTask({ ...newTask, task: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Petugas (Assignee)</label>
                <input
                  type="text"
                  placeholder="Pak Mamat"
                  value={newTask.assignee}
                  onChange={e => setNewTask({ ...newTask, assignee: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Jadwal Jam</label>
                <input
                  type="text"
                  value={newTask.time}
                  onChange={e => setNewTask({ ...newTask, time: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">Simpan Tugas</button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Add Guest Modal */}
    {isGuestModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsGuestModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" /> Registrasi Tamu Baru
            </h3>
            <button onClick={() => setIsGuestModalOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleAddGuest} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Tamu <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                placeholder="Contoh: Bpk. Ridwan"
                value={newGuest.name}
                onChange={e => setNewGuest({ ...newGuest, name: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kategori Tamu</label>
              <select
                value={newGuest.type}
                onChange={e => setNewGuest({ ...newGuest, type: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="Wali Santri">Wali Santri</option>
                <option value="Vendor / Teknisi">Vendor / Teknisi</option>
                <option value="Tamu Kedinasan">Tamu Kedinasan</option>
                <option value="Alumni">Alumni</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tujuan / Kepentingan <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                placeholder="Contoh: Menjenguk anak / Koordinasi Kemenag"
                value={newGuest.purpose}
                onChange={e => setNewGuest({ ...newGuest, purpose: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Waktu Masuk (Time In)</label>
              <input
                type="text"
                value={newGuest.timeIn}
                onChange={e => setNewGuest({ ...newGuest, timeIn: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setIsGuestModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">Catat Tamu</button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
  );
};

const KitchenModule = () => {
  const [kitchenMenus, setKitchenMenus] = useState(MOCK_KITCHEN);
  const [audits, setAudits] = useState(KITCHEN_AUDIT);
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const [newMenu, setNewMenu] = useState({ date: '2026-08-11', meal: 'Makan Siang', menu: '', portions: 1250 });
  const [newAudit, setNewAudit] = useState({ date: '2026-08-10', inspector: 'Tim Higienitas GA', score: '95/100', status: 'Pass', notes: '' });

  const handleAddMenu = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenu.menu.trim()) return;

    const added = {
      id: `MNU-${String(kitchenMenus.length + 1).padStart(3, '0')}`,
      date: newMenu.date,
      meal: newMenu.meal,
      menu: newMenu.menu.trim(),
      portions: Number(newMenu.portions),
      status: 'Planned'
    };

    setKitchenMenus([added, ...kitchenMenus]);
    setNewMenu({ date: '2026-08-11', meal: 'Makan Siang', menu: '', portions: 1250 });
    setIsMenuModalOpen(false);
  };

  const handleAddAudit = (e: React.FormEvent) => {
    e.preventDefault();
    const added = {
      id: `AUD-${String(audits.length + 1).padStart(3, '0')}`,
      date: newAudit.date,
      inspector: newAudit.inspector,
      score: newAudit.score,
      status: newAudit.status,
      notes: newAudit.notes.trim() || 'Pemeriksaan sanitasi rutin selesai.'
    };

    setAudits([added, ...audits]);
    setNewAudit({ date: '2026-08-10', inspector: 'Tim Higienitas GA', score: '95/100', status: 'Pass', notes: '' });
    setIsAuditModalOpen(false);
  };

  return (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Catering & Kitchen</h3>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Manajemen Menu & Porsi Makanan</h4>
          <button
            onClick={() => setIsMenuModalOpen(true)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Menu
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Tanggal / Sesi</th>
              <th className="px-4 py-3 font-medium">Daftar Menu</th>
              <th className="px-4 py-3 font-medium">Porsi (Kalkulator)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {kitchenMenus.map(k => (
              <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{k.date}</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">{k.meal}</div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">{k.menu}</td>
                <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    {k.portions.toLocaleString()} pax
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Inspeksi Higienitas & Sanitasi</h4>
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" /> New Audit
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {audits.map(a => (
            <div key={a.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Audit {a.date}</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">{a.status}</span>
              </div>
              <div className="flex items-center gap-4 text-xs mb-2">
                <div className="text-slate-500">Skor: <span className="font-bold text-slate-800 dark:text-slate-200">{a.score}</span></div>
                <div className="text-slate-500">Auditor: {a.inspector}</div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                {a.notes}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Menu Modal */}
    {isMenuModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsMenuModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Coffee className="w-5 h-5 text-blue-600" /> Tambah Menu Dapur Baru
            </h3>
            <button onClick={() => setIsMenuModalOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleAddMenu} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tanggal</label>
                <input
                  type="date"
                  value={newMenu.date}
                  onChange={e => setNewMenu({ ...newMenu, date: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Sesi Makan</label>
                <select
                  value={newMenu.meal}
                  onChange={e => setNewMenu({ ...newMenu, meal: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="Sarapan Pagi">Sarapan Pagi</option>
                  <option value="Makan Siang">Makan Siang</option>
                  <option value="Makan Malam">Makan Malam</option>
                  <option value="Snack / Ekstra">Snack / Ekstra</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Daftar Menu Makanan</label>
              <textarea
                rows={3}
                required
                placeholder="Contoh: Nasi, Soto Ayam Lamongan, Telur Rebus, Kerupuk..."
                value={newMenu.menu}
                onChange={e => setNewMenu({ ...newMenu, menu: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Target Porsi Santri (Pax)</label>
              <input
                type="number"
                value={newMenu.portions}
                onChange={e => setNewMenu({ ...newMenu, portions: Number(e.target.value) })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setIsMenuModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">Simpan Menu</button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Audit Modal */}
    {isAuditModalOpen && (
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsAuditModalOpen(false)}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Catat Hasil Inspeksi Sanitasi
            </h3>
            <button onClick={() => setIsAuditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleAddAudit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Tanggal</label>
                <input
                  type="date"
                  value={newAudit.date}
                  onChange={e => setNewAudit({ ...newAudit, date: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Hasil Kelayakan</label>
                <select
                  value={newAudit.status}
                  onChange={e => setNewAudit({ ...newAudit, status: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="Pass">Pass (Layak)</option>
                  <option value="Conditional">Conditional (Perlu Perbaikan)</option>
                  <option value="Fail">Fail (Tidak Layak)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Auditor / Tim Inspeksi</label>
              <input
                type="text"
                value={newAudit.inspector}
                onChange={e => setNewAudit({ ...newAudit, inspector: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Skor Sanitasi (Contoh: 95/100)</label>
              <input
                type="text"
                value={newAudit.score}
                onChange={e => setNewAudit({ ...newAudit, score: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Catatan Higienitas</label>
              <textarea
                rows={3}
                placeholder="Catatan kebersihan area dapur, alat makan, dan sanitasi..."
                value={newAudit.notes}
                onChange={e => setNewAudit({ ...newAudit, notes: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setIsAuditModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium text-slate-600">Batal</button>
              <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl">Simpan Audit</button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
  );
};


// --- DEFAULT MASTER DATA SEED ---
const DEFAULT_GA_MASTER_ITEMS = [
  // Kategori Asset
  { id: 'md-ast-1', name: 'Elektronik & Multimedia', category: 'Kategori Asset', code: 'AST-ELK', description: 'Laptop, PC, Proyektor, Sound System', status: 'Active' },
  { id: 'md-ast-2', name: 'Mebel & Interior', category: 'Kategori Asset', code: 'AST-MBL', description: 'Meja santri, lemari, kursi, ranjang tingkat', status: 'Active' },
  { id: 'md-ast-3', name: 'Perlengkapan Sanitasi & Air', category: 'Kategori Asset', code: 'AST-SAN', description: 'Toren, pompa air, filter air, kran', status: 'Active' },
  { id: 'md-ast-4', name: 'Mesin & Kelistrikan', category: 'Kategori Asset', code: 'AST-ENG', description: 'Genset 50kVA, panel listrik, stabilizer', status: 'Active' },
  { id: 'md-ast-5', name: 'Peralatan Dapur & Catering', category: 'Kategori Asset', code: 'AST-KIT', description: 'Kompor mawar, freezer, rice cooker jumbo', status: 'Active' },

  // Lokasi Ruangan
  { id: 'md-loc-1', name: 'Gedung A - Ruang Kelas X-A', category: 'Lokasi Ruangan', code: 'LOC-GA-X1', description: 'Kapasitas 35 santri, Lantai 1 Gedung A', status: 'Active' },
  { id: 'md-loc-2', name: 'Lab Komputer 1', category: 'Lokasi Ruangan', code: 'LOC-LB-01', description: 'Kapasitas 40 PC, Lantai 2 Gedung B', status: 'Active' },
  { id: 'md-loc-3', name: 'Asrama Al-Farabi Lt 2', category: 'Lokasi Ruangan', code: 'LOC-ASR-F2', description: 'Kapasitas 60 santri, 12 kamar', status: 'Active' },
  { id: 'md-loc-4', name: 'Dapur Utama & Kantin', category: 'Lokasi Ruangan', code: 'LOC-KIT-01', description: 'Area operasional konsumsi santri & asatidz', status: 'Active' },
  { id: 'md-loc-5', name: 'Pos Satpam & Gerbang Utama', category: 'Lokasi Ruangan', code: 'LOC-SEC-01', description: 'Akses masuk dan pos jaga 24 jam', status: 'Active' },

  // Data Vendor
  { id: 'md-vnd-1', name: 'CV. Maju Jaya Mandiri', category: 'Data Vendor', code: 'VND-ATK-01', description: 'Suplier Kertas HVS & ATK Kantor, 08123456789', status: 'Active' },
  { id: 'md-vnd-2', name: 'Toko Makmur Sanitasi', category: 'Data Vendor', code: 'VND-CL-02', description: 'Suplier Bahan Pembersih & Housekeeping', status: 'Active' },
  { id: 'md-vnd-3', name: 'PT Surya Elektrik Gemilang', category: 'Data Vendor', code: 'VND-EL-03', description: 'Maintenance AC, Genset & Instalasi Listrik', status: 'Active' },
  { id: 'md-vnd-4', name: 'Katering Berkah Barokah', category: 'Data Vendor', code: 'VND-CAT-04', description: 'Suplier Bahan Pokok & Sembako Dapur', status: 'Active' },

  // Kendaraan
  { id: 'md-vhc-1', name: 'Toyota HiAce Commuter (B 1234 CD)', category: 'Kendaraan', code: 'VHC-BUS-01', description: 'Bus Operasional Santri & Tamu, Driver Pak Yanto', status: 'Active' },
  { id: 'md-vhc-2', name: 'Suzuki APV Ambulans (B 9999 RS)', category: 'Kendaraan', code: 'VHC-AMB-01', description: 'Ambulans Tanggap Darurat UKS Pesantren', status: 'Active' },
  { id: 'md-vhc-3', name: 'Honda Supra X 125 (B 5678 EF)', category: 'Kendaraan', code: 'VHC-MTR-01', description: 'Motor Kurir TU & General Affair', status: 'Active' },

  // Data Menu Dapur
  { id: 'md-mnu-1', name: 'Menu A: Nasi, Ayam Goreng Lengkuas, Sayur Sop, Tempe', category: 'Data Menu Dapur', code: 'MNU-MGG-01', description: 'Paket Makan Siang Santri (1.250 porsi)', status: 'Active' },
  { id: 'md-mnu-2', name: 'Menu B: Nasi, Telur Balado, Tumis Buncis Jagung, Tahu', category: 'Data Menu Dapur', code: 'MNU-MGG-02', description: 'Paket Makan Malam Santri (1.250 porsi)', status: 'Active' },
  { id: 'md-mnu-3', name: 'Menu C: Bubur Kacang Hijau + Roti Tawar', category: 'Data Menu Dapur', code: 'MNU-SAR-01', description: 'Menu Sarapan Pagi Santri & Asatidz', status: 'Active' },

  // Kategori Tiket
  { id: 'md-tkt-1', name: 'Listrik & Pendingin Ruangan (AC)', category: 'Kategori Tiket', code: 'CAT-TKT-AC', description: 'Kerusakan AC, lampu mati, saklar konslet', status: 'Active' },
  { id: 'md-tkt-2', name: 'Plumbing (Air & Pembuangan)', category: 'Kategori Tiket', code: 'CAT-TKT-PLM', description: 'Kran bocor, toren kosong, saluran tersumbat', status: 'Active' },
  { id: 'md-tkt-3', name: 'Sipil & Bangunan', category: 'Kategori Tiket', code: 'CAT-TKT-CIV', description: 'Pintu rusak, genteng bocor, dinding retak', status: 'Active' },
  { id: 'md-tkt-4', name: 'IT & Jaringan Internet', category: 'Kategori Tiket', code: 'CAT-TKT-IT', description: 'WiFi asrama mati, printer TU error, PC lab', status: 'Active' },
];

const MasterDataGA = () => {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>(DEFAULT_GA_MASTER_ITEMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', code: '', description: '', status: 'Active' });
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<any | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  useEffect(() => {
    try {
      const q = tenantScopedQuery(collection(db, 'master_data'), user?.tenantId);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const remoteData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
          remoteData.sort((a: any, b: any) => {
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tB - tA;
          });
          // Merge with default seed if some categories have no remote items
          const existingCategories = new Set(remoteData.map((d: any) => d.category));
          const supplementary = DEFAULT_GA_MASTER_ITEMS.filter(d => !existingCategories.has(d.category));
          setItems([...remoteData, ...supplementary]);
        } else {
          setItems(DEFAULT_GA_MASTER_ITEMS);
        }
      }, (error) => {
        console.warn("Firestore sync warning, using local state:", error);
      });
      return () => unsubscribe();
    } catch (e: any) {
      console.warn("Firestore listener init fallback:", e);
    }
  }, [user?.tenantId, user?.uid]);

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItem.name.trim() || !activeCategory) return;

    const code = newItem.code.trim() || `GA-${Date.now().toString().slice(-4)}`;
    const newItemObj = {
      name: newItem.name.trim(),
      category: activeCategory,
      code,
      description: newItem.description.trim() || '-',
      status: newItem.status || 'Active',
      createdAt: new Date().toISOString()
    };

    try {
      const docRef = await addDoc(collection(db, 'master_data'), tenantRecord(user?.tenantId, {
        ...newItemObj,
        createdAt: serverTimestamp()
      }));
      setItems(prev => [{ id: docRef.id, ...newItemObj }, ...prev]);
      showNotification(`Berhasil menambahkan data ke "${activeCategory}"`);
    } catch (err) {
      // Local fallback
      const localId = `local-${Date.now()}`;
      setItems(prev => [{ id: localId, ...newItemObj }, ...prev]);
      showNotification(`Data berhasil disimpan (mode lokal)`, 'success');
    }

    setNewItem({ name: '', code: '', description: '', status: 'Active' });
    setIsAddModalOpen(false);
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingItem || !editingItem.name.trim()) return;

    try {
      if (!editingItem.id.startsWith('local-') && !editingItem.id.startsWith('md-')) {
        await updateDoc(doc(db, 'master_data', editingItem.id), {
          name: editingItem.name.trim(),
          code: editingItem.code || '',
          description: editingItem.description || '',
          status: editingItem.status || 'Active'
        });
      }
      setItems(prev => prev.map(item => item.id === editingItem.id ? { ...editingItem } : item));
      showNotification('Perubahan data berhasil disimpan');
    } catch (err) {
      setItems(prev => prev.map(item => item.id === editingItem.id ? { ...editingItem } : item));
      showNotification('Perubahan disimpan di sesi lokal');
    }
    setEditingItem(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmItem) return;
    const targetId = deleteConfirmItem.id;
    try {
      if (!targetId.startsWith('local-') && !targetId.startsWith('md-')) {
        await deleteDoc(doc(db, 'master_data', targetId));
      }
      setItems(prev => prev.filter(item => item.id !== targetId));
      showNotification(`Item "${deleteConfirmItem.name}" berhasil dihapus`);
    } catch (err) {
      setItems(prev => prev.filter(item => item.id !== targetId));
      showNotification(`Item dihapus dari tampilan`, 'success');
    }
    setDeleteConfirmItem(null);
  };

  const handleResetToDefault = () => {
    setItems(DEFAULT_GA_MASTER_ITEMS);
    showNotification('Master data berhasil diatur ulang ke data bawaan');
  };

  const handleExportCSV = () => {
    const targetData = activeCategory ? items.filter(i => i.category === activeCategory) : items;
    if (targetData.length === 0) {
      showNotification('Tidak ada data untuk diekspor', 'error');
      return;
    }
    const headers = ['ID', 'Kategori', 'Kode', 'Nama', 'Deskripsi / Detail', 'Status'];
    const rows = targetData.map(d => [
      `"${d.id || ''}"`,
      `"${d.category || ''}"`,
      `"${d.code || ''}"`,
      `"${(d.name || '').replace(/"/g, '""')}"`,
      `"${(d.description || '').replace(/"/g, '""')}"`,
      `"${d.status || 'Active'}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GA_MasterData_${activeCategory ? activeCategory.replace(/\s+/g, '_') : 'Semua'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Export CSV berhasil diunduh');
  };

  const categories = [
    { title: "Kategori Asset", count: items.filter(i => i.category === 'Kategori Asset').length, icon: QrCode, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400", desc: "Kelompok inventaris & aset tetap" },
    { title: "Lokasi Ruangan", count: items.filter(i => i.category === 'Lokasi Ruangan').length, icon: MapPin, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400", desc: "Ruang kelas, asrama, lab & kantor" },
    { title: "Data Vendor", count: items.filter(i => i.category === 'Data Vendor').length, icon: Users, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400", desc: "Mitra supplier, kontraktor & teknisi" },
    { title: "Kendaraan", count: items.filter(i => i.category === 'Kendaraan').length, icon: Car, color: "text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400", desc: "Armada bus santri, ambulans & motor" },
    { title: "Data Menu Dapur", count: items.filter(i => i.category === 'Data Menu Dapur').length, icon: Coffee, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400", desc: "Koleksi paket menu makan & porsi" },
    { title: "Kategori Tiket", count: items.filter(i => i.category === 'Kategori Tiket').length, icon: Tag, color: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400", desc: "Klasifikasi pengaduan & maintenance" }
  ];

  const filteredCategoryItems = items.filter(i => {
    if (activeCategory && i.category !== activeCategory) return false;
    if (!searchQuery) return true;
    const queryLower = searchQuery.toLowerCase();
    return (
      (i.name && i.name.toLowerCase().includes(queryLower)) ||
      (i.code && i.code.toLowerCase().includes(queryLower)) ||
      (i.description && i.description.toLowerCase().includes(queryLower))
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Notifications */}
      {feedbackMsg && (
        <div className={cn(
          "p-4 rounded-xl text-sm flex items-center justify-between border shadow-sm animate-in slide-in-from-top-2",
          feedbackMsg.type === 'success'
            ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
            : "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300"
        )}>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Master Data General Affair
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">Kelola kategori, ruangan, suplier, kendaraan, menu, dan jenis aduan secara terpusat.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
            title="Download CSV"
          >
            <FileText className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handleResetToDefault}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
            title="Pulihkan data standar"
          >
            <CheckCircle className="w-4 h-4" /> Pulihkan Default
          </button>
          {activeCategory && (
            <button
              onClick={() => { setActiveCategory(null); setSearchQuery(''); }}
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium rounded-lg flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Semua Kategori
            </button>
          )}
        </div>
      </div>

      {!activeCategory ? (
        /* Category Cards Overview */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((item, idx) => (
            <div
              key={idx}
              onClick={() => { setActiveCategory(item.title); setSearchQuery(''); }}
              className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer group shadow-sm hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105", item.color)}>
                    <item.icon className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-900/40 dark:group-hover:text-blue-300 transition-colors">
                    {item.count} Record
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
                <span>Buka & Kelola Data</span>
                <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Category Detail Table View */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm animate-in slide-in-from-right-4">
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setActiveCategory(null); setSearchQuery(''); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                title="Kembali"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">Daftar {activeCategory}</h4>
                <p className="text-xs text-slate-500">Menampilkan {filteredCategoryItems.length} dari {items.filter(i => i.category === activeCategory).length} entri</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, kode, detail..."
                  className="pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 w-full sm:w-64 shadow-sm"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" /> Tambah Data
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 w-12 text-center">No</th>
                  <th className="px-5 py-3.5">Kode</th>
                  <th className="px-5 py-3.5">Nama & Rincian</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCategoryItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Info className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        <p className="font-medium text-slate-600 dark:text-slate-400">Tidak ada data ditemukan untuk {activeCategory}.</p>
                        <button
                          onClick={() => setIsAddModalOpen(true)}
                          className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                        >
                          + Tambah data baru sekarang
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCategoryItems.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-5 py-4 text-center font-mono text-xs text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs font-medium text-blue-600 dark:text-blue-400">
                        <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                          {item.code || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 max-w-md truncate">{item.description || '-'}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          "px-2.5 py-0.5 text-xs font-semibold rounded-full",
                          item.status === 'Active' || !item.status
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        )}>
                          {item.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingItem({ ...item })}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            title="Edit Data"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmItem(item)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                            title="Hapus Data"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" /> Tambah Data ({activeCategory})
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Item / Entri <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newItem.name}
                  onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder={`Contoh: Nama ${activeCategory}...`}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kode Identifikasi</label>
                <input
                  type="text"
                  value={newItem.code}
                  onChange={e => setNewItem({ ...newItem, code: e.target.value })}
                  placeholder="Contoh: AST-001, LOC-GA, dsb"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Deskripsi / Detail Tambahan</label>
                <textarea
                  rows={3}
                  value={newItem.description}
                  onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="Keterangan spesifikasi, kontak, lokasi, atau informasi relevan..."
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Status</label>
                <select
                  value={newItem.status}
                  onChange={e => setNewItem({ ...newItem, status: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                >
                  <option value="Active">Active (Aktif Digunakan)</option>
                  <option value="Inactive">Inactive (Non-aktif / Arsip)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-sm"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingItem(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" /> Edit Data ({editingItem.category})
              </h3>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Nama Item <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Kode Identifikasi</label>
                <input
                  type="text"
                  value={editingItem.code || ''}
                  onChange={e => setEditingItem({ ...editingItem, code: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Deskripsi / Detail</label>
                <textarea
                  rows={3}
                  value={editingItem.description || ''}
                  onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Status</label>
                <select
                  value={editingItem.status || 'Active'}
                  onChange={e => setEditingItem({ ...editingItem, status: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                >
                  <option value="Active">Active (Aktif Digunakan)</option>
                  <option value="Inactive">Inactive (Non-aktif / Arsip)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation In-App Modal (Safe for iFrame!) */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirmItem(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-center text-slate-900 dark:text-white mb-2">Konfirmasi Hapus Data</h4>
            <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-6">
              Apakah Anda yakin ingin menghapus <strong>"{deleteConfirmItem.name}"</strong>? Tindakan ini akan menghapus data dari master list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm rounded-xl transition shadow-sm"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export function GeneralAffairManagerLegacy() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'master' | 'maintenance' | 'assets' | 'procurement' | 'fleet' | 'housekeeping' | 'kitchen'>('maintenance');

  const TABS = [
    { id: 'master', label: 'Master Data', icon: Database },
    { id: 'maintenance', label: 'Ticketing & Maintenance', icon: MaintenanceIcon },
    { id: 'assets', label: 'Assets & Inventory', icon: QrCode },
    { id: 'procurement', label: 'Procurement', icon: ShoppingCart },
    { id: 'fleet', label: 'Fleet & Logistik', icon: Truck },
    { id: 'housekeeping', label: 'Housekeeping', icon: ClipboardList },
    { id: 'kitchen', label: 'Kitchen & Catering', icon: Coffee },
  ] as const;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">General Affair</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage facilities, assets, procurement, fleet, security, and kitchen operations.</p>
        </div>
      </div>

      <ERPTabs
        tabs={TABS.map(tab => ({ id: tab.id, label: tab.label, icon: <tab.icon className="w-4 h-4" /> }))}
        value={activeTab}
        onChange={(id) => setActiveTab(id as any)}
        ariaLabel="Navigasi General Affair"
      />

      <div className="min-h-[500px]">
        {activeTab === 'master' && <MasterDataGA />}
        {activeTab === 'maintenance' && <TicketsModule />}
        {activeTab === 'assets' && <AssetsModule />}
        {activeTab === 'procurement' && <ProcurementModule />}
        {activeTab === 'fleet' && <FleetModule />}
        {activeTab === 'housekeeping' && <HousekeepingModule />}
        {activeTab === 'kitchen' && <KitchenModule />}
      </div>
    </div>
  );
}
