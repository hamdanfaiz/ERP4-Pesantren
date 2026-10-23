import React, { useState } from 'react';
import { Users, Search, Plus, Mail, Phone, MoreHorizontal } from 'lucide-react';
import { Donor } from '../types';

export function DonationDonors() {
  const [donors, setDonors] = useState<Donor[]>([
    {
      id: "d1",
      name: "Bapak H. Ahmad Subarjo",
      phone: "081234567890",
      email: "ahmad.subarjo@email.com",
      type: "Regular",
      totalDonated: 25000000,
      lastDonationDate: "2026-05-15"
    },
    {
      id: "d2",
      name: "Ibu Hj. Siti Aminah",
      phone: "081298765432",
      email: "siti.aminah@email.com",
      type: "Regular",
      totalDonated: 15000000,
      lastDonationDate: "2026-06-01"
    },
    {
      id: "d3",
      name: "PT Bintang Sejahtera",
      phone: "0217654321",
      email: "csr@bintang.co.id",
      type: "Occasional",
      totalDonated: 100000000,
      lastDonationDate: "2025-12-20"
    }
  ]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center">
         <div>
           <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">Donor Directory</h2>
           <p className="text-sm text-slate-500 dark:text-slate-400">Kelola data donatur, pantau kontribusi, dan jaga keterlibatan</p>
         </div>
         <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
           <Plus className="w-4 h-4" /> Add Donor
         </button>
      </div>

      <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-black/40 text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-white/5">
            <tr>
              <th className="px-6 py-4 font-medium">Nama Donatur</th>
              <th className="px-6 py-4 font-medium">Contact</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Total Donated</th>
              <th className="px-6 py-4 font-medium">Last Activity</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm">
            {donors.map(donor => (
              <tr key={donor.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-800 dark:text-slate-200">{donor.name}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {donor.phone}</span>
                    <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {donor.email}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider ${
                    donor.type === 'Regular' ? 'bg-emerald-500/10 text-emerald-400' : 
                    donor.type === 'Prospect' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                  }`}>
                    {donor.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-indigo-400 font-medium">
                  Rp {(donor.totalDonated).toLocaleString('id-ID')}
                </td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                  {donor.lastDonationDate || '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
