import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { Building, Save, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { generateUniqueId } from '../lib/utils';

interface StructureRegistrationFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: any;
  isEdit?: boolean;
  type: string;
}

export const StructureRegistrationForm: React.FC<StructureRegistrationFormProps> = ({ onSuccess, onCancel, initialData, isEdit, type }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    id: initialData?.id || '',
    name: initialData?.name || '',
    type: type,
    status: initialData?.status || 'Active',
    capacity: initialData?.capacity || '',
    location: initialData?.location || '',
    grade: initialData?.grade || '',
    description: initialData?.description || '',
    parentCode: initialData?.parentCode || '', // For Kampus ID, Gedung ID etc.
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      setMessage({ type: 'error', text: 'Name is required' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const submissionData = {
        ...formData,
        category: type,
    };

    try {
      if (isEdit && initialData?.id) {
        await setDoc(doc(db, 'master_data', `${type}_${initialData.id}`), tenantRecord(user?.tenantId, {
          ...submissionData,
          updatedAt: new Date().toISOString(),
        }), { merge: true });
      } else {
        const idToUse = formData.id || generateUniqueId('Structure', []);
        submissionData.id = idToUse;
        await setDoc(doc(db, 'master_data', `${type}_${idToUse}`), tenantRecord(user?.tenantId, {
          ...submissionData,
          createdAt: new Date().toISOString(),
        }));
      }
      setMessage({ type: 'success', text: 'Record saved successfully.' });
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error saving document: ", error);
      setMessage({ type: 'error', text: 'Failed to save record.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Building className="w-5 h-5 text-emerald-500" /> Register {type}
        </h3>
        {onCancel && (
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-6">
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
              : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="font-medium text-sm">{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ID</label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => handleFieldChange('id', e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="Auto-generated if empty"
                disabled={isEdit}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => handleFieldChange('status', e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>

            {(type === 'Yayasan' || type === 'Kampus') && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Location/Address</label>
                  <textarea
                    value={formData.location}
                    onChange={(e) => handleFieldChange('location', e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </>
            )}

            {(type === 'Kampus' || type === 'Gedung' || type === 'Kamar' || type === 'Kelas') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {type === 'Kampus' ? 'Yayasan Code' : type === 'Gedung' ? 'Kampus Code' : type === 'Kamar' || type === 'Kelas' ? 'Gedung Code' : 'Parent Code'}
                  </label>
                  <input
                    type="text"
                    value={formData.parentCode}
                    onChange={(e) => handleFieldChange('parentCode', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </>
            )}

            {(type === 'Gedung' || type === 'Kamar' || type === 'Kelas') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Capacity / Quota</label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => handleFieldChange('capacity', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </>
            )}

            {(type === 'Kelas' || type === 'Halaqah') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Grade/Level</label>
                  <input
                    type="text"
                    value={formData.grade}
                    onChange={(e) => handleFieldChange('grade', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </>
            )}


          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mr-3"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save {type}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
