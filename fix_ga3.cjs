const fs = require('fs');
const content = `import React, { useState } from 'react';
import { 
  Plus, Search, Filter, ShieldCheck, 
  Wrench as MaintenanceIcon, ClipboardList, CheckSquare, Coffee, Truck, ShoppingCart, Users,
  Clock, Package, Star, Calendar, FilePlus, Printer, QrCode, CheckCircle, Tag, Car
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

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
  { id: 'PR-2026-08-02', item: 'Sapu Lidi (100 Pcs)', requestor: 'Housekeeping', estimatedCost: 1500000, status: 'Approved', vendor: 'Toko Makmur' },
];

const VENDORS = [
  { id: 'VND-001', name: 'CV. Maju Jaya', category: 'ATK', rating: 4.8, completedOrders: 15 },
  { id: 'VND-002', name: 'Toko Makmur', category: 'Kebersihan', rating: 4.5, completedOrders: 8 },
];

const MOCK_FLEET = [
  { id: 'VHC-001', name: 'Toyota HiAce (B 1234 CD)', type: 'Bus Santri', status: 'Available', nextService: '2026-09-10', taxDue: '2027-01-15' },
  { id: 'VHC-002', name: 'Ambulans APV (B 9999 RS)', type: 'Ambulance', status: 'In Use', nextService: '2026-08-20', taxDue: '2026-11-05' },
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
const TicketsModule = () => (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Maintenance & Ticketing</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage facility issues and preventive maintenance</p>
      </div>
      <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm">
        <Plus className="w-4 h-4" /> Report Issue
      </button>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Active Tickets</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {MOCK_TICKETS.map(t => (
            <div key={t.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex justify-between mb-2">
                <span className="font-medium text-slate-900 dark:text-white">{t.title}</span>
                <span className={cn(
                  "px-2.5 py-0.5 text-xs font-medium rounded-full",
                  t.status === 'Open' ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400" :
                  t.status === 'In Progress' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                )}>{t.status}</span>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t.location} &bull; Rep: {t.reporter}</div>
              <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                <span className="bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded">Assigned: {t.assignedTo}</span>
                <span>{t.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Preventive Maintenance</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {PREVENTIVE_SCHEDULES.map(p => (
            <div key={p.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex justify-between items-center">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{p.task}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Schedule: {p.schedule}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Due: <span className="font-semibold text-rose-500">{p.nextDue}</span></div>
              </div>
              <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors">Complete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const AssetsModule = () => (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Assets & Inventory</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage fixed assets and stock logistics</p>
      </div>
      <div className="flex gap-2">
        <button className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors">
          <QrCode className="w-4 h-4" /> Opname
        </button>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Add Asset
        </button>
      </div>
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
       <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Fixed Assets</h4>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Asset Details</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_ASSETS.map(a => (
              <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{a.id}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-white">{a.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{a.location} &bull; {a.pic}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <Printer className="w-4 h-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
       </div>
       
       <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Stock Alerts</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {STOCK_ITEMS.map(s => (
            <div key={s.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{s.name}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Min: {s.minStock} {s.unit}</div>
              </div>
              <div className="text-right">
                <div className={cn(
                  "text-lg font-bold",
                  s.status === 'Low Stock' ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-200"
                )}>{s.currentStock} <span className="text-sm font-normal text-slate-500">{s.unit}</span></div>
                {s.status === 'Low Stock' && <span className="text-[10px] uppercase tracking-wider text-rose-500 font-bold bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded">Reorder</span>}
              </div>
            </div>
          ))}
        </div>
       </div>
    </div>
  </div>
);

const ProcurementModule = () => (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Procurement</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage purchasing requests and vendors</p>
      </div>
      <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm">
        <FilePlus className="w-4 h-4" /> New Request
      </button>
    </div>
    
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Purchase Requests</h4>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 font-semibold">Item & Details</th>
              <th className="px-4 py-3 font-semibold">Estimated Cost</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_PROCUREMENT.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-white">{p.item}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.requestor} &bull; {p.vendor}</div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                  Rp {p.estimatedCost.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-full block w-max",
                    p.status.includes('Approved') ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                  )}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Vendor Directory</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {VENDORS.map(v => (
            <div key={v.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{v.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{v.category} &bull; {v.completedOrders} Orders</div>
              </div>
              <div className="flex items-center gap-1 text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span className="font-bold text-xs">{v.rating}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const FleetModule = () => (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Fleet Management</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage vehicles, bookings, and fuel logs</p>
      </div>
      <div className="flex gap-2">
         <button className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors">
          <ClipboardList className="w-4 h-4" /> BBM Log
        </button>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm">
          <Calendar className="w-4 h-4" /> Book Vehicle
        </button>
      </div>
    </div>
    
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 grid grid-cols-1 gap-4">
        {MOCK_FLEET.map(f => (
          <div key={f.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20">
                <Car className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">{f.name}</h4>
                <div className="text-sm text-slate-500 dark:text-slate-400">{f.type}</div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="hidden sm:block">
                <div className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Next Service</div>
                <div className="font-medium text-slate-900 dark:text-white">{f.nextService}</div>
              </div>
              <div className="hidden sm:block">
                <div className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Tax Due</div>
                <div className="font-medium text-slate-900 dark:text-white">{f.taxDue}</div>
              </div>
              <span className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full border",
                f.status === 'Available' ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400" :
                "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400"
              )}>
                {f.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Fuel & Trip Logs</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {VEHICLE_LOGS.map(v => (
            <div key={v.id} className="p-4 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="font-medium text-slate-900 dark:text-white mb-0.5">{v.driver} &bull; <span className="text-slate-500 font-normal">{v.date}</span></div>
              <div className="text-slate-500 dark:text-slate-400 text-xs mb-3 bg-slate-100 dark:bg-slate-800 inline-block px-2 py-0.5 rounded">{v.vehicle}</div>
              <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-600 dark:text-slate-400">Odo: {v.startOdo} - {v.endOdo}</span>
                <span className="font-bold text-slate-900 dark:text-white">Rp {v.bbmCost.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const HousekeepingModule = () => (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center mb-4">
       <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Housekeeping & Security</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage daily cleaning patrols and guest logs</p>
      </div>
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Daily Patrol Checklist</h4>
          <button className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">Add Task</button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {MOCK_HOUSEKEEPING.map(h => (
            <div key={h.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center border",
                  h.status === 'Completed' 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400" 
                    : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700"
                )}>
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">{h.task}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{h.area} &bull; {h.assignee}</div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1.5">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{h.time}</span>
                {h.photo && <span className="text-[10px] uppercase tracking-wider font-bold text-blue-600 dark:text-blue-400">Photo Attached</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Guest Logs</h4>
          <button className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">Add Guest</button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {GUEST_LOGS.map(g => (
            <div key={g.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{g.name} <span className="text-xs font-normal text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded ml-1">{g.type}</span></div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Purpose: {g.purpose}</div>
              </div>
              <div className="text-right flex flex-col items-end gap-1 text-sm">
                <div className="flex gap-2 text-xs font-mono">
                  <span className="text-emerald-600 dark:text-emerald-400">In: {g.timeIn}</span>
                  <span className="text-slate-400">Out: {g.timeOut}</span>
                </div>
                <span className={cn(
                  "px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-sm mt-1",
                  g.status === 'In Area' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                )}>{g.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const KitchenModule = () => (
  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Kitchen & Catering</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage daily menus and hygiene audits</p>
      </div>
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Menu Planning</h4>
          <button className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">Add Menu</button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 font-semibold">Date / Session</th>
              <th className="px-4 py-3 font-semibold">Menu Items</th>
              <th className="px-4 py-3 font-semibold">Portions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_KITCHEN.map(k => (
              <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-4">
                  <div className="font-medium text-slate-900 dark:text-white">{k.date}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{k.meal}</div>
                </td>
                <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{k.menu}</td>
                <td className="px-4 py-4 font-medium text-slate-900 dark:text-white">
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
      
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h4 className="font-semibold text-slate-800 dark:text-slate-200">Hygiene Audits</h4>
          <button className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">New Audit</button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {KITCHEN_AUDIT.map(a => (
            <div key={a.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-slate-900 dark:text-white">Audit {a.date}</span>
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">{a.status}</span>
              </div>
              <div className="flex items-center gap-4 text-sm mb-3">
                <div className="text-slate-500 dark:text-slate-400">Score: <span className="font-bold text-slate-900 dark:text-white">{a.score}</span></div>
                <div className="text-slate-500 dark:text-slate-400">By: {a.inspector}</div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                "{a.notes}"
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export function GeneralAffairManager() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'maintenance' | 'assets' | 'procurement' | 'fleet' | 'housekeeping' | 'kitchen'>('maintenance');

  const TABS = [
    { id: 'maintenance', label: 'Ticketing & Maintenance', icon: MaintenanceIcon },
    { id: 'assets', label: 'Assets & Inventory', icon: QrCode },
    { id: 'procurement', label: 'Procurement', icon: ShoppingCart },
    { id: 'fleet', label: 'Fleet & Logistik', icon: Truck },
    { id: 'housekeeping', label: 'Housekeeping', icon: ClipboardList },
    { id: 'kitchen', label: 'Kitchen & Catering', icon: Coffee },
  ] as const;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
              General Affair Manager
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage facilities, assets, procurement, fleet, security, and kitchen operations.</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-6 mt-6 overflow-x-auto hide-scrollbar">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 pb-3 text-sm font-medium transition-colors relative whitespace-nowrap",
                  isActive 
                    ? "text-emerald-600 dark:text-emerald-400" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 dark:bg-emerald-400 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'maintenance' && <TicketsModule />}
          {activeTab === 'assets' && <AssetsModule />}
          {activeTab === 'procurement' && <ProcurementModule />}
          {activeTab === 'fleet' && <FleetModule />}
          {activeTab === 'housekeeping' && <HousekeepingModule />}
          {activeTab === 'kitchen' && <KitchenModule />}
        </div>
      </div>
    </div>
  );
}
`;
fs.writeFileSync('src/pages/GeneralAffairManager.tsx', content);
