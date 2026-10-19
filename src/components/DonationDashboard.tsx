import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Candidate } from '../types';

interface DonationDashboardProps {
  candidates: Candidate[];
}

export function DonationDashboard({ candidates }: DonationDashboardProps) {
  // Process tier distribution data
  const tierCounts = { High: 0, Medium: 0, Low: 0, Unknown: 0 };
  candidates.forEach(c => {
    const income = c.familyIncome || '';
    if (income.includes('10.000.000 - Rp 20.000.000') || income.includes('> Rp 20.000.000')) tierCounts.High++;
    else if (income.includes('5.000.000 - Rp 10.000.000')) tierCounts.Medium++;
    else if (income.includes('< Rp 2.000.000') || income.includes('2.000.000 - Rp 5.000.000')) tierCounts.Low++;
    else tierCounts.Unknown++;
  });

  const pieData = [
    { name: 'High Potential', value: tierCounts.High, color: '#10b981' }, // emerald-500
    { name: 'Medium Potential', value: tierCounts.Medium, color: '#f59e0b' }, // amber-500
    { name: 'Low Potential', value: tierCounts.Low, color: '#64748b' }, // slate-500
  ].filter(d => d.value > 0);

  // Process mock monthly donation data for demonstration since we don't have real transaction data accessible easily yet
  const monthlyData = [
    { name: 'Jan', total: 12000000 },
    { name: 'Feb', total: 15000000 },
    { name: 'Mar', total: 18000000 },
    { name: 'Apr', total: 14000000 },
    { name: 'May', total: 22000000 },
    { name: 'Jun', total: 25000000 },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Tier Distribution Chart */}
        <div className="bg-slate-50 dark:bg-[#0a0a0a]  rounded-xl p-6">
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-6">Donor Tier Distribution (From PPDB)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: '#94a3b8' }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Donations Chart */}
        <div className="bg-slate-50 dark:bg-[#0a0a0a]  rounded-xl p-6">
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-6">Monthly Donation Trends</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                <YAxis 
                  stroke="#94a3b8" 
                  tick={{ fill: '#94a3b8' }}
                  tickFormatter={(val) => `Rp${val / 1000000}M`}
                />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="total" name="Total Donations" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
