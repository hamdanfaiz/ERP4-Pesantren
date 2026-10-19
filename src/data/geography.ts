export const COUNTRIES = [
  { id: 'ID', name: 'Indonesia' },
  { id: 'MY', name: 'Malaysia' },
  { id: 'SG', name: 'Singapore' },
  { id: 'SD', name: 'Sudan' },
  { id: 'SA', name: 'Saudi Arabia' },
  { id: 'EG', name: 'Mesir' },
];

export const PROVINCES: Record<string, { id: string, name: string }[]> = {
  'ID': [
    { id: '31', name: 'DKI Jakarta' },
    { id: '32', name: 'Jawa Barat' },
    { id: '33', name: 'Jawa Tengah' },
    { id: '34', name: 'DI Yogyakarta' },
    { id: '35', name: 'Jawa Timur' },
  ],
  'MY': [
    { id: '14', name: 'Kuala Lumpur' },
    { id: '10', name: 'Selangor' },
    { id: '01', name: 'Johor' },
  ],
  'SG': [
    { id: 'SG-01', name: 'Central Region' },
    { id: 'SG-02', name: 'East Region' },
  ],
  'SD': [
    { id: 'SD-01', name: 'Khartoum' },
    { id: 'SD-02', name: 'Al Jazirah' },
  ],
  'SA': [
    { id: 'SA-01', name: 'Riyadh' },
    { id: 'SA-02', name: 'Makkah' },
    { id: 'SA-03', name: 'Madinah' },
  ],
  'EG': [
    { id: 'EG-01', name: 'Cairo' },
    { id: 'EG-02', name: 'Alexandria' },
  ]
};

// using province id as key
export const DISTRICTS: Record<string, { id: string, name: string }[]> = {
  '31': [
    { id: '3171', name: 'Jakarta Selatan' },
    { id: '3172', name: 'Jakarta Timur' },
    { id: '3173', name: 'Jakarta Pusat' },
    { id: '3174', name: 'Jakarta Barat' },
    { id: '3175', name: 'Jakarta Utara' },
  ],
  '32': [
    { id: '3273', name: 'Kota Bandung' },
    { id: '3201', name: 'Kabupaten Bogor' },
    { id: '3271', name: 'Kota Bogor' },
    { id: '3276', name: 'Kota Depok' },
  ],
  '14': [
    { id: '1401', name: 'Bukit Bintang' },
    { id: '1402', name: 'Cheras' },
  ],
  'SA-02': [
    { id: 'SA-02-01', name: 'Jeddah' },
    { id: 'SA-02-02', name: 'Taif' },
  ]
};

// using district id as key
export const KECAMATAN: Record<string, { id: string, name: string }[]> = {
  '3171': [
    { id: '317101', name: 'Kebayoran Baru' },
    { id: '317102', name: 'Kebayoran Lama' },
    { id: '317103', name: 'Pesanggrahan' },
    { id: '317104', name: 'Cilandak' },
    { id: '317105', name: 'Pasar Minggu' },
    { id: '317106', name: 'Jagakarsa' },
  ],
  '3273': [
    { id: '327301', name: 'Coblong' },
    { id: '327302', name: 'Cidadap' },
    { id: '327303', name: 'Sukajadi' },
  ],
  '3276': [
    { id: '327601', name: 'Pancoran Mas' },
    { id: '327602', name: 'Cimanggis' },
    { id: '327603', name: 'Sawangan' },
    { id: '327604', name: 'Bojongsari' },
    { id: '327605', name: 'Limo' },
    { id: '327606', name: 'Cinere' },
    { id: '327607', name: 'Beji' },
    { id: '327608', name: 'Sukmajaya' },
  ]
};

// using kecamatan id as key
export const DESA: Record<string, { id: string, name: string, postalCode: string }[]> = {
  '317101': [
    { id: '31710101', name: 'Selong', postalCode: '12110' },
    { id: '31710102', name: 'Gunung', postalCode: '12120' },
    { id: '31710103', name: 'Kramat Pela', postalCode: '12130' },
    { id: '31710104', name: 'Gandaria Utara', postalCode: '12140' },
    { id: '31710105', name: 'Cipete Utara', postalCode: '12150' },
    { id: '31710106', name: 'Melawai', postalCode: '12160' },
  ],
  '327607': [
    { id: '32760701', name: 'Beji', postalCode: '16421' },
    { id: '32760702', name: 'Beji Timur', postalCode: '16422' },
    { id: '32760703', name: 'Kemiri Muka', postalCode: '16423' },
    { id: '32760704', name: 'Pondok Cina', postalCode: '16424' },
    { id: '32760705', name: 'Kukusan', postalCode: '16425' },
    { id: '32760706', name: 'Tanah Baru', postalCode: '16426' },
  ]
};
