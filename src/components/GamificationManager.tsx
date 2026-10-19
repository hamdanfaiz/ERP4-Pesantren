import React from 'react';
import { Award, Star, Zap, Shield, Flame } from 'lucide-react';
import { cn } from '../lib/utils';

export interface GamificationBadge {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  earnedAt?: string;
}

export const BADGES: GamificationBadge[] = [
  { id: 'juz_1', name: 'Al-Hafizh Muda', description: 'Menyelesaikan Hafalan 1 Juz Pertama', icon: <Star className="w-4 h-4" />, color: 'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30' },
  { id: 'streak_7', name: 'Istiqomah', description: '7 Hari Berturut-turut Setoran', icon: <Flame className="w-4 h-4" />, color: 'bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-500/30' },
  { id: 'perfect_score', name: 'Mumtaz', description: 'Mendapat Nilai A+ untuk Tajwid & Makhraj', icon: <Shield className="w-4 h-4" />, color: 'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-500/30' },
  { id: 'fast_learner', name: 'Kilat', description: 'Menyelesaikan target mingguan dalam 3 hari', icon: <Zap className="w-4 h-4" />, color: 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500/30' },
  { id: 'juz_5', name: 'Penjaga Al-Qur\'an', description: 'Menyelesaikan Hafalan 5 Juz', icon: <Award className="w-4 h-4" />, color: 'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-500/30' }
];

export function getStudentBadges(studentId: string): GamificationBadge[] {
  // Mock logic to assign badges based on student ID
  if (studentId === 'STD-001') return [{ ...BADGES[0], earnedAt: '2023-10-01' }, { ...BADGES[1], earnedAt: '2023-10-15' }, { ...BADGES[2], earnedAt: '2023-10-20' }];
  if (studentId === 'STD-002') return [{ ...BADGES[0], earnedAt: '2023-09-15' }];
  if (studentId === 'STD-003') return [{ ...BADGES[0], earnedAt: '2023-08-10' }, { ...BADGES[4], earnedAt: '2023-10-25' }];
  // Default fallback for preview
  return [{ ...BADGES[1], earnedAt: '2023-10-29' }];
}

export function GamificationProfile({ studentId, studentName }: { studentId: string, studentName: string }) {
  const earnedBadges = getStudentBadges(studentId);
  const unearnedBadges = BADGES.filter(b => !earnedBadges.some(eb => eb.id === b.id));

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
        <Award className="w-4 h-4 text-amber-500" /> Profil Pencapaian & Badge
      </h4>
      
      {earnedBadges.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {earnedBadges.map(badge => (
            <div key={`earned-${badge.id}`} className={cn("p-3 rounded-xl border flex flex-col items-center text-center gap-2 relative overflow-hidden group", badge.color)}>
              <div className="absolute inset-0 bg-white/20 dark:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-2 rounded-full bg-white/50 dark:bg-black/30 shadow-sm border border-black/5 dark:border-white/5">
                {badge.icon}
              </div>
              <div>
                <div className="text-xs font-bold">{badge.name}</div>
                <div className="text-[9px] opacity-90 mt-0.5 leading-tight">{badge.description}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-center">
          Belum ada badge yang diraih.
        </div>
      )}

      {unearnedBadges.length > 0 && (
        <div className="mt-6">
          <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Badge Berikutnya</h5>
          <div className="flex flex-wrap gap-2">
            {unearnedBadges.map(badge => (
              <div title={badge.description} key={`unearned-${badge.id}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 opacity-60 grayscale hover:grayscale-0 transition-all cursor-help hover:opacity-100">
                <div className="text-slate-500">
                  {badge.icon}
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
