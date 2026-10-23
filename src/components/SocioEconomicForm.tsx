import React from "react";
import { Briefcase, GraduationCap, Wallet } from "lucide-react";

export interface SocioEconomicData {
  fatherJob?: string;
  fatherEducation?: string;
  motherJob?: string;
  motherEducation?: string;
  familyIncome?: string;
}

interface SocioEconomicFormProps {
  data: SocioEconomicData;
  onChange: (data: Partial<SocioEconomicData>) => void;
}

export const SocioEconomicForm: React.FC<SocioEconomicFormProps> = ({
  data,
  onChange,
}) => {
  const handleChange = (field: keyof SocioEconomicData, value: string) => {
    onChange({ [field]: value });
  };

  const incomeTiers = [
    "< Rp 2.000.000",
    "Rp 2.000.000 - Rp 5.000.000",
    "Rp 5.000.000 - Rp 10.000.000",
    "Rp 10.000.000 - Rp 20.000.000",
    "> Rp 20.000.000",
  ];

  const educationLevels = ["SD", "SMP", "SMA/SMK", "D3", "S1", "S2", "S3"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Father's Info */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/5 pb-2">
            Father's Details
          </h4>
          
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5" />
              Occupation
            </label>
            <input
              type="text"
              value={data.fatherJob || ""}
              onChange={(e) => handleChange("fatherJob", e.target.value)}
              placeholder="e.g. Civil Servant, Entrepreneur"
              className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-2">
              <GraduationCap className="w-3.5 h-3.5" />
              Highest Education
            </label>
            <select
              value={data.fatherEducation || ""}
              onChange={(e) => handleChange("fatherEducation", e.target.value)}
              className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 appearance-none"
            >
              <option value="" disabled>Select Education Level</option>
              {educationLevels.map((level) => (
                <option key={level} value={level} className="glass-panel">
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mother's Info */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/5 pb-2">
            Mother's Details
          </h4>
          
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5" />
              Occupation
            </label>
            <input
              type="text"
              value={data.motherJob || ""}
              onChange={(e) => handleChange("motherJob", e.target.value)}
              placeholder="mis. Guru, Ibu Rumah Tangga"
              className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-2">
              <GraduationCap className="w-3.5 h-3.5" />
              Highest Education
            </label>
            <select
              value={data.motherEducation || ""}
              onChange={(e) => handleChange("motherEducation", e.target.value)}
              className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 appearance-none"
            >
              <option value="" disabled>Select Education Level</option>
              {educationLevels.map((level) => (
                <option key={level} value={level} className="glass-panel">
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Household Income */}
      <div className="pt-4 border-t border-slate-200 dark:border-white/5">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5" />
          Average Monthly Household Income
        </label>
        <select
          value={data.familyIncome || ""}
          onChange={(e) => handleChange("familyIncome", e.target.value)}
          className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 appearance-none"
        >
          <option value="" disabled>Select Income Tier</option>
          {incomeTiers.map((tier) => (
            <option key={tier} value={tier} className="glass-panel">
              {tier}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
