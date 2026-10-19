import React, { useState } from 'react';
import { Target, Plus, ChevronRight } from 'lucide-react';
import { Campaign } from '../types';

export function DonationCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([
    {
      id: "c1",
      title: "Pembangunan Masjid As-Salam",
      description: "Penggalangan dana untuk perluasan dan renovasi masjid utama pesantren.",
      targetAmount: 500000000,
      currentAmount: 125000000,
      status: "Active",
      endDate: "2026-12-31"
    },
    {
      id: "c2",
      title: "Beasiswa Santri Yatim",
      description: "Program beasiswa penuh untuk 50 santri yatim dan dhuafa.",
      targetAmount: 200000000,
      currentAmount: 150000000,
      status: "Active",
      endDate: "2026-08-15"
    },
    {
      id: "c3",
      title: "Wakaf Pembebasan Lahan Akhwat",
      description: "Pembebasan lahan seluas 1 Hektar untuk perluasan asrama putri.",
      targetAmount: 1000000000,
      currentAmount: 1000000000,
      status: "Completed",
      endDate: "2025-12-31"
    }
  ]);

  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center">
         <div>
           <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">Active Campaigns</h2>
           <p className="text-sm text-slate-500 dark:text-slate-400">Manage and track your fundraising goals</p>
         </div>
         <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
           <Plus className="w-4 h-4" /> New Campaign
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.map(campaign => {
          const progress = Math.min(100, Math.round((campaign.currentAmount / campaign.targetAmount) * 100));
          return (
            <div key={campaign.id} className="bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-xl p-5 hover:border-indigo-500/30 transition-colors group cursor-pointer flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded ${
                    campaign.status === 'Active' ? 'bg-indigo-500/10 text-indigo-400' : 
                    campaign.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                  }`}>
                    {campaign.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                </div>
                <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-1 leading-snug">{campaign.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-2">{campaign.description}</p>
              </div>

              <div className="mt-5">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Terkumpul</div>
                    <div className="font-medium text-indigo-400">Rp {(campaign.currentAmount).toLocaleString('id-ID')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 mb-1">Target</div>
                    <div className="text-sm text-slate-700 dark:text-slate-300">Rp {(campaign.targetAmount).toLocaleString('id-ID')}</div>
                  </div>
                </div>
                
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${campaign.status === 'Completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 text-right">
                  {progress}% Complete
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
