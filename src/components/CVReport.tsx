import React from 'react';
import { Mail, Phone, MapPin, Briefcase, GraduationCap, Award, Calendar, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface CVReportProps {
  data: any;
}

export const CVReport: React.FC<CVReportProps> = ({ data }) => {
  if (!data) return null;

  return (
    <div className="w-full max-w-[800px] mx-auto bg-white text-slate-800 p-8 md:p-12 shadow-2xl print:shadow-none print:p-0 min-h-[1056px] relative">
      {/* Header section */}
      <div className="border-b-2 border-slate-800 pb-8 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">{data.name}</h1>
          <div className="text-xl font-medium text-emerald-700 mb-4">{data.type}</div>
          <div className="space-y-2 text-sm text-slate-600">
            {data.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{data.email}</span>
              </div>
            )}
            {data.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{data.phone}</span>
              </div>
            )}
            {data.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{data.address}</span>
              </div>
            )}
          </div>
        </div>
        <div className="text-right text-sm text-slate-500 space-y-1">
          {data.npwp && <div>NPWP: <span className="font-medium text-slate-700">{data.npwp}</span></div>}
          {data.employmentType && <div>Status: <span className="font-medium text-slate-700">{data.employmentType}</span></div>}
          {data.joinDate && <div>Join Date: <span className="font-medium text-slate-700">{data.joinDate}</span></div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="md:col-span-2 space-y-10">
          
          {/* Work Experience */}
          {data.experiences && Array.isArray(data.experiences) && data.experiences.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200 pb-2">
                <Briefcase className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold uppercase tracking-wider">Work Experience</h2>
              </div>
              <div className="space-y-6">
                {data.experiences.map((exp: any, idx: number) => (
                  <div key={idx} className="relative pl-4 border-l-2 border-slate-200">
                    <div className="absolute w-2.5 h-2.5 bg-emerald-500 rounded-full -left-[6px] top-1.5 border-2 border-white"></div>
                    <h3 className="font-bold text-slate-900">{exp.role}</h3>
                    <div className="text-emerald-700 font-medium text-sm mb-1">{exp.company}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {exp.startDate || 'Unknown'} - {exp.endDate || 'Present'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Education */}
          {data.educations && Array.isArray(data.educations) && data.educations.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200 pb-2">
                <GraduationCap className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold uppercase tracking-wider">Education</h2>
              </div>
              <div className="space-y-6">
                {data.educations.map((edu: any, idx: number) => (
                  <div key={idx} className="relative pl-4 border-l-2 border-slate-200">
                    <div className="absolute w-2.5 h-2.5 bg-slate-400 rounded-full -left-[6px] top-1.5 border-2 border-white"></div>
                    <h3 className="font-bold text-slate-900">{edu.level} {edu.major ? `- ${edu.major}` : ''}</h3>
                    <div className="text-emerald-700 font-medium text-sm mb-1">{edu.institution}</div>
                    {edu.graduationYear && (
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Graduated {edu.graduationYear}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Assignments */}
          {data.assignments && Array.isArray(data.assignments) && data.assignments.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200 pb-2">
                <ChevronRight className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold uppercase tracking-wider">Current Assignments</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.assignments.map((assignment: any, idx: number) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <h3 className="font-bold text-slate-900 text-sm">{assignment.role}</h3>
                    <div className="text-emerald-600 text-xs font-medium mt-1">@ {assignment.unitId}</div>
                    {assignment.description && (
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{assignment.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-10">
          {/* Personal Details */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200 pb-2">
              <h2 className="text-lg font-bold uppercase tracking-wider">Personal Info</h2>
            </div>
            <div className="space-y-3 text-sm">
              {data.gender && (
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold">Gender</div>
                  <div className="font-medium text-slate-800">{data.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
                </div>
              )}
              {(data.pob || data.dob) && (
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold">Place & Date of Birth</div>
                  <div className="font-medium text-slate-800">{data.pob}{data.pob && data.dob ? ', ' : ''}{data.dob}</div>
                </div>
              )}
              {data.nik && (
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold">NIK</div>
                  <div className="font-medium text-slate-800">{data.nik}</div>
                </div>
              )}
            </div>
          </section>

          {/* Certifications */}
          {data.certifications && Array.isArray(data.certifications) && data.certifications.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200 pb-2">
                <Award className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold uppercase tracking-wider">Certifications</h2>
              </div>
              <div className="space-y-4">
                {data.certifications.map((cert: any, idx: number) => (
                  <div key={idx}>
                    <h3 className="font-bold text-slate-900 text-sm">{cert.name}</h3>
                    <div className="text-slate-600 text-xs mt-1">{cert.institution} {cert.year ? `(${cert.year})` : ''}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      
      {/* Footer Note */}
      <div className="absolute bottom-8 left-8 right-8 text-center text-[10px] text-slate-400 pt-4 border-t border-slate-100">
        Generated by System • {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
};
