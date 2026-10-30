import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Building2, Save, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface UnitRegistrationFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

import { UnitSchema } from '../schema/masterDataSchema';

export const UnitRegistrationForm: React.FC<UnitRegistrationFormProps> = ({ onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [unitLevel, setUnitLevel] = useState<'parent' | 'child'>('parent');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    status: 'Active',
    description: '',
    parentUnitId: '',
  });

  const [existingUnits, setExistingUnits] = useState<{id: string, name: string}[]>([]);

  React.useEffect(() => {
    import('firebase/firestore').then(({ collection, getDocs }) => {
      getDocs(tenantScopedQuery(collection(db, 'units'), user?.tenantId)).then(snapshot => {
        setExistingUnits(snapshot.docs.map(doc => ({ id: doc.id, name: (doc.data() as any).name || '' })));
      });
    });
  }, [user?.tenantId, user?.uid]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const submissionData = {
      ...formData,
      parentUnitId: unitLevel === 'parent' ? '' : formData.parentUnitId,
    };

    const result = UnitSchema.safeParse(submissionData);
    
    if (!result.success) {
      setMessage({ type: 'error', text: result.error.issues[0].message });
      return;
    }

    if (unitLevel === 'child' && !submissionData.parentUnitId) {
      setMessage({ type: 'error', text: 'Please select a parent unit.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const dataToSave = {
      ...result.data,
      createdAt: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, 'units'), tenantRecord(user?.tenantId, dataToSave));
      setMessage({ type: 'success', text: 'Unit saved successfully.' });
      setFormData({ name: '', code: '', status: 'Active', description: '', parentUnitId: '' });
      setUnitLevel('parent');
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error adding document: ", error);
      setMessage({ type: 'error', text: 'Failed to save unit. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-500" /> Register New Unit
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
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kategori Unit</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="unitLevel" 
                  value="parent" 
                  checked={unitLevel === 'parent'}
                  onChange={() => setUnitLevel('parent')}
                  className="text-emerald-500 focus:ring-emerald-500/50"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Standalone / Parent Unit</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="unitLevel" 
                  value="child" 
                  checked={unitLevel === 'child'}
                  onChange={() => setUnitLevel('child')}
                  className="text-emerald-500 focus:ring-emerald-500/50"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Child / Sub-Unit</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Unit *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="e.g. Academic Division"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Unit Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => handleFieldChange('code', e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="e.g. ACD-01"
                required
              />
            </div>
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
            </select>
          </div>

          {unitLevel === 'child' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Parent Unit *</label>
              <select
                value={formData.parentUnitId}
                onChange={(e) => handleFieldChange('parentUnitId', e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                required
              >
                <option value="">Select Parent Unit...</option>
                {existingUnits.map(unit => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 min-h-[100px]"
              placeholder="Brief description of the unit's responsibilities..."
            />
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
              Save Unit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
