import React, { useState, useEffect } from 'react';

interface RegionSelectorProps {
  province?: string;
  regency?: string;
  district?: string;
  village?: string;
  addressDetail?: string;
  onChange: (field: string, value: string) => void;
}

export const RegionSelector: React.FC<RegionSelectorProps> = ({
  province = '',
  regency = '',
  district = '',
  village = '',
  addressDetail = '',
  onChange
}) => {
  const [provinces, setProvinces] = useState<any[]>([]);
  const [regencies, setRegencies] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/wilayah/provinces')
      .then(res => res.json())
      .then(res => {
        const data = res.data || res;
        setProvinces(data);
      })
      .catch(err => console.error("Error fetching provinces:", err));
  }, []);

  useEffect(() => {
    if (!province || provinces.length === 0) {
      setRegencies([]);
      return;
    }
    const selectedProv = provinces.find(p => p.name === province);
    if (selectedProv) {
      fetch(`/api/wilayah/regencies/${selectedProv.id}`)
        .then(res => res.json())
        .then(res => setRegencies(res.data || res))
        .catch(err => console.error(err));
    } else {
      setRegencies([]);
    }
  }, [province, provinces]);

  useEffect(() => {
    if (!regency || regencies.length === 0) {
      setDistricts([]);
      return;
    }
    const selectedReg = regencies.find(r => r.name === regency);
    if (selectedReg) {
      fetch(`/api/wilayah/districts/${selectedReg.id}`)
        .then(res => res.json())
        .then(res => setDistricts(res.data || res))
        .catch(err => console.error(err));
    } else {
      setDistricts([]);
    }
  }, [regency, regencies]);

  useEffect(() => {
    if (!district || districts.length === 0) {
      setVillages([]);
      return;
    }
    const selectedDist = districts.find(d => d.name === district);
    if (selectedDist) {
      fetch(`/api/wilayah/villages/${selectedDist.id}`)
        .then(res => res.json())
        .then(res => setVillages(res.data || res))
        .catch(err => console.error(err));
    } else {
      setVillages([]);
    }
  }, [district, districts]);

  const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange('province', e.target.value);
    onChange('regency', '');
    onChange('district', '');
    onChange('village', '');
  };

  const handleRegencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange('regency', e.target.value);
    onChange('district', '');
    onChange('village', '');
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange('district', e.target.value);
    onChange('village', '');
  };

  const handleVillageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange('village', e.target.value);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Provinsi</label>
          <select 
            value={province} 
            onChange={handleProvinceChange}
            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-slate-200"
          >
            <option value="">Pilih Provinsi</option>
            {provinces.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Kabupaten/Kota</label>
          <select 
            value={regency} 
            onChange={handleRegencyChange}
            disabled={!province}
            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-slate-200 disabled:opacity-50"
          >
            <option value="">Pilih Kabupaten/Kota</option>
            {regencies.map(r => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Kecamatan</label>
          <select 
            value={district} 
            onChange={handleDistrictChange}
            disabled={!regency}
            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-slate-200 disabled:opacity-50"
          >
            <option value="">Pilih Kecamatan</option>
            {districts.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Desa/Kelurahan</label>
          <select 
            value={village} 
            onChange={handleVillageChange}
            disabled={!district}
            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-slate-200 disabled:opacity-50"
          >
            <option value="">Pilih Desa/Kelurahan</option>
            {villages.map(v => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Detail Alamat</label>
        <textarea
          value={addressDetail}
          onChange={(e) => onChange('addressDetail', e.target.value)}
          rows={2}
          className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-slate-200 resize-none"
          placeholder="Nama jalan, gedung, RT/RW..."
        />
      </div>
    </div>
  );
};
