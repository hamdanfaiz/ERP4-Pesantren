import React, { useState } from 'react';
import { LayoutList, Search, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';
import { Transaction } from '../types';

export function DonationTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: "trx1",
      donorId: "d1",
      donorName: "Bapak H. Ahmad Subarjo",
      campaignId: "c1",
      campaignTitle: "Pembangunan Masjid As-Salam",
      amount: 5000000,
      date: "2026-06-02",
      method: "Transfer",
      status: "Success"
    },
    {
      id: "trx2",
      donorId: "d2",
      donorName: "Ibu Hj. Siti Aminah",
      campaignId: "c2",
      campaignTitle: "Beasiswa Santri Yatim",
      amount: 1500000,
      date: "2026-06-01",
      method: "QRIS",
      status: "Success"
    },
    {
      id: "trx3",
      donorId: "anon",
      donorName: "Hamba Allah",
      campaignId: "c1",
      campaignTitle: "Pembangunan Masjid As-Salam",
      amount: 500000,
      date: "2026-06-01",
      method: "Transfer",
      status: "Pending"
    }
  ]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center">
         <div>
           <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">Transaction History</h2>
           <p className="text-sm text-slate-500 dark:text-slate-400">Track incoming waqf and donation payments</p>
         </div>
         <button className="bg-slate-50 dark:bg-[#0a0a0a]  hover:bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
           <Filter className="w-4 h-4" /> Filter
         </button>
      </div>

      <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-black/40 text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-white/5">
            <tr>
              <th className="px-6 py-4 font-medium">Transaction ID</th>
              <th className="px-6 py-4 font-medium">Donor & Campaign</th>
              <th className="px-6 py-4 font-medium">Date</th>
              <th className="px-6 py-4 font-medium">Method</th>
              <th className="px-6 py-4 font-medium text-right">Amount</th>
              <th className="px-6 py-4 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm">
            {transactions.map(trx => (
              <tr key={trx.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-slate-500">
                  {trx.id.toUpperCase()}
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-800 dark:text-slate-200">{trx.donorName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{trx.campaignTitle}</div>
                </td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                  {trx.date}
                </td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs text-center sm:text-left">
                  <span className="bg-slate-100 dark:bg-white/5 px-2 py-1 rounded">
                    {trx.method}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="text-emerald-400 font-medium flex items-center justify-end gap-1">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Rp {(trx.amount).toLocaleString('id-ID')}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider inline-block ${
                    trx.status === 'Success' ? 'bg-emerald-500/10 text-emerald-400' : 
                    trx.status === 'Pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {trx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
