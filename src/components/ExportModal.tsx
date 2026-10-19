import React, { useState } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  Check,
  CheckSquare,
  Square,
  CheckCircle2,
  Calendar,
  Layers
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  activeSubTab: string;
  allData: any[];
  filteredData: any[];
  selectedRows: string[];
  onExportSuccess?: (format: string, count: number) => void;
}

export function ExportModal({
  isOpen,
  onClose,
  activeTab,
  activeSubTab,
  allData,
  filteredData,
  selectedRows,
  onExportSuccess,
}: ExportModalProps) {
  const [format, setFormat] = useState<'excel' | 'csv' | 'json'>('excel');
  const [scope, setScope] = useState<'filtered' | 'all' | 'selected'>(
    selectedRows.length > 0 ? 'selected' : 'filtered'
  );

  // Available attributes to export
  const sample = (allData.length > 0 ? allData[0] : {}) as Record<string, any>;
  const rawKeys = Object.keys(sample).filter(
    (k) =>
      !['selected', 'tempId'].includes(k) &&
      typeof sample[k] !== 'object' &&
      !Array.isArray(sample[k])
  );

  // Default selected columns
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    rawKeys.length > 0 ? rawKeys : ['id', 'name', 'status']
  );

  if (!isOpen) return null;

  const getExportDataset = () => {
    if (scope === 'selected') {
      return allData.filter((r) => selectedRows.includes(r.id));
    }
    if (scope === 'all') {
      return allData;
    }
    return filteredData;
  };

  const toggleColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const selectAllColumns = () => {
    setSelectedColumns(rawKeys);
  };

  const deselectAllColumns = () => {
    setSelectedColumns(['id', 'name']);
  };

  const handleExecuteExport = () => {
    const dataset = getExportDataset();
    if (dataset.length === 0) {
      alert('Tidak ada data untuk diekspor dalam lingkup ini.');
      return;
    }

    const cleanDate = new Date().toISOString().split('T')[0];
    const safeSubTab = activeSubTab.replace(/\s+/g, '_');

    if (format === 'json') {
      // Export JSON
      const jsonContent = JSON.stringify(
        dataset.map((row) => {
          const item: Record<string, any> = {};
          selectedColumns.forEach((col) => {
            item[col] = row[col] ?? null;
          });
          return item;
        }),
        null,
        2
      );
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      downloadBlob(blob, `Master_${safeSubTab}_${cleanDate}.json`);
    } else if (format === 'excel') {
      // Excel-friendly CSV with UTF-8 BOM (\uFEFF) and text escaping for long numeric IDs (NIK, NISN, phone)
      const headers = selectedColumns.map((col) => `"${col.toUpperCase()}"`).join(',');
      const rows = dataset.map((row) =>
        selectedColumns
          .map((col) => {
            const val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
            // For numbers with 10+ digits or leading 0s, format as text so Excel won't display 3.17E+15
            const isLongNumeric = /^\d{9,}$/.test(val) || /^0\d+/.test(val);
            if (isLongNumeric) {
              return `"=""${val}"""`; // Excel formula format for text preservation
            }
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(',')
      );

      const excelCsv = '\uFEFF' + [headers, ...rows].join('\r\n');
      const blob = new Blob([excelCsv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `Master_${safeSubTab}_Excel_${cleanDate}.csv`);
    } else {
      // Standard CSV
      const headers = selectedColumns.map((col) => `"${col}"`).join(',');
      const rows = dataset.map((row) =>
        selectedColumns
          .map((col) => {
            const val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(',')
      );

      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `Master_${safeSubTab}_Standard_${cleanDate}.csv`);
    }

    if (onExportSuccess) {
      onExportSuccess(format, dataset.length);
    }
    onClose();
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const targetCount = getExportDataset().length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Ekspor Data {activeSubTab} (Rekomendasi 4)
              </h3>
              <p className="text-xs text-slate-400">
                Pilih format dokumen dan lingkup data untuk diunduh.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              1. Pilih Format File
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormat('excel')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  format === 'excel'
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/50'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  {format === 'excel' && <Check className="w-4 h-4 text-emerald-400" />}
                </div>
                <div className="font-semibold text-xs text-slate-200">Excel (.csv)</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  BOM UTF-8, nomor NIK/NISN aman dari scientific notation.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  format === 'csv'
                    ? 'bg-blue-950/40 border-blue-500/50 text-blue-300 ring-1 ring-blue-500/50'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <FileText className="w-5 h-5 text-blue-400" />
                  {format === 'csv' && <Check className="w-4 h-4 text-blue-400" />}
                </div>
                <div className="font-semibold text-xs text-slate-200">Standard CSV</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Format teks murni kompatibel dengan software database pihak ketiga.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  format === 'json'
                    ? 'bg-purple-950/40 border-purple-500/50 text-purple-300 ring-1 ring-purple-500/50'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <FileCode className="w-5 h-5 text-purple-400" />
                  {format === 'json' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="font-semibold text-xs text-slate-200">JSON File</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Format terstruktur hierarkis untuk backup & integrasi API developer.
                </div>
              </button>
            </div>
          </div>

          {/* Scope Selection */}
          <div className="space-y-2">
            <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              2. Lingkup Data yang Diekspor
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <label
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                  scope === 'filtered'
                    ? 'bg-slate-800 border-blue-500/50 text-slate-100'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={scope === 'filtered'}
                  onChange={() => setScope('filtered')}
                  className="accent-blue-500"
                />
                <div>
                  <div className="font-medium text-slate-200">Hasil Filter</div>
                  <div className="text-[10px] text-slate-400">{filteredData.length} baris</div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                  scope === 'all'
                    ? 'bg-slate-800 border-blue-500/50 text-slate-100'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                  className="accent-blue-500"
                />
                <div>
                  <div className="font-medium text-slate-200">Semua Data</div>
                  <div className="text-[10px] text-slate-400">{allData.length} baris</div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                  selectedRows.length === 0
                    ? 'opacity-40 cursor-not-allowed bg-slate-950/20 border-slate-900 text-slate-600'
                    : scope === 'selected'
                    ? 'bg-slate-800 border-blue-500/50 text-slate-100'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  disabled={selectedRows.length === 0}
                  checked={scope === 'selected'}
                  onChange={() => setScope('selected')}
                  className="accent-blue-500"
                />
                <div>
                  <div className="font-medium text-slate-200">Dicentang Saja</div>
                  <div className="text-[10px] text-slate-400">
                    {selectedRows.length > 0 ? `${selectedRows.length} baris` : 'Belum ada dipilih'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Columns Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                3. Kolom / Atribut ({selectedColumns.length} dipilih)
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllColumns}
                  className="text-blue-400 hover:underline"
                >
                  Pilih Semua
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={deselectAllColumns}
                  className="text-slate-400 hover:underline"
                >
                  Kolom Inti Saja
                </button>
              </div>
            </div>
            <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {rawKeys.map((key) => {
                const isChecked = selectedColumns.includes(key);
                return (
                  <label
                    key={key}
                    onClick={() => toggleColumn(key)}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-800/60 cursor-pointer select-none text-slate-300"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                    <span className="truncate">{key}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Akan mengunduh <b className="text-blue-400">{targetCount}</b> baris data.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={targetCount === 0 || selectedColumns.length === 0}
              onClick={handleExecuteExport}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 rounded-xl shadow-lg shadow-blue-950/50 transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Unduh File Sekarang</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
