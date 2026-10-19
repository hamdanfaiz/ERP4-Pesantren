export const DEFAULT_STRUCTURE: Record<string, any[]> = {
  Gedung: [
    { id: "BLD-UMAR", name: "Asrama Umar", type: "Gedung", capacity: "120 Orang", location: "Blok A - Putra", status: "Active" },
    { id: "BLD-KHADIJAH", name: "Asrama Khadijah", type: "Gedung", capacity: "120 Orang", location: "Blok B - Putri", status: "Active" },
    { id: "BLD-UTSMAN", name: "Asrama Utsman", type: "Gedung", capacity: "100 Orang", location: "Blok C - Putra", status: "Active" },
    { id: "BLD-ALI", name: "Asrama Ali", type: "Gedung", capacity: "100 Orang", location: "Blok D - Putra", status: "Active" },
  ],
  Kamar: [
    { id: "KMR-A12", name: "Kamar A-12", type: "Kamar", capacity: "6 Orang", location: "Asrama Umar Lt. 1", status: "Active", parentCode: "BLD-UMAR" },
    { id: "KMR-B04", name: "Kamar B-04", type: "Kamar", capacity: "6 Orang", location: "Asrama Khadijah Lt. 1", status: "Active", parentCode: "BLD-KHADIJAH" },
    { id: "KMR-C08", name: "Kamar C-08", type: "Kamar", capacity: "6 Orang", location: "Asrama Utsman Lt. 2", status: "Active", parentCode: "BLD-UTSMAN" },
    { id: "KMR-D01", name: "Kamar D-01", type: "Kamar", capacity: "6 Orang", location: "Asrama Ali Lt. 1", status: "Active", parentCode: "BLD-ALI" },
  ],
  Kelas: [
    { id: "CLS-XII-A", name: "Kelas XII-A", type: "Kelas", capacity: "30 Orang", location: "Gedung Akademik Lt. 2", status: "Active" },
    { id: "CLS-XII-B", name: "Kelas XII-B", type: "Kelas", capacity: "30 Orang", location: "Gedung Akademik Lt. 2", status: "Active" },
    { id: "CLS-XI-A", name: "Kelas XI-A", type: "Kelas", capacity: "32 Orang", location: "Gedung Akademik Lt. 1", status: "Active" },
    { id: "CLS-XI-B", name: "Kelas XI-B", type: "Kelas", capacity: "32 Orang", location: "Gedung Akademik Lt. 1", status: "Active" },
    { id: "CLS-X-A", name: "Kelas X-A", type: "Kelas", capacity: "35 Orang", location: "Gedung Baru Lt. 1", status: "Active" },
    { id: "CLS-X-B", name: "Kelas X-B", type: "Kelas", capacity: "35 Orang", location: "Gedung Baru Lt. 1", status: "Active" },
  ],
  Halaqah: [
    { id: "HLQ-ABUBAKAR", name: "Abu Bakar", type: "Halaqah", capacity: "15 Orang", location: "Masjid Utama Sayap Kanan", status: "Active" },
    { id: "HLQ-AISYAH", name: "Aisyah", type: "Halaqah", capacity: "15 Orang", location: "Musholla Putri", status: "Active" },
    { id: "HLQ-ALI", name: "Ali", type: "Halaqah", capacity: "15 Orang", location: "Masjid Utama Sayap Kiri", status: "Active" },
    { id: "HLQ-UTSMAN", name: "Utsman", type: "Halaqah", capacity: "15 Orang", location: "Serambi Perpustakaan", status: "Active" },
  ],
  "Mata Pelajaran": [
    { id: "MP-ARB-01", name: "Bahasa Arab & Nahwu Sharaf", type: "Mata Pelajaran", category: "Kepesantrenan", grade: "Semua Tingkat", status: "Active", capacity: "4 Jam / Minggu", location: "Gedung Akademik" },
    { id: "MP-TFZ-01", name: "Tahfidz & Tahsin Al-Qur'an", type: "Mata Pelajaran", category: "Al-Qur'an", grade: "Semua Tingkat", status: "Active", capacity: "10 Jam / Minggu", location: "Masjid Utama" },
    { id: "MP-FQH-01", name: "Fiqih Ibadah & Muamalah", type: "Mata Pelajaran", category: "Diniyah", grade: "X, XI, XII", status: "Active", capacity: "3 Jam / Minggu", location: "Gedung Akademik" },
    { id: "MP-AQD-01", name: "Aqidah Akhlak", type: "Mata Pelajaran", category: "Diniyah", grade: "X, XI, XII", status: "Active", capacity: "2 Jam / Minggu", location: "Gedung Akademik" },
    { id: "MP-MTK-01", name: "Matematika", type: "Mata Pelajaran", category: "Umum / Merdeka", grade: "X, XI, XII", status: "Active", capacity: "4 Jam / Minggu", location: "Gedung Baru" },
    { id: "MP-ING-01", name: "Bahasa Inggris", type: "Mata Pelajaran", category: "Umum / Bahasa", grade: "X, XI, XII", status: "Active", capacity: "3 Jam / Minggu", location: "Gedung Akademik" },
    { id: "MP-IPA-01", name: "Ilmu Pengetahuan Alam (IPA)", type: "Mata Pelajaran", category: "Umum / Merdeka", grade: "X, XI, XII", status: "Active", capacity: "4 Jam / Minggu", location: "Laboratorium Sains" },
  ],
  Kurikulum: [
    { id: "KUR-MERDEKA", name: "Kurikulum Merdeka IT (Kemendikbudristek)", type: "Kurikulum", category: "Nasional", capacity: "Fase E & F", location: "Jenjang Formal", status: "Active", description: "Kurikulum nasional berbasis kompetensi capaian pembelajaran fase E dan F" },
    { id: "KUR-PONDOK", name: "Kurikulum Pesantren Salafiyah Mu'adalah", type: "Kurikulum", category: "Kepesantrenan", capacity: "Marhalah Ula & Wustha", location: "Pondok Pesantren", status: "Active", description: "Kajian kitab kuning turats, nahwu sharaf, balaghah, dan tahfidz 30 juz" },
    { id: "KUR-TERPADU", name: "Kurikulum Terpadu IT-Tahfidz", type: "Kurikulum", category: "Terpadu", capacity: "6 Tahun Terintegrasi", location: "Kampus Terpadu", status: "Active", description: "Integrasi kurikulum sains teknologi dan tarbiyah kepesantrenan" },
  ],
};
