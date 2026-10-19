import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { Search, BookOpen, Volume2, Info, ChevronLeft } from 'lucide-react';

const JUZ_MAPPING = [
  { juz: 1, surah: 1, ayat: 1 },
  { juz: 2, surah: 2, ayat: 142 },
  { juz: 3, surah: 2, ayat: 253 },
  { juz: 4, surah: 3, ayat: 93 },
  { juz: 5, surah: 4, ayat: 24 },
  { juz: 6, surah: 4, ayat: 148 },
  { juz: 7, surah: 5, ayat: 82 },
  { juz: 8, surah: 6, ayat: 111 },
  { juz: 9, surah: 7, ayat: 88 },
  { juz: 10, surah: 8, ayat: 41 },
  { juz: 11, surah: 9, ayat: 93 },
  { juz: 12, surah: 11, ayat: 6 },
  { juz: 13, surah: 12, ayat: 53 },
  { juz: 14, surah: 15, ayat: 1 },
  { juz: 15, surah: 17, ayat: 1 },
  { juz: 16, surah: 18, ayat: 75 },
  { juz: 17, surah: 21, ayat: 1 },
  { juz: 18, surah: 23, ayat: 1 },
  { juz: 19, surah: 25, ayat: 21 },
  { juz: 20, surah: 27, ayat: 56 },
  { juz: 21, surah: 29, ayat: 46 },
  { juz: 22, surah: 33, ayat: 31 },
  { juz: 23, surah: 36, ayat: 28 },
  { juz: 24, surah: 39, ayat: 32 },
  { juz: 25, surah: 41, ayat: 47 },
  { juz: 26, surah: 46, ayat: 1 },
  { juz: 27, surah: 51, ayat: 31 },
  { juz: 28, surah: 58, ayat: 1 },
  { juz: 29, surah: 67, ayat: 1 },
  { juz: 30, surah: 78, ayat: 1 }
];

export function QuranViewer() {
  const [surahList, setSurahList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSurah, setSelectedSurah] = useState<any>(null);
  const [surahDetail, setSurahDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetch('/api/quran/surat')
      .then(res => res.json())
      .then(data => {
        setSurahList(data.data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const loadSurah = (surah: any) => {
    setSelectedSurah(surah);
    setLoadingDetail(true);
    fetch(`/api/quran/surat/${surah.nomor}`)
      .then(res => res.json())
      .then(data => {
        setSurahDetail(data.data);
        setLoadingDetail(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingDetail(false);
      });
  };

  const filteredSurah = surahList.filter(s => 
    s.namaLatin.toLowerCase().includes(search.toLowerCase()) || 
    s.arti.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedSurah) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 gap-4">
          <button 
            onClick={() => setSelectedSurah(null)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors self-start sm:self-auto"
          >
            <ChevronLeft className="w-4 h-4" />
            Kembali
          </button>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              onChange={(e) => {
                const juzVal = parseInt(e.target.value);
                const mapping = JUZ_MAPPING.find(j => j.juz === juzVal);
                if (mapping) {
                  const surah = surahList.find(s => s.nomor === mapping.surah);
                  if (surah) {
                    setSelectedSurah(surah);
                    setLoadingDetail(true);
                    fetch(`/api/quran/surat/${surah.nomor}`)
                      .then(res => res.json())
                      .then(data => {
                        setSurahDetail(data.data);
                        setLoadingDetail(false);
                        setTimeout(() => {
                          const el = document.getElementById(`ayat-${mapping.ayat}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 500);
                      })
                      .catch(err => {
                        console.error(err);
                        setLoadingDetail(false);
                      });
                  }
                }
              }}
              className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 flex-1 sm:w-28"
            >
              <option value="">Juz...</option>
              {JUZ_MAPPING.map(j => (
                <option key={j.juz} value={j.juz}>Juz {j.juz}</option>
              ))}
            </select>

            <select 
              value={selectedSurah?.nomor || ''}
              onChange={(e) => {
                const surah = surahList.find(s => s.nomor.toString() === e.target.value);
                if (surah) loadSurah(surah);
              }}
              className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 flex-1 sm:w-48"
            >
              {surahList.map(s => (
                <option key={s.nomor} value={s.nomor}>{s.nomor}. {s.namaLatin}</option>
              ))}
            </select>
            
            <select
              onChange={(e) => {
                const ayatId = `ayat-${e.target.value}`;
                const el = document.getElementById(ayatId);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 flex-1 sm:w-32"
            >
              <option value="">Ayat...</option>
              {surahDetail?.ayat?.map((a: any) => (
                <option key={a.nomorAyat} value={a.nomorAyat}>Ayat {a.nomorAyat}</option>
              ))}
            </select>
          </div>

          <div className="text-right hidden md:block">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">{selectedSurah.namaLatin}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{selectedSurah.arti} • {selectedSurah.jumlahAyat} Ayat</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loadingDetail ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : surahDetail ? (
            <div className="max-w-3xl mx-auto space-y-12">
              <div className="text-center p-8 bg-slate-50 dark:bg-white/5 rounded-2xl">
                <h1 className="text-4xl font-bold text-emerald-600 dark:text-emerald-500 mb-2 font-arabic" dir="rtl">
                  {surahDetail.nama}
                </h1>
                <p className="text-slate-600 dark:text-slate-400" dangerouslySetInnerHTML={{ __html: surahDetail.deskripsi }} />
              </div>

              {surahDetail.nomor !== 1 && surahDetail.nomor !== 9 && (
                <div className="text-center py-4">
                  <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-200 font-arabic" dir="rtl">
                    بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ
                  </h2>
                </div>
              )}

              {surahDetail.ayat?.map((ayat: any) => (
                <div id={`ayat-${ayat.nomorAyat}`} key={ayat.nomorAyat} className="group relative bg-slate-50 dark:bg-white/5 rounded-xl p-6 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800/30">
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                      {ayat.nomorAyat}
                    </div>
                    <div className="flex-1 space-y-6">
                      <div className="text-right">
                        <p className="text-3xl leading-loose font-arabic text-slate-900 dark:text-slate-100" dir="rtl">
                          {ayat.teksArab}
                        </p>
                      </div>
                      <div className="space-y-2 border-t border-slate-200 dark:border-white/10 pt-4">
                        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                          {ayat.teksLatin}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          {ayat.teksIndonesia}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-500" />
            Al-Qur'an Digital
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Daftar Surat Lengkap</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Cari surat atau arti..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSurah.map((surah) => (
              <button 
                key={surah.nomor}
                onClick={() => loadSurah(surah)}
                className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-white/10 hover:border-emerald-500 dark:hover:border-emerald-500/50 hover:shadow-md transition-all text-left bg-white dark:bg-black/20 group"
              >
                <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold group-hover:scale-110 transition-transform">
                  {surah.nomor}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{surah.namaLatin}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{surah.arti} • {surah.jumlahAyat} Ayat</p>
                </div>
                <div className="text-2xl text-emerald-600 dark:text-emerald-500 font-arabic opacity-70 group-hover:opacity-100 transition-opacity" dir="rtl">
                  {surah.nama}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
