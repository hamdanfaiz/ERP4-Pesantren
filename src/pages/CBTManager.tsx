import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useRef } from 'react';
import { MonitorPlay, Clock, CheckCircle2, Search, Filter, Plus, Users, BrainCircuit, Activity, ChevronRight, ChevronLeft, Layers, FileSignature, Settings, Calendar, AlertCircle, Edit2, Trash2, Save, X, BookOpen, Download, Copy, Upload, Package, Eye, Database } from 'lucide-react';
import { cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { db } from '../firebase';
import { collection, onSnapshot, query, doc, updateDoc, writeBatch, addDoc, deleteDoc } from 'firebase/firestore';
import { generateMockData } from '../data/mockDataFactory';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import * as XLSX from 'xlsx';

const UPCOMING_SESSIONS = [
  { id: 'CBT-001', name: 'Seleksi Gelombang 1 - Matematika', date: '2024-03-15', time: '08:00 - 10:00', participants: 450, status: 'Upcoming' },
  { id: 'CBT-002', name: 'Seleksi Gelombang 1 - B. Inggris', date: '2024-03-15', time: '10:30 - 12:30', participants: 450, status: 'Upcoming' },
  { id: 'CBT-003', name: 'Tes Potensi Akademik (TPA)', date: '2024-03-16', time: '08:00 - 11:30', participants: 450, status: 'Draft' },
];

const RECENT_RESULTS = [
  { id: 'RES-001', applicant: 'Ahmad Mubarok', session: 'Gelombang 1 - Matematika', score: 85, rank: 12, passed: true },
  { id: 'RES-002', applicant: 'Fatimah Az-Zahra', session: 'Gelombang 1 - Matematika', score: 92, rank: 3, passed: true },
  { id: 'RES-003', applicant: 'Budi Santoso', session: 'Gelombang 1 - Matematika', score: 65, rank: 145, passed: false },
  { id: 'RES-004', applicant: 'Aisyah Binti Abu', session: 'Gelombang 1 - Matematika', score: 88, rank: 8, passed: true },
];

const SCORE_DISTRIBUTION = [
  { name: '0-40', count: 15 },
  { name: '41-60', count: 45 },
  { name: '61-75', count: 120 },
  { name: '76-90', count: 85 },
  { name: '91-100', count: 32 },
];

const METRICS = [
  { label: 'Active Sessions', value: '2', trend: '+1', icon: MonitorPlay, color: 'text-emerald-400' },
  { label: 'Question Bank', value: '1,452', trend: '+125', icon: BrainCircuit, color: 'text-violet-400' },
  { label: 'Registered Participants', value: '890', trend: '+45', icon: Users, color: 'text-blue-400' },
  { label: 'Avg. Completion Time', value: '64m', trend: '-5m', icon: Clock, color: 'text-amber-400' },
];

type Tab = 'overview' | 'sessions' | 'calendar' | 'questions' | 'builder' | 'packages' | 'results' | 'settings' | 'bank' | 'monitor';

export function CBTManager() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInjecting, setIsInjecting] = useState(false);

  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [previewQuestion, setPreviewQuestion] = useState<any>(null);
  const [qbSubject, setQbSubject] = useState('');
  const [qbGrade, setQbGrade] = useState('');
  const [qbTemplate, setQbTemplate] = useState('');
  const [cbtToast, setCbtToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showCbtToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setCbtToast({ message, type });
    setTimeout(() => setCbtToast(null), 4000);
  };
  const [questionFormData, setQuestionFormData] = useState({
    subject: 'Seleksi Gelombang 1 - Matematika',
    grade: 'SMA',
    template: 'Paket A',
    text: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
    difficulty: 'Medium',
    tags: ''
  });

  const handleSaveQuestion = async (closeAfterSave = true) => {
    if (!questionFormData.text.trim() || questionFormData.text === '<p><br></p>') {
      showCbtToast("Question text is required", "error");
      return;
    }
    try {
      if (editingQuestion) {
        await updateDoc(doc(db, 'cbt_questions', editingQuestion.id), questionFormData);
      } else {
        await addDoc(collection(db, 'cbt_questions'), tenantRecord(user?.tenantId, questionFormData));
      }
      showCbtToast("Soal berhasil disimpan!", "success");
      
      if (closeAfterSave) {
        setActiveTab('questions');
        setEditingQuestion(null);
        setQuestionFormData({ subject: cbtConfig.subjects[0] || '', grade: cbtConfig.grades[0] || '', template: cbtConfig.templates[0] || '', text: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '', difficulty: 'Medium', tags: '' });
      } else {
        setEditingQuestion(null);
        setQuestionFormData(prev => ({
          ...prev,
          text: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          explanation: '',
          difficulty: 'Medium',
          tags: ''
        }));
      }
    } catch (e) {
      console.error(e);
      showCbtToast("Failed to save question", "error");
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      showCbtToast('Please upload a CSV or Excel file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length <= 1) {
          showCbtToast('File is empty or has only headers.', 'error');
          return;
        }

        const batch = writeBatch(db);
        let count = 0;

        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i];
          if (!rowData || rowData.length < 9) continue;

          const subject = String(rowData[0] || '').trim();
          const grade = String(rowData[1] || '').trim();
          const template = String(rowData[2] || '').trim();
          const text = String(rowData[3] || '').replace(/\\n/g, '<br/>');
          const options = [
            String(rowData[4] || ''), 
            String(rowData[5] || ''), 
            String(rowData[6] || ''), 
            String(rowData[7] || '')
          ];
          
          let correctAnswerStr = String(rowData[8] || '').trim().toUpperCase();
          let correctAnswer = 0;
          if (['A', 'B', 'C', 'D'].includes(correctAnswerStr)) {
            correctAnswer = ['A', 'B', 'C', 'D'].indexOf(correctAnswerStr);
          } else {
             correctAnswer = parseInt(correctAnswerStr) || 0;
          }

          if (!subject || !text) continue; // Basic validation

          const qRef = doc(collection(db, 'cbt_questions'));
          batch.set(qRef, tenantRecord(user?.tenantId, { subject, grade, template, text, options, correctAnswer }));
          count++;
          
          if(count % 500 === 0){
             await batch.commit();
          }
        }

        if (count > 0 && count % 500 !== 0) {
          await batch.commit();
        }
        
        if (count > 0) {
           showCbtToast(`Successfully uploaded ${count} questions.`, 'success');
        } else {
           showCbtToast('No valid questions found in file.', 'info');
        }

      } catch (error) {
        console.error('Error parsing file:', error);
        showCbtToast('Failed to process file.', 'error');
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'cbt_questions', id));
      showCbtToast("Question deleted successfully", "info");
    } catch (e) {
      console.error(e);
      showCbtToast("Failed to delete question", "error");
    }
  };

  const handleInjectDemoData = async () => {
    setIsInjecting(true);
    try {
      const mockData = generateMockData();
      const mockCandidates = mockData.candidates;
      let batch = writeBatch(db);
      let count = 0;
      for (const record of mockCandidates) {
        batch.set(doc(db, "candidates", record.id), tenantRecord(user?.tenantId, record));
        count++;
        if (count % 450 === 0) {
           await batch.commit();
           batch = writeBatch(db);
        }
      }

      // Also let's inject a few sample CBT questions
      const sampleQuestions = [
         { subject: 'Seleksi Gelombang 1 - Matematika', grade: 'SMA', template: 'Paket A', text: '<p>Berapakah hasil dari <strong>5 + 7</strong>?</p>', options: ['10', '11', '12', '13'], correctAnswer: 2 },
         { subject: 'Seleksi Gelombang 1 - Matematika', grade: 'SMA', template: 'Paket A', text: '<p>Jika <em>x + 3 = 10</em>, berapakah nilai x?</p>', options: ['5', '6', '7', '8'], correctAnswer: 2 },
         { subject: 'Bahasa Arab', grade: 'SMA', template: 'Paket A', text: '<p>Apa bahasa arab dari "Buku"?</p>', options: ['Qalam', 'Kitab', 'Kursiy', 'Maktab'], correctAnswer: 1 },
         { subject: 'PAI', grade: 'SMA', template: 'Paket A', text: '<p>Siapakah nama malaikat yang bertugas menyampaikan wahyu?</p>', options: ['Mikail', 'Izrail', 'Jibril', 'Israfil'], correctAnswer: 2 }
      ];

      for (const q of sampleQuestions) {
         batch.set(doc(collection(db, "cbt_questions")), tenantRecord(user?.tenantId, q));
         count++;
      }

      if (count % 450 !== 0) {
        await batch.commit();
      }
      showCbtToast("Successfully injected mock candidates & question bank!", 'success');
    } catch (e) {
      console.error(e);
      showCbtToast("Failed to inject demo data", 'error');
    } finally {
      setIsInjecting(false);
    }
  };

  // Static defined exam sessions for scheduling
  // In a real app these would be fetched from Firestore, but this matches the PPDBManager auto-assign logic slots.
  const [timeSlots, setTimeSlots] = useState<{ id: string; label: string; date: string; capacity: number; duration?: number; assignedIds?: string[] }[]>([
    { id: "session-1", label: "Gelombang 1 - Sesi 1 (08:00 - 10:00)", date: "2024-06-10", capacity: 25, duration: 120, assignedIds: [] },
    { id: "session-2", label: "Gelombang 1 - Sesi 2 (10:30 - 12:30)", date: "2024-06-10", capacity: 25, duration: 120, assignedIds: [] },
    { id: "session-3", label: "Gelombang 2 - Sesi 1 (08:00 - 10:00)", date: "2024-06-11", capacity: 25, duration: 120, assignedIds: [] },
    { id: "session-4", label: "Gelombang 2 - Sesi 2 (10:30 - 12:30)", date: "2024-06-11", capacity: 25, duration: 120, assignedIds: [] },
  ]);

  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date(2024, 5, 1));

  const [questions, setQuestions] = useState<any[]>([]);

  const [cbtConfig, setCbtConfig] = useState({
    subjects: ['Seleksi Gelombang 1 - Matematika', 'Seleksi Gelombang 1 - B. Inggris', 'Tes Potensi Akademik (TPA)', 'Bahasa Arab', 'PAI', 'IPA', 'IPS'],
    grades: ['TK', 'SD', 'SMP', 'SMA', 'University', 'LTQ'],
    templates: ['Paket A', 'Paket B', 'Paket C'],
    autoGrading: true,
    shuffleQuestions: false,
    correctScore: 1,
    wrongScore: 0,
    blankScore: 0
  });

  const [configModal, setConfigModal] = useState<{isOpen: boolean, type: 'subjects'|'grades'|'templates'|null}>({isOpen: false, type: null});
  const [configInputValue, setConfigInputValue] = useState("");

  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionFormData, setSessionFormData] = useState({
    label: '', date: '', capacity: 25, subject: '', grade: '', duration: 90
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
     return () => clearInterval(timer);
  }, [user?.tenantId, user?.uid]);

  useEffect(() => {
    const qCandidates = tenantScopedQuery(collection(db, 'candidates'), user?.tenantId);
    const unsubCandidates = onSnapshot(qCandidates, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
      setCandidates(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching candidates:", error);
      setLoading(false);
    });

    const qQuestions = tenantScopedQuery(collection(db, 'cbt_questions'), user?.tenantId);
    const unsubQuestions = onSnapshot(qQuestions, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
      setQuestions(data);
    }, (error) => {
      console.error("Error fetching questions:", error);
    });

    const unsubConfig = onSnapshot(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCbtConfig({
          subjects: data.subjects || [],
          grades: data.grades || [],
          templates: data.templates || [],
          autoGrading: data.autoGrading ?? true,
          shuffleQuestions: data.shuffleQuestions ?? false,
          correctScore: data.correctScore ?? 1,
          wrongScore: data.wrongScore ?? 0,
          blankScore: data.blankScore ?? 0
        });
      } else {
        // Create initial config if it doesn't exist
        const initialConfig = {
          subjects: ['Seleksi Gelombang 1 - Matematika', 'Seleksi Gelombang 1 - B. Inggris', 'Tes Potensi Akademik (TPA)', 'Bahasa Arab', 'PAI', 'IPA', 'IPS'],
          grades: ['TK', 'SD', 'SMP', 'SMA', 'University', 'LTQ'],
          templates: ['Paket A', 'Paket B', 'Paket C'],
          autoGrading: true,
          shuffleQuestions: false,
          correctScore: 1,
          wrongScore: 0,
          blankScore: 0
        };
        updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), initialConfig).catch(async () => {
           // update failed maybe it doesn't exist at all, so set
           try {
             const fs = await import('firebase/firestore');
             await fs.setDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), tenantRecord(user?.tenantId, initialConfig));
           } catch(e) {}
        });
      }
    });

    return () => {
      unsubCandidates();
      unsubQuestions();
      unsubConfig();
    };
  }, [user?.tenantId, user?.uid]);

  const handleAutoAssign = async () => {
    const examCandidates = candidates.filter((c) => c.stage === 'Entry Exam');
    // Candidates who don't have a slot yet
    let unassigned = examCandidates.filter((c) => !c.examSlot);

    if (unassigned.length === 0) return;

    const batch = writeBatch(db);
    let totalAssigned = 0;

    for (const slot of timeSlots) {
      if (unassigned.length === 0) break;
      
      const currentlyAssignedCount = examCandidates.filter(c => c.examSlot === slot.id).length;
      let availableCapacity = slot.capacity - currentlyAssignedCount;
      
      while (availableCapacity > 0 && unassigned.length > 0) {
        const candidate = unassigned.shift(); // take first
        if (candidate) {
          const docRef = doc(db, 'candidates', candidate.id);
          batch.update(docRef, { examSlot: slot.id });
          
          // Create a notification for the student
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, tenantRecord(user?.tenantId, {
            userId: candidate.id, // Candidate ID / Santri ID
            title: 'Exam Schedule Assigned',
            message: `You have been assigned to ${slot.label}. Please prepare for your upcoming exam.`,
            isRead: false,
            createdAt: new Date().toISOString(),
            type: 'exam_schedule'
          }));

          totalAssigned++;
          availableCapacity--;
        }
      }
    }

    if (totalAssigned > 0) {
      try {
        await batch.commit();
        showCbtToast(`Successfully assigned ${totalAssigned} candidates to available slots.`, 'success');
      } catch (e) {
        console.error("Error assigning slots:", e);
        showCbtToast("Failed to auto-assign slots.", 'error');
      }
    } else {
      showCbtToast("No available capacity in the current sessions. Please add more sessions.", 'info');
    }
  };

  const handleDragStart = (e: React.DragEvent, candidateId: string) => {
    e.dataTransfer.setData("candidateId", candidateId);
  };

  const handleDrop = async (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    const candidateId = e.dataTransfer.getData("candidateId");
    if (!candidateId) return;

    try {
      const slot = timeSlots.find(s => s.id === slotId);
      const batch = writeBatch(db);
      
      const docRef = doc(db, 'candidates', candidateId);
      batch.update(docRef, { examSlot: slotId });
      
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, tenantRecord(user?.tenantId, {
        userId: candidateId,
        title: 'Exam Schedule Updated',
        message: `Your exam schedule has been updated to ${slot?.label || slotId}.`,
        isRead: false,
        createdAt: new Date().toISOString(),
        type: 'exam_schedule'
      }));
      
      await batch.commit();
    } catch (e) {
      console.error("Error updating slot:", e);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((metric, idx) => (
          <div key={idx} className="bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl hover:bg-slate-100 dark:bg-white/5 transition-colors group">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">
                <metric.icon className={cn("w-5 h-5", metric.color)} />
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">{metric.trend}</span>
            </div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mt-2">{metric.value}</div>
            <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{metric.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6">
          <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Score Distribution (Latest Batch)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SCORE_DISTRIBUTION}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: '#1e293b'}}
                  contentStyle={{ backgroundColor: '#0f1115', borderColor: '#334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-black/20 flex justify-between items-center">
             <h3 className="font-medium text-slate-800 dark:text-slate-200">Upcoming Sessions</h3>
             <button className="text-xs text-indigo-400 hover:text-indigo-300">View All</button>
          </div>
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {UPCOMING_SESSIONS.map(session => (
              <div key={session.id} className="bg-white/[0.02] border border-slate-200 dark:border-white/5 p-3 rounded-lg hover:border-indigo-500/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-slate-800 dark:text-slate-200 text-sm truncate pr-2">{session.name}</h4>
                  <span className={cn(
                    "text-[10px] uppercase font-bold px-2 py-0.5 rounded",
                    session.status === 'Upcoming' ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                  )}>
                    {session.status}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-xs text-slate-500 mt-2">
                   <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> {session.date} | {session.time}</div>
                   <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> {session.participants} Participants</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const handleSessionDragStart = (e: React.DragEvent, sessionId: string) => {
    e.dataTransfer.setData("sessionId", sessionId);
  };

  const handleSessionDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    const sessionId = e.dataTransfer.getData("sessionId");
    
    // Check if dragging a candidate instead
    const candidateId = e.dataTransfer.getData("candidateId");
    if (candidateId) {
      // Find the first session on this date, or if it's dropping directly on a session it should use that logic
      return; 
    }

    if (!sessionId) return;

    setTimeSlots(prev => prev.map(s => 
      s.id === sessionId ? { ...s, date: targetDate } : s
    ));
  };

  const renderCalendar = () => {
    const examCandidates = candidates.filter((c) => c.stage === 'Entry Exam');
    // Generate calendar based on currentCalendarDate state
    const month = currentCalendarDate.getMonth();
    const year = currentCalendarDate.getFullYear();
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
    
    const calendarDays = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
       calendarDays.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
       const d = new Date(year, month, i);
       // format as YYYY-MM-DD
       const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
       calendarDays.push({ date: i, dateString });
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const handlePrevMonth = () => {
      setCurrentCalendarDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
      setCurrentCalendarDate(new Date(year, month + 1, 1));
    };

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl">
           <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                Exam Schedule Calendar 
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Drag and drop sessions to reschedule them.</p>
           </div>
           <div className="flex items-center gap-4">
              <button 
                onClick={handleOpenQuickSetup}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Quick Setup
              </button>
              <div className="flex items-center gap-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg p-1">
                 <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-slate-600 dark:text-slate-300 transition-colors">
                   <ChevronLeft className="w-5 h-5" />
                 </button>
                 <span className="text-sm font-medium w-32 text-center text-slate-800 dark:text-slate-200">
                   {monthNames[month]} {year}
                 </span>
                 <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-slate-600 dark:text-slate-300 transition-colors">
                   <ChevronRight className="w-5 h-5" />
                 </button>
              </div>
           </div>
        </div>

        <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden p-4">
           {/* Calendar Header */}
           <div className="grid grid-cols-7 gap-2 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                 <div key={day} className="text-center font-medium text-slate-500 text-sm py-2">
                    {day}
                 </div>
              ))}
           </div>
           
           {/* Calendar Grid */}
           <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, idx) => {
                 if (!day) return <div key={`empty-${idx}`} className="bg-transparent rounded-lg min-h-[100px]" />;
                 
                 const daySlots = timeSlots.filter(s => s.date === day.dateString);
                 const isToday = day.dateString === new Date().toISOString().split('T')[0];
                 
                 return (
                    <div 
                       key={day.dateString}
                       onDrop={(e) => handleSessionDrop(e, day.dateString)}
                       onDragOver={handleDragOver}
                       className={cn(
                          "min-h-[120px] rounded-lg border p-2 flex flex-col transition-colors",
                          isToday ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                       )}
                    >
                       <div className="text-xs font-semibold text-slate-500 mb-2 flex justify-between">
                          <span className={cn(isToday && "bg-indigo-500 text-white rounded-full w-5 h-5 flex items-center justify-center")}>
                             {day.date}
                          </span>
                       </div>
                       
                       <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
                          {daySlots.map(slot => {
                             const slotCandidates = examCandidates.filter(c => c.examSlot === slot.id);
                             const isFull = slotCandidates.length >= slot.capacity;
                             return (
                                <div 
                                   key={slot.id}
                                   draggable
                                   onDragStart={(e) => handleSessionDragStart(e, slot.id)}
                                   className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 rounded p-1.5 cursor-grab active:cursor-grabbing"
                                >
                                   <div className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 leading-tight">
                                      {slot.label.split('(')[0].trim()}
                                   </div>
                                   <div className="flex justify-between items-center mt-1">
                                      <div className="text-[9px] text-slate-500 flex items-center gap-0.5">
                                         <Clock className="w-2.5 h-2.5" />
                                         {slot.label.split('(')[1]?.replace(')', '') || 'TBD'}
                                      </div>
                                      <div className={cn(
                                         "text-[9px] font-bold px-1 rounded",
                                         isFull ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/20 text-emerald-400"
                                      )}>
                                         {slotCandidates.length}/{slot.capacity}
                                      </div>
                                   </div>
                                </div>
                             );
                          })}
                       </div>
                    </div>
                 );
              })}
           </div>
        </div>
      </div>
    );
  };

  const renderSessions = () => {
    const examCandidates = candidates.filter((c) => c.stage === 'Entry Exam');
    const unassigned = examCandidates.filter((c) => !c.examSlot);

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
          <div>
            <h3 className="font-semibold text-indigo-700 dark:text-indigo-400">Session Assignment Scheduler</h3>
            <p className="text-sm text-indigo-600/80 dark:text-indigo-400/80">
              {unassigned.length} candidates need to be assigned to {timeSlots.length} available sessions.
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleOpenQuickSetup}
              className="bg-white dark:bg-indigo-950 hover:bg-slate-50 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Quick Setup
            </button>
            <button 
              onClick={handleAutoAssign}
              disabled={unassigned.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Auto Assign All
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/3 flex flex-col gap-4">
            <h4 className="font-medium text-slate-800 dark:text-slate-200">Unassigned Candidates ({unassigned.length})</h4>
            <div className="bg-slate-100/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl p-4 flex-1 overflow-y-auto max-h-[600px] flex flex-col gap-2">
              {unassigned.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-4">All candidates assigned.</div>
              )}
              {unassigned.map(c => (
                <div 
                  key={c.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, c.id)}
                  className="bg-white dark:bg-[#0a0a0a] p-3 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-500/50 transition-colors"
                >
                  <div className="font-medium text-slate-800 dark:text-slate-200 text-sm">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.registrationNumber || c.id}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full lg:w-2/3 flex flex-col gap-4">
            <h4 className="font-medium text-slate-800 dark:text-slate-200">Available Sessions</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {timeSlots.map(slot => {
                const slotCandidates = examCandidates.filter(c => c.examSlot === slot.id);
                const isFull = slotCandidates.length >= slot.capacity;
                return (
                  <div 
                    key={slot.id}
                    onDrop={(e) => handleDrop(e, slot.id)}
                    onDragOver={handleDragOver}
                    className="bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col min-h-[300px]"
                  >
                    <div className="border-b border-slate-200 dark:border-white/5 pb-3 mb-3">
                      <div className="flex justify-between items-start mb-1">
                        <h5 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{slot.label}</h5>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                          isFull ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                          {slotCandidates.length} / {slot.capacity}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center text-xs text-slate-500 gap-2">
                          <Calendar className="w-3.5 h-3.5" />
                          {slot.date}
                        </div>
                        <div className="flex items-center text-xs text-slate-500 gap-2">
                          <Clock className="w-3.5 h-3.5" />
                          {slot.duration || 90} Min
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
                      {slotCandidates.map(c => (
                        <div key={c.id} className="flex justify-between items-center group bg-slate-50 dark:bg-white/5 p-2 rounded border border-slate-200 dark:border-white/10">
                          <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.name}</div>
                            <div className="text-xs text-slate-500">{c.registrationNumber || c.id}</div>
                          </div>
                          <button 
                            onClick={async () => await updateDoc(doc(db, 'candidates', c.id), { examSlot: null })}
                            className="text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {slotCandidates.length === 0 && (
                        <div className="text-center text-slate-500 text-xs py-4 flex flex-col items-center gap-2 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-lg p-4">
                          <AlertCircle className="w-5 h-5 text-slate-400" />
                          Drag drop candidate here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBuilder = () => {
    const handleAddOption = () => {
        setQuestionFormData(prev => ({...prev, options: [...prev.options, '']}));
    };
    const handleRemoveOption = (idx: number) => {
        if (questionFormData.options.length <= 2) {
          showCbtToast('Minimum 2 options required.', 'error');
          return;
        }
        setQuestionFormData(prev => {
           const newOptions = prev.options.filter((_, i) => i !== idx);
           const newCorrect = prev.correctAnswer >= newOptions.length ? newOptions.length - 1 : (prev.correctAnswer === idx ? 0 : (prev.correctAnswer > idx ? prev.correctAnswer - 1 : prev.correctAnswer));
           return { ...prev, options: newOptions, correctAnswer: newCorrect };
        });
    };

    return (
    <div className="flex flex-col lg:flex-row gap-6 max-h-none lg:max-h-[85vh] animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Editor Pane */}
      <div className="flex-1 flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
             <BrainCircuit className="w-5 h-5 text-indigo-500" />
             Question Builder
           </h3>
           <div className="flex gap-2">
              <button 
                onClick={() => setActiveTab('questions')}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => setQuestionFormData({ subject: cbtConfig.subjects[0] || '', grade: cbtConfig.grades[0] || '', template: cbtConfig.templates[0] || '', text: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '', difficulty: 'Medium', tags: '' })}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
              >
                Clear
              </button>
              <button 
                onClick={() => handleSaveQuestion(false)}
                className="px-4 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors shadow-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Save & Add Another
              </button>
              <button 
                onClick={() => handleSaveQuestion(true)}
                className="px-4 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors shadow-sm flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save
              </button>
           </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-6">
           <div className="grid grid-cols-7 gap-4">
               <div className="col-span-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Subject</label>
                  <select 
                     value={questionFormData.subject}
                     onChange={(e) => setQuestionFormData({...questionFormData, subject: e.target.value})}
                     className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                     {cbtConfig.subjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
               </div>
               <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Grade</label>
                  <select 
                     value={questionFormData.grade}
                     onChange={(e) => setQuestionFormData({...questionFormData, grade: e.target.value})}
                     className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                     {cbtConfig.grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
               </div>
               <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Packet</label>
                  <select 
                     value={questionFormData.template}
                     onChange={(e) => setQuestionFormData({...questionFormData, template: e.target.value})}
                     className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                     {cbtConfig.templates.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
               </div>
           </div>

           <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Question Content</label>
              <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 dark:[&_.ql-toolbar]:border-slate-700 [&_.ql-container]:border-none [&_.ql-editor]:min-h-[150px]">
                 <ReactQuill 
                    theme="snow"
                    value={questionFormData.text}
                    onChange={(val) => setQuestionFormData({...questionFormData, text: val})}
                    modules={{
                      toolbar: [
                          [{ 'header': [1, 2, false] }],
                          ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                          [{'list': 'ordered'}, {'list': 'bullet'}],
                          ['link', 'image', 'code-block'],
                          ['clean']
                      ]
                    }}
                 />
              </div>
           </div>

           <div>
              <div className="flex justify-between items-center mb-2">
                 <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Answer Options</label>
                 <button onClick={handleAddOption} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus className="w-3 h-3"/> Add Option</button>
              </div>
              <div className="space-y-3">
                 {questionFormData.options.map((opt, idx) => (
                    <div key={idx} className="flex items-start gap-3 bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 relative group transition-colors focus-within:border-indigo-400">
                       <input 
                          type="radio" 
                          name="builderCorrectAnswer" 
                          checked={questionFormData.correctAnswer === idx}
                          onChange={() => setQuestionFormData({...questionFormData, correctAnswer: idx})}
                          className="w-4 h-4 mt-2.5 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                          title="Mark as correct answer"
                       />
                       <div className="flex-1 shrink-0">
                          <input 
                            type="text" 
                            value={opt ?? ''}
                            onChange={(e) => {
                               const newOpts = [...questionFormData.options];
                               newOpts[idx] = e.target.value;
                               setQuestionFormData({...questionFormData, options: newOpts});
                            }}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            placeholder={`Option ${String.fromCharCode(65 + idx)} text...`}
                          />
                       </div>
                       {questionFormData.options.length > 2 && (
                          <button onClick={() => handleRemoveOption(idx)} className="p-2 mt-0.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
                             <Trash2 className="w-4 h-4" />
                          </button>
                       )}
                    </div>
                 ))}
              </div>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Difficulty</label>
                 <select 
                     value={questionFormData.difficulty}
                     onChange={(e) => setQuestionFormData({...questionFormData, difficulty: e.target.value})}
                     className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                     <option>Easy</option>
                     <option>Medium</option>
                     <option>Hard</option>
                  </select>
              </div>
              <div>
                 <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Tags (Comma separated)</label>
                 <input 
                     type="text"
                     value={questionFormData.tags}
                     onChange={(e) => setQuestionFormData({...questionFormData, tags: e.target.value})}
                     placeholder="e.g. algebra, functions"
                     className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
              </div>
           </div>

           <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Explanation (Optional)</label>
              <textarea 
                  value={questionFormData.explanation}
                  onChange={(e) => setQuestionFormData({...questionFormData, explanation: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                  placeholder="Explain why the correct answer is right..."
              />
           </div>
        </div>
      </div>

      {/* Preview Pane */}
      <div className="flex lg:flex lg:w-[45%] flex-col gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
         <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
               <MonitorPlay className="w-5 h-5 text-sky-500" />
               Live Preview
            </h3>
         </div>
         <div className="p-6 overflow-y-auto w-full">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex gap-2">
                   <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded text-xs font-bold uppercase tracking-wider">{questionFormData.subject}</span>
                   <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold uppercase tracking-wider",
                      questionFormData.difficulty === 'Easy' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
                      questionFormData.difficulty === 'Medium' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                      'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
                   )}>
                      {questionFormData.difficulty}
                   </span>
                </div>
                
                <div className="prose dark:prose-invert max-w-none font-medium text-slate-800 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: questionFormData.text || '<p class="text-slate-400 italic">Enter question content to preview...</p>' }} />
                
                <div className="space-y-3 pt-4">
                   {questionFormData.options.map((opt, idx) => (
                      <div key={idx} className={cn(
                         "p-4 border rounded-xl flex items-center gap-4 transition-all",
                         questionFormData.correctAnswer === idx 
                           ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,1)]" 
                           : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      )}>
                         <div className={cn(
                            "w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm shrink-0",
                            questionFormData.correctAnswer === idx
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                         )}>
                            {String.fromCharCode(65 + idx)}
                         </div>
                         <div className="flex-1 text-slate-700 dark:text-slate-300 break-words">{opt || <span className="text-slate-400 italic">Option text...</span>}</div>
                         {questionFormData.correctAnswer === idx && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                      </div>
                   ))}
                </div>

                {questionFormData.explanation && (
                   <div className="mt-8 p-4 bg-sky-50 dark:bg-sky-500/10 border-l-4 border-sky-500 rounded-r-lg">
                      <h4 className="font-bold text-sky-800 dark:text-sky-300 text-sm mb-1 uppercase tracking-wider flex items-center gap-2"><BookOpen className="w-4 h-4"/> Explanation</h4>
                      <p className="text-sky-900 dark:text-sky-200 text-sm leading-relaxed">{questionFormData.explanation}</p>
                   </div>
                )}
            </div>
         </div>
      </div>

    </div>
    );
  };

  const renderPackages = () => {
    const packageMap = new Map<string, { subject: string; grade: string; template: string; count: number, id: string }>();
    questions.forEach(q => {
      const key = `${q.subject}|${q.grade}|${q.template}`;
      if (!packageMap.has(key)) {
        packageMap.set(key, { subject: q.subject, grade: q.grade, template: q.template, count: 0, id: key });
      }
      packageMap.get(key)!.count += 1;
    });

    const packages = Array.from(packageMap.values());

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl">
           <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Package Overview</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">View and analyze all available question packages across subjects and grades.</p>
           </div>
        </div>

        {packages.length === 0 ? (
           <div className="text-center p-12 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm">
              <Package className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Packages Yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Start building questions to see packages here.</p>
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {packages.map(pkg => (
                <div key={pkg.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col">
                   <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex-1">
                      <div className="flex justify-between items-start mb-4">
                         <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                            <Layers className="w-5 h-5" />
                         </div>
                         <span className={cn("px-2.5 py-1 text-xs font-bold rounded-full lowercase", pkg.count >= 10 ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400")}>
                            {pkg.count} questions
                         </span>
                      </div>
                      <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-3">{pkg.subject}</h4>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded">{pkg.grade}</span> 
                        <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-2 py-1 rounded shadow-sm">{pkg.template}</span>
                      </div>
                   </div>
                   <div className="p-4 bg-white dark:bg-slate-900 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                         {pkg.count >= 10 ? 'Ready for deployment' : 'Needs content'}
                      </div>
                      <button 
                         onClick={() => {
                           setQbSubject(pkg.subject);
                           setQbGrade(pkg.grade);
                           setQbTemplate(pkg.template);
                           setActiveTab('questions');
                         }}
                         className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100"
                      >
                         Manage <ChevronRight className="w-4 h-4" />
                      </button>
                   </div>
                </div>
              ))}
           </div>
        )}
      </div>
    );
  };

  const renderBank = () => {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl">
           <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-500" /> Question Bank Master</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">View and manage all questions across all subjects and grades.</p>
           </div>
           <div className="flex gap-2">
             <button 
               onClick={() => setActiveTab('builder')}
               className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
             >
               <Plus className="w-4 h-4" /> Add Question
             </button>
           </div>
        </div>

        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto min-h-[400px]">
             {questions.length === 0 ? (
               <div className="text-center text-slate-500 py-16 space-y-4">
                 <Database className="w-12 h-12 mx-auto opacity-20 text-indigo-500" />
                 <p className="text-base font-medium">Bank is empty.</p>
               </div>
             ) : (
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60">
                     <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[300px]">Question Snippet</th>
                     <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subject</th>
                     <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Grade Target</th>
                     <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Difficulty</th>
                     <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right pr-6">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                   {questions.map((q) => (
                     <tr key={q.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors group">
                       <td className="p-4">
                          <div 
                             className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 max-w-md"
                             dangerouslySetInnerHTML={{ __html: q.text?.replace(/<[^>]+>/g, ' ').substring(0, 100) + (q.text?.length > 100 ? '...' : '') || 'No text' }}
                          />
                       </td>
                       <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-500/20 whitespace-nowrap">
                             <Layers className="w-3.5 h-3.5" />
                             {q.subject}
                          </span>
                       </td>
                       <td className="p-4">
                          <div className="flex gap-1.5 flex-col w-max">
                             <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">{q.grade || 'SMA'}</span>
                             <span className="text-[10px] text-sky-600 dark:text-sky-400 font-bold px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-500/10 w-fit">{q.template || 'Paket A'}</span>
                          </div>
                       </td>
                       <td className="p-4 text-center">
                          <span className={cn(
                             "px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider",
                             q.difficulty === 'Easy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                             q.difficulty === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' :
                             'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                          )}>
                             {q.difficulty || 'Medium'}
                          </span>
                       </td>
                       <td className="p-4 text-right pr-6">
                          <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                             <button
                               onClick={() => setPreviewQuestion(q)}
                               className="p-1.5 border border-slate-200 dark:border-white/10 rounded text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors shadow-sm"
                               title="Preview Question"
                             >
                                <Eye className="w-4 h-4" />
                             </button>
                             <button
                               onClick={() => {
                                  setEditingQuestion(q);
                                  setQuestionFormData({ subject: q.subject || '', grade: q.grade || 'SMA', template: q.template || 'Paket A', text: q.text || '', options: q.options || ['', '', '', ''], correctAnswer: q.correctAnswer || 0, explanation: q.explanation || '', difficulty: q.difficulty || 'Medium', tags: q.tags || '' });
                                  setActiveTab('builder');
                               }}
                               className="p-1.5 border border-slate-200 dark:border-white/10 rounded text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors shadow-sm"
                             >
                                <Edit2 className="w-4 h-4" />
                             </button>
                             <button
                               onClick={() => handleDeleteQuestion(q.id)}
                               className="p-1.5 border border-slate-200 dark:border-white/10 rounded text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shadow-sm"
                             >
                                <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             )}
          </div>
        </div>
      </div>
    );
  };

  const renderMonitor = () => {
    const activeSessions = timeSlots.slice(0, 3); // using first few as mock live sessions

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl">
           <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                 <Activity className="w-5 h-5 text-emerald-500" />
                 Live Session Monitor
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Monitor active exam sessions in real-time.</p>
           </div>
           <div className="text-right">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Server Time</div>
              <div className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-black/40 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10">
                 {currentTime.toLocaleTimeString()}
              </div>
           </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {activeSessions.map((session, i) => {
             // Fake an end time based on the session start string or just random
             const maxDuration = (session.duration || 90) * 60;
             const mockSecondsRemaining = maxDuration - (currentTime.getSeconds() + (currentTime.getMinutes() * 60) + i * 1000) % maxDuration;
             const hrs = Math.floor(mockSecondsRemaining / 3600);
             const mins = Math.floor((mockSecondsRemaining % 3600) / 60);
             const secs = mockSecondsRemaining % 60;
             const timeStr = `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

             return (
             <div key={session.id} className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden hover:border-emerald-500/50 transition-colors">
                 <div className="p-4 border-b border-slate-100 dark:border-white/5 flex justify-between items-start">
                    <div>
                       <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Live</span>
                       </div>
                       <h4 className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">{session.label || session.id}</h4>
                    </div>
                    <div className="text-right flex flex-col items-end">
                       <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-xs font-mono font-medium mb-1 border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          {timeStr}
                       </div>
                       <div className="text-xl font-bold text-slate-800 dark:text-slate-200 leading-none">{session.assignedIds ? session.assignedIds.length : 0}</div>
                       <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">Active Users</div>
                    </div>
                 </div>
                 <div className="p-4 space-y-4">
                    <div>
                       <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Progress</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{Math.floor(Math.random() * 40) + 40}% avg</span>
                       </div>
                       <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{width: `${Math.floor(Math.random() * 40) + 40}%`}}></div>
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                       <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Recent Events</div>
                       {[1, 2, 3].map(evt => (
                         <div key={evt} className="flex items-center gap-2 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-slate-600 dark:text-slate-300 truncate">Candidate {Math.floor(Math.random() * 1000)} submitted test</span>
                         </div>
                       ))}
                    </div>
                 </div>
             </div>
           )})}
           {activeSessions.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                 <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
                 <p>No active sessions at the moment.</p>
              </div>
           )}
        </div>
      </div>
    );
  };

  const renderResults = () => {
    const computedResults = candidates
      .filter(c => c.examScores)
      .map(c => {
         const math = c.examScores.math || 0;
         const science = c.examScores.science || 0;
         const english = c.examScores.english || 0;
         const total = math + science + english;
         const average = Math.round(total / 3);
         return {
           id: c.id,
           applicant: c.name,
           session: c.examSlot ? timeSlots.find(s => s.id === c.examSlot)?.label || c.examSlot : 'Unassigned',
           score: average,
           passed: average >= 65, 
         };
      })
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const pieData = [
      { name: 'Passed', value: computedResults.filter(r => r.passed).length },
      { name: 'Failed', value: computedResults.filter(r => !r.passed).length }
    ];
    const COLORS = ['#10b981', '#f43f5e'];

    const distribution = {
      '0-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0
    };
    computedResults.forEach(r => {
      if (r.score <= 40) distribution['0-40']++;
      else if (r.score <= 60) distribution['41-60']++;
      else if (r.score <= 80) distribution['61-80']++;
      else distribution['81-100']++;
    });
    const dynamicScoreDistribution = Object.keys(distribution).map(k => ({ name: k, count: distribution[k as keyof typeof distribution] }));

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6">
            <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Score Distribution
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dynamicScoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: '#1e293b'}}
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6">
            <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-indigo-400" />
              Pass / Fail Ratio
            </h3>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-black/20 flex justify-between items-center">
             <h3 className="font-medium text-slate-800 dark:text-slate-200">Recent Exam Results</h3>
             <div className="flex gap-2">
               <button
                 onClick={async () => {
                   try {
                     let syncedCount = 0;
                     const batch = writeBatch(db);
                     for (const r of computedResults) {
                       batch.update(doc(db, 'candidates', r.id), {
                         score: r.score,
                         cbtSync: {
                           syncedAt: new Date().toISOString(),
                           cbtExamId: r.session,
                           passed: r.passed,
                           averageScore: r.score,
                         },
                       });
                       syncedCount++;
                     }
                     if (syncedCount > 0) {
                       await batch.commit();
                     }
                     showCbtToast(`✅ Berhasil menyinkronkan ${syncedCount} nilai ujian ke Modul PPDB!`, 'success');
                   } catch (e) {
                     console.error(e);
                     showCbtToast('Gagal menyinkronkan nilai ke modul PPDB.', 'error');
                   }
                 }}
                 className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
               >
                 <CheckCircle2 className="w-3.5 h-3.5" />
                 Sinkronkan ke Modul PPDB
               </button>
               <button className="text-sm bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300  px-3 py-1.5 rounded-lg transition-colors">
                 Export CSV
               </button>
             </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/5 bg-black/60">
                <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Result ID</th>
                <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Applicant Name</th>
                <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Session</th>
                <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Score</th>
                <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Status</th>
                <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {computedResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">No exam results available yet.</td>
                </tr>
              ) : computedResults.map(result => (
                <tr key={result.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer">
                  <td className="p-4 font-mono text-xs text-slate-500">{result.id.slice(0, 8)}...</td>
                  <td className="p-4 font-medium text-slate-800 dark:text-slate-200">{result.applicant}</td>
                  <td className="p-4 text-sm text-slate-500 dark:text-slate-400">{result.session}</td>
                  <td className="p-4 text-right font-bold text-slate-800 dark:text-slate-200">{result.score}</td>
                  <td className="p-4 text-center">
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] uppercase font-bold",
                      result.passed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    )}>
                      {result.passed ? 'Passed' : 'Failed'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded text-xs">#{result.rank}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    );
  };

  const renderQuestions = () => {
    const currentQbSubject = qbSubject || cbtConfig.subjects[0] || '';
    const currentQbGrade = qbGrade || cbtConfig.grades[0] || '';
    const currentQbTemplate = qbTemplate || cbtConfig.templates[0] || '';

    const filteredQuestions = questions.filter(q => 
       q.subject === currentQbSubject && 
       (q.grade || 'SMA') === currentQbGrade && 
       (q.template || 'Paket A') === currentQbTemplate
    );

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-4 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl">
           <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
             <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Question Bank (Paket Soal)</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Select parameters to manage a specific test set.</p>
             </div>
              <div className="flex gap-2">
               <input
                 type="file"
                 accept=".csv, .xlsx, .xls"
                 className="hidden"
                 ref={fileInputRef}
                 onChange={handleBulkUpload}
               />
               <button
                 onClick={() => fileInputRef.current?.click()}
                 className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-sky-500/20 whitespace-nowrap"
               >
                 <Upload className="w-4 h-4" /> Upload
               </button>
               <button 
                 onClick={() => {
                    const headers = ['Subject', 'Grade', 'Template', 'Question', 'Option_A', 'Option_B', 'Option_C', 'Option_D', 'Correct_Answer'];
                    const rows = filteredQuestions.map(q => {
                      const textPlain = (q.text || '').replace(/<[^>]+>/g, '').replace(/"/g, '""');
                      const options = (q.options || ['', '', '', '']).map((opt: string) => opt.replace(/"/g, '""'));
                      return [
                        `"${q.subject}"`,
                        `"${q.grade || 'SMA'}"`,
                        `"${q.template || 'Paket A'}"`,
                        `"${textPlain}"`,
                        `"${options[0]}"`,
                        `"${options[1]}"`,
                        `"${options[2]}"`,
                        `"${options[3]}"`,
                        `"${['A', 'B', 'C', 'D'][q.correctAnswer] || q.correctAnswer}"`
                      ];
                    });
                    
                    const worksheetData = [headers, ...rows];
                    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
                    const fileName = `question_bank_${currentQbSubject}_${currentQbGrade}_${currentQbTemplate}.xlsx`.replace(/\s+/g, '_');
                    
                    XLSX.writeFile(workbook, fileName);
                 }}
                 className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 whitespace-nowrap"
               >
                 <Download className="w-4 h-4" /> Download Excel
               </button>
             </div>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 dark:border-white/10 pt-4">
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Subject / Category</label>
                 <select 
                   value={currentQbSubject} 
                   onChange={(e) => setQbSubject(e.target.value)} 
                   className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 >
                   {cbtConfig.subjects.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Grade (Target)</label>
                 <select 
                   value={currentQbGrade} 
                   onChange={(e) => setQbGrade(e.target.value)} 
                   className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 >
                   {cbtConfig.grades.map(g => <option key={g} value={g}>{g}</option>)}
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Paket Soal (Template)</label>
                 <select 
                   value={currentQbTemplate} 
                   onChange={(e) => setQbTemplate(e.target.value)} 
                   className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 >
                   {cbtConfig.templates.map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
              </div>
           </div>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="text-center text-slate-500 py-10 space-y-4 bg-black/20 rounded-xl border border-slate-200 dark:border-white/5">
            <BookOpen className="w-12 h-12 mx-auto opacity-20" />
            <p>No questions found for this specific set.</p>
          </div>
        ) : (
          <div className="bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden p-6">
             <h4 className="font-bold text-indigo-700 dark:text-indigo-400 text-lg mb-6 flex flex-col sm:flex-row sm:items-center gap-2 border-b border-indigo-500/20 pb-4">
                <div className="flex items-center gap-2">
                   <Layers className="w-5 h-5" /> 
                   <span>{currentQbSubject}</span>
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                   <span className="text-sm font-medium px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500">Grade: {currentQbGrade}</span>
                   <span className="text-sm font-medium px-3 py-1 rounded-full bg-blue-500/20 text-blue-400">{currentQbTemplate}</span>
                </div>
             </h4>
             
             <div className="space-y-6">
                {filteredQuestions.map((q, idx) => (
                   <div key={q.id} className="bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-5 group hover:border-indigo-500/50 transition-colors">
                      <div className="flex justify-between items-start gap-4">
                         <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                               <span className="text-xs font-bold bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full">Question {idx + 1}</span>
                            </div>
                            <div 
                               className="font-medium text-slate-800 dark:text-slate-200 text-base mb-4 prose dark:prose-invert max-w-none"
                               dangerouslySetInnerHTML={{ __html: q.text }}
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                               {q.options?.map((opt: string, oIdx: number) => (
                                  <div key={oIdx} className={cn(
                                     "px-4 py-3 rounded-lg border flex items-center gap-3 transition-colors",
                                     q.correctAnswer === oIdx ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm" : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 bg-white/50 dark:bg-transparent"
                                  )}>
                                     <span className={cn(
                                        "flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs",
                                        q.correctAnswer === oIdx ? "bg-emerald-500/20 text-emerald-500" : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                                     )}>
                                        {['A', 'B', 'C', 'D'][oIdx]}
                                     </span>
                                     <span className="flex-1">{opt}</span>
                                  </div>
                               ))}
                            </div>
                         </div>
                         <div className="flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setPreviewQuestion(q)}
                              className="p-2 border border-slate-200 dark:border-white/10 rounded-lg text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-400 transition-colors bg-white dark:bg-slate-800 shadow-sm dark:shadow-none"
                              title="Preview Question"
                            >
                               <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                 setEditingQuestion(q);
                                 setQuestionFormData({ subject: q.subject || '', grade: q.grade || 'SMA', template: q.template || 'Paket A', text: q.text || '', options: q.options || ['', '', '', ''], correctAnswer: q.correctAnswer || 0, explanation: q.explanation || '', difficulty: q.difficulty || 'Medium', tags: q.tags || '' });
                                 setActiveTab('builder');
                              }}
                              className="p-2 border border-slate-200 dark:border-white/10 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 transition-colors bg-white dark:bg-slate-800 shadow-sm dark:shadow-none"
                            >
                               <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="p-2 border border-slate-200 dark:border-white/10 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-400 transition-colors bg-white dark:bg-slate-800 shadow-sm dark:shadow-none"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
             
             {filteredQuestions.length > 0 && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/10">
                   <h5 className="font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                     <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Scoring Answer Key
                   </h5>
                   <div className="flex flex-wrap gap-2">
                      {filteredQuestions.map((q, idx) => (
                         <div key={idx} className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-slate-200 dark:border-white/10 min-w-[3.5rem] hover:bg-white/10 transition-colors">
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">Q{idx + 1}</span>
                            <span className="font-bold text-emerald-500 text-lg leading-none">{['A', 'B', 'C', 'D'][q.correctAnswer]}</span>
                         </div>
                      ))}
                   </div>
                </div>
             )}
          </div>
        )}
      </div>
    );
  };

  const handleSaveConfigItem = async () => {
    if (!configModal.type || !configInputValue.trim()) return;
    try {
      const type = configModal.type;
      const value = configInputValue.trim();
      const currentList = cbtConfig[type] || [];
      if (!currentList.includes(value)) {
         await updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), {
            [type]: [...currentList, value]
         });
      }
      setConfigModal({ isOpen: false, type: null });
      setConfigInputValue('');
      showCbtToast('Item konfigurasi berhasil ditambahkan', 'success');
    } catch(e) {
      console.error(e);
      showCbtToast('Failed to add config item', 'error');
    }
  };

  const handleRemoveConfigItem = async (type: 'subjects' | 'grades' | 'templates', value: string) => {
    try {
      const currentList = cbtConfig[type] || [];
      await updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), {
         [type]: currentList.filter(item => item !== value)
      });
      showCbtToast('Item konfigurasi berhasil dihapus', 'info');
    } catch(e) {
      console.error(e);
      showCbtToast('Failed to remove config item', 'error');
    }
  };

  const renderConfigList = (title: string, type: 'subjects' | 'grades' | 'templates', items: string[]) => (
     <div className="bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
        <div className="flex justify-between items-center mb-4">
           <h4 className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{title}</h4>
           <button 
             onClick={() => {
                setConfigInputValue('');
                setConfigModal({ isOpen: true, type });
             }}
             className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 flex items-center gap-1 rounded transition-colors"
           >
             <Plus className="w-3 h-3" /> Add
           </button>
        </div>
        <div className="space-y-2">
           {items.map(item => (
              <div key={item} className="flex justify-between items-center gap-2 p-2 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/10 text-sm">
                 <span className="text-slate-700 dark:text-slate-300">{item}</span>
                 <button onClick={() => handleRemoveConfigItem(type, item)} className="text-red-400 hover:text-red-500 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                 </button>
              </div>
           ))}
           {items.length === 0 && <div className="text-xs text-slate-500">No items configured.</div>}
        </div>
     </div>
  );

  const renderSettings = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl">
         <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">CBT Configuration</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Manage categories, grades, and test templates used across the application.</p>
         </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {renderConfigList("Subjects / Categories", "subjects", cbtConfig.subjects)}
         {renderConfigList("Grades / Targets", "grades", cbtConfig.grades)}
         {renderConfigList("Paket Soal (Templates)", "templates", cbtConfig.templates)}
      </div>
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-6 rounded-xl mt-6 space-y-6">
         <div className="flex justify-between items-center">
             <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Exam Rules & Automation</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Configure automated grading and result processing.</p>
             </div>
             <div className="flex items-center gap-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={cbtConfig.shuffleQuestions}
                    onChange={async (e) => {
                       const newValue = e.target.checked;
                       setCbtConfig(prev => ({...prev, shuffleQuestions: newValue}));
                       try {
                          await updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), {
                             shuffleQuestions: newValue
                          });
                       } catch(err) {
                          console.error(err);
                       }
                    }}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                  <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">{cbtConfig.shuffleQuestions ? 'Shuffle Enabled' : 'Shuffle Disabled'}</span>
                </label>
                <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-2"></div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={cbtConfig.autoGrading}
                    onChange={async (e) => {
                       const newValue = e.target.checked;
                       setCbtConfig(prev => ({...prev, autoGrading: newValue}));
                       try {
                          await updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), {
                             autoGrading: newValue
                          });
                       } catch(err) {
                          console.error(err);
                       }
                    }}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                  <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">{cbtConfig.autoGrading ? 'Auto-Grading Enabled' : 'Auto-Grading Disabled'}</span>
                </label>
             </div>
         </div>
         {cbtConfig.autoGrading && (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-200 dark:border-white/10">
                <div>
                   <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Correct Answer Score</label>
                   <input 
                     type="number"
                     value={cbtConfig.correctScore}
                     onChange={async (e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCbtConfig(prev => ({...prev, correctScore: val}));
                        try { await updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), { correctScore: val }); } catch(err) {}
                     }}
                     className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-black/20 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                   />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wrong Answer Penalty</label>
                   <input 
                     type="number"
                     value={cbtConfig.wrongScore}
                     onChange={async (e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCbtConfig(prev => ({...prev, wrongScore: val}));
                        try { await updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), { wrongScore: val }); } catch(err) {}
                     }}
                     className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-black/20 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                   />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blank Answer Score</label>
                   <input 
                     type="number"
                     value={cbtConfig.blankScore}
                     onChange={async (e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCbtConfig(prev => ({...prev, blankScore: val}));
                        try { await updateDoc(doc(db, 'cbt_config', user?.tenantId || '__tenant_scope_unavailable__'), { blankScore: val }); } catch(err) {}
                     }}
                     className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-black/20 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                   />
                </div>
             </div>
         )}
      </div>
    </div>
  );

  const handleOpenQuickSetup = () => {
    const today = new Date().toISOString().split('T')[0];
    const defaultSubject = cbtConfig.subjects.length > 0 ? cbtConfig.subjects[0] : '';
    const defaultGrade = cbtConfig.grades.length > 0 ? cbtConfig.grades[0] : '';

    setSessionFormData({
      label: `${defaultSubject} - ${defaultGrade}`,
      date: today,
      capacity: 25,
      subject: defaultSubject,
      grade: defaultGrade,
      duration: 120
    });
    setShowSessionForm(true);
  };

  const handleSaveSession = () => {
    if (!sessionFormData.label.trim() || !sessionFormData.date) {
      showCbtToast("All fields are required.", "error");
      return;
    }
    setTimeSlots([
      ...timeSlots,
      {
        id: `session-${Date.now()}`,
        label: sessionFormData.label,
        date: sessionFormData.date,
        capacity: sessionFormData.capacity,
        duration: sessionFormData.duration
      }
    ]);
    setShowSessionForm(false);
    setSessionFormData({ label: '', date: '', capacity: 25, subject: '', grade: '', duration: 90 });
    showCbtToast("Sesi ujian berhasil ditambahkan!", "success");
  };

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-12 relative">
      {cbtToast && (
        <div className={cn(
          "fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 animate-in slide-in-from-top-3",
          cbtToast.type === 'success' && "bg-emerald-950/90 border-emerald-500/40 text-emerald-200",
          cbtToast.type === 'error' && "bg-rose-950/90 border-rose-500/40 text-rose-200",
          cbtToast.type === 'info' && "bg-indigo-950/90 border-indigo-500/40 text-indigo-200"
        )}>
          {cbtToast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {cbtToast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
          {cbtToast.type === 'info' && <BrainCircuit className="w-5 h-5 text-indigo-400 shrink-0" />}
          <span>{cbtToast.message}</span>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-indigo-500 pb-1 inline-block">CBT Seleksi Masuk</h1>
          <p className="text-slate-500 text-sm mt-2">Manage Computer Based Test sessions for new student admissions.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleInjectDemoData}
            disabled={isInjecting}
            className="bg-indigo-950/50 hover:bg-indigo-900 border border-indigo-500/20 text-indigo-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isInjecting ? 'Injecting...' : 'Inject Demo'}
          </button>
          <button 
             onClick={handleOpenQuickSetup}
             className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" /> Quick Setup
          </button>
        </div>
      </div>

      <div className="bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-white/5 bg-black/40 overflow-x-auto">
          <div className="flex w-max min-w-full">
            {[
              { id: 'overview', label: 'Dashboard', icon: <Activity className="w-4 h-4" /> },
              { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
              { id: 'sessions', label: 'Exam Sessions', icon: <MonitorPlay className="w-4 h-4" /> },
              { id: 'packages', label: 'Package Overview', icon: <Package className="w-4 h-4" /> },
              { id: 'questions', label: 'Package Details', icon: <Layers className="w-4 h-4" /> },
              { id: 'bank', label: 'Question Bank', icon: <Database className="w-4 h-4" /> },
              { id: 'builder', label: 'Question Builder', icon: <Edit2 className="w-4 h-4" /> },
              { id: 'monitor', label: 'Live Monitor', icon: <Activity className="w-4 h-4" /> },
              { id: 'results', label: 'Results & Analytics', icon: <FileSignature className="w-4 h-4" /> },
              { id: 'settings', label: 'Config / Settings', icon: <Settings className="w-4 h-4" /> },
            ].map(tab => (
              <button aria-pressed={activeTab === tab.id}
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn("erp-tab-control", 
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative border-b-2",
                  activeTab === tab.id 
                    ? "text-indigo-400 border-indigo-500 bg-indigo-500/5" 
                    : "text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/20 border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2  rounded-lg text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-80 bg-slate-50 dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300 h-10"
              />
            </div>
            <button className="px-3 h-10  rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center gap-2 transition-colors focus:outline-none">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">Filter</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 min-h-[500px]">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'monitor' && renderMonitor()}
          {activeTab === 'results' && renderResults()}
          {activeTab === 'sessions' && renderSessions()}
          {activeTab === 'calendar' && renderCalendar()}
          {activeTab === 'packages' && renderPackages()}
          {activeTab === 'questions' && renderQuestions()}
          {activeTab === 'bank' && renderBank()}
          {activeTab === 'builder' && renderBuilder()}
          {activeTab === 'settings' && renderSettings()}
        </div>
      </div>

      {configModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800">
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
                 <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                    Add New {configModal.type === 'subjects' ? 'Subject' : configModal.type === 'grades' ? 'Grade' : 'Paket Soal'}
                 </h2>
                 <button onClick={() => setConfigModal({ isOpen: false, type: null })} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                    <X className="w-5 h-5" />
                 </button>
              </div>
              <div className="p-6 space-y-4">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name / Label</label>
                    <input 
                      type="text" 
                      value={configInputValue}
                      onChange={(e) => setConfigInputValue(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                      onKeyDown={(e) => {
                         if (e.key === 'Enter') handleSaveConfigItem();
                      }}
                    />
                 </div>
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 sticky bottom-0 bg-slate-50 dark:bg-slate-900 z-10 rounded-b-2xl">
                 <button 
                   onClick={() => setConfigModal({ isOpen: false, type: null })}
                   className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-sm"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={handleSaveConfigItem}
                   disabled={!configInputValue.trim()}
                   className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-indigo-500/20"
                 >
                   Save
                 </button>
              </div>
           </div>
        </div>
      )}

      {showSessionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800">
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
                 <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <MonitorPlay className="w-5 h-5 text-indigo-500" />
                    Quick Setup: Exam Session
                 </h2>
                 <button onClick={() => setShowSessionForm(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                    <X className="w-5 h-5" />
                 </button>
              </div>
              <div className="p-6 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject / Category</label>
                        <select 
                           value={sessionFormData.subject}
                           onChange={(e) => {
                               const newSubject = e.target.value;
                               setSessionFormData(prev => ({
                                   ...prev, 
                                   subject: newSubject,
                                   label: `${newSubject} - ${prev.grade}`
                               }))
                           }}
                           className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                           <option value="">Select...</option>
                           {cbtConfig.subjects.map(s => <option key={`sub-${s}`} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Grade Level</label>
                        <select 
                           value={sessionFormData.grade}
                           onChange={(e) => {
                               const newGrade = e.target.value;
                               setSessionFormData(prev => ({
                                   ...prev, 
                                   grade: newGrade,
                                   label: `${prev.subject} - ${newGrade}`
                               }))
                           }}
                           className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                           <option value="">Select...</option>
                           {cbtConfig.grades.map(s => <option key={`grade-${s}`} value={s}>{s}</option>)}
                        </select>
                    </div>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Session Label (Auto-generated)</label>
                    <input 
                      type="text" 
                      value={sessionFormData.label}
                      onChange={(e) => setSessionFormData({...sessionFormData, label: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-black/20 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
                        <input 
                          type="date" 
                          value={sessionFormData.date}
                          onChange={(e) => setSessionFormData({...sessionFormData, date: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Capacity</label>
                        <input 
                          type="number" 
                          value={sessionFormData.capacity}
                          onChange={(e) => setSessionFormData({...sessionFormData, capacity: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Duration (Min)</label>
                        <input 
                          type="number" 
                          value={sessionFormData.duration}
                          onChange={(e) => setSessionFormData({...sessionFormData, duration: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                     </div>
                 </div>
              </div>
              <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-900 z-10">
                 <button 
                   onClick={() => setShowSessionForm(false)}
                   className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-sm"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={handleSaveSession}
                   className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-indigo-500/20"
                 >
                   Save Session
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Question Previewer Modal */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 rounded-t-2xl">
                 <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <MonitorPlay className="w-5 h-5 text-sky-500" />
                    Question Previewer
                 </h2>
                 <button onClick={() => setPreviewQuestion(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                    <X className="w-5 h-5" />
                 </button>
              </div>
              <div className="p-6 overflow-y-auto w-full">
                 <div className="max-w-2xl mx-auto space-y-6">
                     <div className="flex gap-2">
                        <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded text-xs font-bold uppercase tracking-wider">{previewQuestion.subject}</span>
                        <span className={cn(
                           "px-2 py-1 rounded text-xs font-bold uppercase tracking-wider",
                           previewQuestion.difficulty === 'Easy' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
                           previewQuestion.difficulty === 'Medium' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                           'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
                        )}>
                           {previewQuestion.difficulty || 'Medium'}
                        </span>
                     </div>
                     
                     <div className="prose dark:prose-invert max-w-none font-medium text-slate-800 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: previewQuestion.text || '<p class="text-slate-400 italic">No content...</p>' }} />
                     
                     <div className="space-y-3 pt-4">
                        {(previewQuestion.options || []).map((opt: string, idx: number) => (
                           <div key={idx} className={cn(
                              "p-4 border rounded-xl flex items-center gap-4 transition-all",
                              previewQuestion.correctAnswer === idx 
                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,1)]" 
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                           )}>
                              <div className={cn(
                                 "w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm shrink-0",
                                 previewQuestion.correctAnswer === idx
                                   ? "bg-emerald-500 text-white"
                                   : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                              )}>
                                 {String.fromCharCode(65 + idx)}
                              </div>
                              <div className="flex-1 text-slate-700 dark:text-slate-300 break-words">{opt || <span className="text-slate-400 italic">No option...</span>}</div>
                              {previewQuestion.correctAnswer === idx && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                           </div>
                        ))}
                     </div>

                     {previewQuestion.explanation && (
                        <div className="mt-8 p-4 bg-sky-50 dark:bg-sky-500/10 border-l-4 border-sky-500 rounded-r-lg">
                           <h4 className="font-bold text-sky-800 dark:text-sky-300 text-sm mb-1 uppercase tracking-wider flex items-center gap-2"><BookOpen className="w-4 h-4"/> Explanation</h4>
                           <p className="text-sky-900 dark:text-sky-200 text-sm leading-relaxed">{previewQuestion.explanation}</p>
                        </div>
                     )}
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
