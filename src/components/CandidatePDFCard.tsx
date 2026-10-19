import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';
import { Candidate } from '../types';
import { SystemSettings } from '../services/systemSettingsService';

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 32,
    fontFamily: 'Helvetica',
  },
  kopContainer: {
    borderBottomWidth: 2,
    borderBottomColor: '#064e3b',
    paddingBottom: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  kopSchoolName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#064e3b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  kopSubtext: {
    fontSize: 8,
    color: '#475569',
    marginBottom: 2,
  },
  kopDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    marginTop: 3,
  },
  cardBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 8,
    borderRadius: 4,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#064e3b',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 9,
    color: '#15803d',
    marginTop: 2,
  },
  regBadge: {
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
  },
  regBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
    backgroundColor: '#f1f5f9',
    padding: 4,
    marginBottom: 6,
    borderRadius: 2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 3,
  },
  label: {
    width: '32%',
    fontSize: 8.5,
    color: '#64748b',
  },
  value: {
    width: '68%',
    fontSize: 8.5,
    color: '#0f172a',
    fontWeight: 'bold',
  },
  photoAndScheduleBox: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  photoBox: {
    width: 80,
    height: 105,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#94a3b8',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoText: {
    fontSize: 7.5,
    color: '#94a3b8',
    textAlign: 'center',
  },
  scheduleBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#fbfcfd',
  },
  scheduleTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  scheduleItem: {
    fontSize: 8,
    color: '#334155',
    marginBottom: 2,
  },
  footerSignContainer: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  notesBox: {
    width: '58%',
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    borderRadius: 3,
    padding: 6,
    backgroundColor: '#f8fafc',
  },
  notesTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 2,
  },
  notesText: {
    fontSize: 7,
    color: '#64748b',
    lineHeight: 1.2,
  },
  signatureBox: {
    width: '35%',
    textAlign: 'center',
    alignItems: 'center',
  },
  signTitle: {
    fontSize: 8,
    color: '#475569',
    marginBottom: 45,
  },
  signName: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    paddingBottom: 2,
  },
  signRole: {
    fontSize: 7.5,
    color: '#64748b',
    marginTop: 2,
  },
});

export interface CandidatePDFCardProps {
  candidate: Candidate;
  settings?: SystemSettings | null;
}

export const CandidatePDFDocument: React.FC<CandidatePDFCardProps> = ({ candidate, settings }) => {
  const schoolName = settings?.orgInfo?.schoolName || "PONDOK PESANTREN MODERN DARUL ULUM";
  const address = settings?.orgInfo?.address || "Jl. Pesantren No. 1, Jawa Timur";
  const phone = settings?.orgInfo?.phone || "+62 812-3456-7890";
  const email = settings?.orgInfo?.email || "info@pesantren.sch.id";
  const academicYear = settings?.generalSettings?.academicYear || "2026/2027";
  const principalName = settings?.orgInfo?.principalName || "Dr. H. Ahmad Dahlan, M.Pd";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Kop Lembaga */}
        <View style={styles.kopContainer}>
          <Text style={styles.kopSchoolName}>{schoolName}</Text>
          <Text style={styles.kopSubtext}>{address}</Text>
          <Text style={styles.kopSubtext}>Telp/WhatsApp: {phone} | Email: {email}</Text>
          <View style={styles.kopDivider} />
        </View>

        {/* Header Kartu */}
        <View style={styles.cardBanner}>
          <View>
            <Text style={styles.title}>KARTU TANDA BUKTI PENDAFTARAN & UJIAN PPDB</Text>
            <Text style={styles.subtitle}>Tahun Ajaran {academicYear} • Status: {candidate.stage}</Text>
          </View>
          <View style={styles.regBadge}>
            <Text style={styles.regBadgeText}>{candidate.registrationId}</Text>
          </View>
        </View>

        {/* Foto & Info Pelaksanaan */}
        <View style={styles.photoAndScheduleBox}>
          <View style={styles.photoBox}>
            <Text style={styles.photoText}>Pas Foto</Text>
            <Text style={styles.photoText}>3 x 4 cm</Text>
          </View>
          <View style={styles.scheduleBox}>
            <Text style={styles.scheduleTitle}>Informasi Pelaksanaan Seleksi Masuk:</Text>
            <Text style={styles.scheduleItem}>• Sesi Ujian (CBT): {candidate.examSlot || 'Dijadwalkan Panitia'}</Text>
            <Text style={styles.scheduleItem}>• Sesi Wawancara: {candidate.interviewSlot || 'Dijadwalkan Panitia'}</Text>
            <Text style={styles.scheduleItem}>• Pewawancara / Penguji: {candidate.interviewer || 'Ustadz / Penguji Terjadwal'}</Text>
            <Text style={styles.scheduleItem}>• Tanggal Terdaftar: {candidate.dateApplied || new Date().toISOString().split('T')[0]}</Text>
          </View>
        </View>

        {/* Data Calon Santri */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>I. BIODATA CALON SANTRI</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nama Lengkap</Text>
            <Text style={styles.value}>{candidate.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Jenis Kelamin</Text>
            <Text style={styles.value}>{candidate.gender === 'P' ? 'Perempuan (Santri Putri)' : 'Laki-Laki (Santri Putra)'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tempat, Tanggal Lahir</Text>
            <Text style={styles.value}>{candidate.pob || '-'}, {candidate.dob || '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>NIK / NISN</Text>
            <Text style={styles.value}>{candidate.nik || '-'} / {candidate.nisn || '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Jenjang / Asal Sekolah</Text>
            <Text style={styles.value}>{candidate.grade} / {candidate.previousSchool || '-'}</Text>
          </View>
        </View>

        {/* Data Orang Tua & Kontak */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>II. DATA ORANG TUA / WALI & ALAMAT</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nama Ayah / Ibu</Text>
            <Text style={styles.value}>{candidate.fatherName || '-'} / {candidate.motherName || '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pekerjaan Orang Tua</Text>
            <Text style={styles.value}>{candidate.fatherJob || '-'} / {candidate.motherJob || '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Nomor WhatsApp / HP</Text>
            <Text style={styles.value}>{candidate.whatsappPhone || candidate.phone || '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Alamat Lengkap</Text>
            <Text style={styles.value}>
              {candidate.address || '-'}
              {candidate.village ? `, Ds. ${candidate.village}` : ''}
              {candidate.district ? `, Kec. ${candidate.district}` : ''}
              {candidate.regency ? `, Kab/Kota ${candidate.regency}` : ''}
              {candidate.province ? `, Prov. ${candidate.province}` : ''}
            </Text>
          </View>
        </View>

        {/* Nilai jika sudah tes */}
        {(candidate.score || candidate.examScores || candidate.interviewScores) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>III. REKAPITULASI HASIL EVALUASI</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Nilai Rata-Rata / Keterangan</Text>
              <Text style={styles.value}>Skor Akhir: {candidate.score ?? '-'} {candidate.score && candidate.score >= 75 ? '(Lulus KKM)' : ''}</Text>
            </View>
          </View>
        )}

        {/* Tanda Tangan & Petunjuk */}
        <View style={styles.footerSignContainer}>
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>PETUNJUK BAGI CALON SANTRI & WALI:</Text>
            <Text style={styles.notesText}>1. Kartu ini wajib dicetak dan dibawa saat verifikasi berkas & ujian tes masuk.</Text>
            <Text style={styles.notesText}>2. Peserta hadir di pesantren 30 menit sebelum sesi ujian dimulai mengenakan busana muslim/muslimah rapi.</Text>
            <Text style={styles.notesText}>3. Membawa fotokopi KK, Akta Kelahiran, dan Ijazah/Rapor asli saat tes.</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signTitle}>Panitia Penerimaan PPDB</Text>
            <Text style={styles.signName}>{principalName}</Text>
            <Text style={styles.signRole}>Ketua Panitia / Kepala Lembaga</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
