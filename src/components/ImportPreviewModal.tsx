import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Download,
  Filter,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Loader2,
  HelpCircle,
  FileText
} from 'lucide-react';
import { validateMasterData, checkIdentityConflicts, IdentityConflict } from '../schema/masterDataSchema';
import { generateUniqueId } from '../lib/utils';

export interface ParsedImportRow {
  index: number;
  data: Record<string, any>;
  isValid: boolean;
  errors: string[];
  conflicts: IdentityConflict[];
  selected: boolean;
  status: 'valid' | 'warning' | 'error';
}

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  activeSubTab: string;
  existingRecords: any[];
  onImportSuccess: (importedRecords: any[], strategy: 'skip' | 'overwrite') => Promise<void> | void;
  onDownloadTemplate: () => void;
}

// Robust CSV Line parser supporting commas inside quotes and escaped quotes
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

export function ImportPreviewModal({
  isOpen,
  onClose,
  activeTab,
  activeSubTab,
  existingRecords,
  onImportSuccess,
  onDownloadTemplate,
}: ImportPreviewModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<'skip' | 'overwrite'>('skip');
  const [filterView, setFilterView] = useState<'all' | 'valid' | 'conflict'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setErrorMessage(null);
    setFileName(selectedFile.name);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) || '';
        processRawText(text, selectedFile.name);
      } catch (err: any) {
        setErrorMessage(`Gagal membaca file: ${err.message || 'Format tidak didukung'}`);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Terjadi kesalahan saat membaca file dari disk.');
    };
    reader.readAsText(selectedFile);
  };

  const processRawText = (rawContent: string, name: string) => {
    // Remove UTF-8 BOM if present
    const cleanContent = rawContent.replace(/^\uFEFF/, '');

    if (name.toLowerCase().endsWith('.json')) {
      try {
        const jsonData = JSON.parse(cleanContent);
        if (!Array.isArray(jsonData)) {
          setErrorMessage('File JSON harus berisi array objek data.');
          return;
        }
        processRecords(jsonData);
      } catch (err: any) {
        setErrorMessage('File JSON tidak valid atau struktur rusak.');
      }
      return;
    }

    // CSV format processing
    const rawLines = cleanContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (rawLines.length < 2) {
      setErrorMessage('File CSV harus memiliki minimal 1 baris header dan 1 baris data.');
      return;
    }

    const rawHeaders = parseCSVLine(rawLines[0]).map((h) =>
      h.replace(/^"|"$/g, '').trim().toLowerCase()
    );
    setHeaders(rawHeaders);

    const records: Record<string, any>[] = [];

    for (let i = 1; i < rawLines.length; i++) {
      const values = parseCSVLine(rawLines[i]);
      const record: Record<string, any> = {};

      rawHeaders.forEach((h, colIndex) => {
        let val = values[colIndex] ? values[colIndex].replace(/^"|"$/g, '').trim() : '';
        // Map alias headers to standard entity properties
        if (h === 'nama' || h === 'full_name' || h === 'fullname') record.name = val;
        else if (h === 'kode' || h === 'id_santri' || h === 'nomor_induk') record.id = val;
        else if (h === 'jk' || h === 'jenis_kelamin') record.gender = val.toUpperCase().startsWith('L') ? 'L' : 'P';
        else if (h === 'kelas' || h === 'grade_class') record.grade = val;
        else if (h === 'telepon' || h === 'wa' || h === 'whatsapp' || h === 'no_hp') record.phone = val;
        else if (h === 'surel') record.email = val;
        else if (h === 'alamat') record.address = val;
        else if (h === 'pekerjaan' || h === 'profesi') record.occupation = val;
        else if (h === 'asrama') record.dormitory = val;
        else if (h === 'kamar') record.room = val;
        else record[h] = val;
      });

      // Default identifier fallback if empty
      if (!record.id) {
        record.id = generateUniqueId(activeSubTab, existingRecords);
      }
      if (!record.status) {
        record.status = 'Active';
      }

      records.push(record);
    }

    processRecords(records);
  };

  const processRecords = (records: Record<string, any>[]) => {
    const rows: ParsedImportRow[] = [];
    const intraBatchIds = new Set<string>();
    const intraBatchNiks = new Set<string>();
    const intraBatchNisns = new Set<string>();

    records.forEach((record, idx) => {
      const errors: string[] = [];

      // 1. Zod schema validation
      const validationResult = validateMasterData(record, activeTab, activeSubTab);
      if (!validationResult.success) {
        const issues = (validationResult.error as any).issues || [];
        issues.forEach((iss: any) => {
          errors.push(`${iss.path?.join('.') || 'field'}: ${iss.message}`);
        });
      }

      // 2. Conflict detection against DB / Existing records
      const conflicts = checkIdentityConflicts(record, existingRecords);

      // 3. Conflict detection inside the import batch itself
      if (record.id && intraBatchIds.has(record.id.toLowerCase())) {
        conflicts.push({
          field: 'id',
          value: record.id,
          conflictingRecord: null,
          message: `ID "${record.id}" duplikat di dalam file impor ini`,
        });
      } else if (record.id) {
        intraBatchIds.add(record.id.toLowerCase());
      }

      if (record.nik && intraBatchNiks.has(record.nik)) {
        conflicts.push({
          field: 'nik',
          value: record.nik,
          conflictingRecord: null,
          message: `NIK "${record.nik}" duplikat di dalam file impor ini`,
        });
      } else if (record.nik) {
        intraBatchNiks.add(record.nik);
      }

      if (record.nisn && intraBatchNisns.has(record.nisn)) {
        conflicts.push({
          field: 'nisn',
          value: record.nisn,
          conflictingRecord: null,
          message: `NISN "${record.nisn}" duplikat di dalam file impor ini`,
        });
      } else if (record.nisn) {
        intraBatchNisns.add(record.nisn);
      }

      const hasError = errors.length > 0 || conflicts.length > 0;
      const status: 'valid' | 'warning' | 'error' = hasError ? 'error' : 'valid';

      rows.push({
        index: idx + 1,
        data: record,
        isValid: !hasError,
        errors,
        conflicts,
        selected: !hasError, // default select only valid rows
        status,
      });
    });

    setParsedRows(rows);
  };

  const toggleRowSelect = (index: number) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.index === index ? { ...r, selected: !r.selected } : r))
    );
  };

  const selectAllValid = () => {
    setParsedRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.isValid,
      }))
    );
  };

  const selectAll = () => {
    setParsedRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: true,
      }))
    );
  };

  const deselectAll = () => {
    setParsedRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: false,
      }))
    );
  };

  const handleDownloadErrorReport = () => {
    const errorRows = parsedRows.filter((r) => !r.isValid);
    if (errorRows.length === 0) return;

    const headers = ['Baris', 'ID', 'Nama', 'NIK', 'NISN', 'Penyebab_Error_Konflik'];
    const lines = [
      headers.join(','),
      ...errorRows.map((r) => {
        const issues = [
          ...r.errors,
          ...r.conflicts.map((c) => `[Konflik ${c.field.toUpperCase()}]: ${c.message}`),
        ].join(' | ');

        return [
          r.index,
          `"${r.data.id || ''}"`,
          `"${(r.data.name || '').replace(/"/g, '""')}"`,
          `"${r.data.nik || ''}"`,
          `"${r.data.nisn || ''}"`,
          `"${issues.replace(/"/g, '""')}"`,
        ].join(',');
      }),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_Error_Impor_${activeSubTab}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = useMemo(() => {
    const total = parsedRows.length;
    const valid = parsedRows.filter((r) => r.isValid).length;
    const conflicts = parsedRows.filter((r) => r.conflicts.length > 0).length;
    const errors = parsedRows.filter((r) => r.errors.length > 0).length;
    const selected = parsedRows.filter((r) => r.selected).length;

    return { total, valid, conflicts, errors, selected };
  }, [parsedRows]);

  const filteredDisplayRows = useMemo(() => {
    if (filterView === 'valid') return parsedRows.filter((r) => r.isValid);
    if (filterView === 'conflict') return parsedRows.filter((r) => !r.isValid);
    return parsedRows;
  }, [parsedRows, filterView]);

  const handleExecuteImport = async () => {
    const toImport = parsedRows
      .filter((r) => r.selected)
      .map((r) => r.data);

    if (toImport.length === 0) {
      setErrorMessage('Tidak ada baris data yang dipilih untuk diimpor.');
      return;
    }

    setIsProcessing(true);
    try {
      await onImportSuccess(toImport, strategy);
      onClose();
    } catch (err: any) {
      setErrorMessage(`Gagal menyimpan data impor: ${err.message || 'Kesalahan database'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Wizard Impor Data {activeSubTab} (Rekomendasi 4)
              </h3>
              <p className="text-xs text-slate-400">
                Pra-validasi skema Zod, deteksi konflik identitas massal, dan preview interaktif sebelum commit ke database.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1">{errorMessage}</div>
              <button onClick={() => setErrorMessage(null)} className="opacity-70 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 1: Upload or Template Area if no file loaded */}
          {parsedRows.length === 0 ? (
            <div className="space-y-6 py-6">
              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 bg-slate-950/40 rounded-2xl p-8 text-center transition-colors">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.json"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="text-base font-semibold text-slate-100 mb-1">
                  Unggah File CSV atau JSON Data {activeSubTab}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
                  Pilih file spreadsheet dari komputer Anda. Sistem akan memindai format identitas (NIK 16 digit, NISN 10 digit, NUPTK), memastikan tidak ada konflik, dan menampilkan preview lengkap.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Pilih File Spreadsheet</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadTemplate}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Unduh Template CSV {activeSubTab}</span>
                  </button>
                </div>
              </div>

              {/* Format Guide Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Validasi Otomatis
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Setiap baris diuji terhadap standar skema Zod (format NIK 16-digit, nomor telepon Indonesia, dan field wajib).
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" /> Pencegahan Duplikasi
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Mendeteksi jika ada NIK atau NISN yang telah terdaftar di database yayasan maupun ganda di file yang sama.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="font-semibold text-blue-400 flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4" /> Preview Interaktif
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Dapat memilih hanya baris yang bersih, mengecualikan baris error, dan mengunduh laporan revisi data.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Summary & Filter Bar */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-xs">
                    <span className="text-slate-400">File: </span>
                    <span className="font-mono text-slate-200 font-semibold">{fileName}</span>
                  </div>
                  <div className="h-4 w-px bg-slate-700 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300">
                      Total: <b className="text-white">{stats.total}</b>
                    </span>
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      Siap: <b>{stats.valid}</b>
                    </span>
                    {stats.conflicts + stats.errors > 0 && (
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        Error/Konflik: <b>{stats.conflicts + stats.errors}</b>
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono">
                      Dipilih: <b>{stats.selected}</b> baris
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setParsedRows([]);
                      setFile(null);
                      setFileName('');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Ganti File
                  </button>
                  {stats.errors + stats.conflicts > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadErrorReport}
                      className="px-3 py-1.5 text-xs text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                      title="Unduh daftar baris bermasalah untuk diperbaiki di Excel"
                    >
                      <Download className="w-3.5 h-3.5" /> Unduh Error CSV
                    </button>
                  )}
                </div>
              </div>

              {/* Selection Controls and Filter Tabs */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Filter Tampilan:</span>
                  <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setFilterView('all')}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        filterView === 'all'
                          ? 'bg-slate-800 text-white font-medium shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Semua ({stats.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterView('valid')}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        filterView === 'valid'
                          ? 'bg-emerald-600/30 text-emerald-300 font-medium shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Hanya Valid ({stats.valid})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterView('conflict')}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        filterView === 'conflict'
                          ? 'bg-rose-600/30 text-rose-300 font-medium shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Error / Konflik ({stats.conflicts + stats.errors})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllValid}
                    className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
                  >
                    Pilih Hanya Valid
                  </button>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="px-2.5 py-1 text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="px-2.5 py-1 text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 sticky top-0 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <span className="sr-only">Pilih</span>
                        </th>
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3 w-28">Status</th>
                        <th className="p-3">Nama</th>
                        <th className="p-3">ID / Identitas</th>
                        <th className="p-3">NIK / NISN / NUPTK</th>
                        <th className="p-3">Catatan / Detail Validasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredDisplayRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">
                            Tidak ada data yang sesuai dengan filter tampilan saat ini.
                          </td>
                        </tr>
                      ) : (
                        filteredDisplayRows.map((row) => (
                          <tr
                            key={row.index}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              !row.isValid
                                ? 'bg-rose-950/15'
                                : row.selected
                                ? 'bg-emerald-950/10'
                                : ''
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => toggleRowSelect(row.index)}
                                className="accent-emerald-500 rounded border-slate-700 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 text-center text-slate-500 font-mono">
                              {row.index}
                            </td>
                            <td className="p-3">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" /> Siap
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                  <AlertTriangle className="w-3 h-3" /> Konflik
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-medium text-slate-200">
                              {row.data.name || '-'}
                            </td>
                            <td className="p-3 font-mono text-slate-400">
                              {row.data.id || '-'}
                            </td>
                            <td className="p-3 font-mono text-slate-300">
                              {row.data.nik || row.data.nisn || row.data.nuptk || '-'}
                            </td>
                            <td className="p-3 text-slate-400 max-w-xs">
                              {row.conflicts.length > 0 && (
                                <div className="text-rose-400 font-medium">
                                  {row.conflicts.map((c, i) => (
                                    <div key={i}>• {c.message}</div>
                                  ))}
                                </div>
                              )}
                              {row.errors.length > 0 && (
                                <div className="text-amber-400">
                                  {row.errors.map((err, i) => (
                                    <div key={i}>• {err}</div>
                                  ))}
                                </div>
                              )}
                              {row.isValid && (
                                <span className="text-emerald-500/80">
                                  Data valid & sesuai spesifikasi skema
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Strategy Selector */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Strategi Penanganan Konflik
                </div>
                <div className="flex flex-col sm:flex-row gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importStrategy"
                      checked={strategy === 'skip'}
                      onChange={() => setStrategy('skip')}
                      className="accent-emerald-500"
                    />
                    <span className="text-slate-300">
                      <b>Lewati (Skip):</b> Abaikan baris yang memiliki konflik ID/NIK, impor baris lain yang bersih saja.
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importStrategy"
                      checked={strategy === 'overwrite'}
                      onChange={() => setStrategy('overwrite')}
                      className="accent-emerald-500"
                    />
                    <span className="text-slate-300">
                      <b>Perbarui (Overwrite):</b> Timpa atribut data yang ada jika ID sudah terdaftar di database.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {parsedRows.length > 0 ? (
              <span>
                Akan mengimpor <b className="text-emerald-400">{stats.selected}</b> dari {stats.total} baris ke master <b>{activeSubTab}</b>.
              </span>
            ) : (
              <span>Gunakan format CSV terstandar dengan pemisah koma.</span>
            )}
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-colors"
            >
              Batal
            </button>
            {parsedRows.length > 0 && (
              <button
                type="button"
                disabled={stats.selected === 0 || isProcessing}
                onClick={handleExecuteImport}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Firestore...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Eksekusi Impor ({stats.selected} Data)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
