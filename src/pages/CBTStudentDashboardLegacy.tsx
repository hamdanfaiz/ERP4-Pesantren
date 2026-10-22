import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot } from "firebase/firestore";
import {
  Clock,
  CheckCircle2,
  Play,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Flag,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAuth } from "../contexts/AuthContext";

type ExamStatus = "upcoming" | "ongoing" | "completed" | "missed";

const MOCK_QUESTIONS = [
  {
    id: 1,
    text: "Berapakah hasil dari 5 + 7?",
    options: ["10", "11", "12", "13"],
    correct: 2,
  },
  {
    id: 2,
    text: "Siapakah presiden pertama Indonesia?",
    options: ["Soekarno", "Soeharto", "B.J. Habibie", "Jokowi"],
    correct: 0,
  },
  {
    id: 3,
    text: "Apa ibukota negara Jepang?",
    options: ["Seoul", "Beijing", "Tokyo", "Kyoto"],
    correct: 2,
  },
  {
    id: 4,
    text: "Hewan apakah yang bisa terbang?",
    options: ["Kucing", "Burung", "Ular", "Ikan"],
    correct: 1,
  },
  {
    id: 5,
    text: "Berapa jumlah provinsi di Indonesia saat ini?",
    options: ["34", "37", "38", "33"],
    correct: 2,
  },
];

export function CBTStudentDashboard() {
  const { role, user } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [activeExam, setActiveExam] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>(MOCK_QUESTIONS);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(tenantScopedQuery(collection(db, "cbt_questions"), user?.tenantId), (snap) => {
      const q = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
      if (q.length > 0) {
        setQuestions(q);
      }
    });
    return () => unsub();
  }, [user?.tenantId, user?.uid]);

  useEffect(() => {
    // In a real app we would fetch exams specific to the current student
    const mockExams = [
      {
        id: "1",
        title: "Matematika Dasar",
        date: "2026-06-05",
        duration: 90,
        status: "upcoming",
        type: "Seleksi Gelombang 1 - Matematika",
      },
      {
        id: "2",
        title: "B. Inggris",
        date: "2026-06-05",
        duration: 120,
        status: "ongoing",
        type: "Seleksi Gelombang 1 - B. Inggris",
      },
      {
        id: "3",
        title: "Tes Potensi Akademik",
        date: "2026-06-03",
        duration: 60,
        status: "completed",
        type: "TPA",
        score: 85,
      },
    ];
    setExams(mockExams);
  }, [user?.tenantId, user?.uid]);

  useEffect(() => {
    let timer: any;
    if (activeExam && timeLeft > 0 && !showConfirmSubmit) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && activeExam) {
      handleSubmitExam();
    }
    return () => clearInterval(timer);
  }, [activeExam, timeLeft, showConfirmSubmit]);

  const startExam = (exam: any) => {
    setActiveExam(exam);
    setTimeLeft(exam.duration * 60); // convert minutes to seconds
    setCurrentQuestion(0);
    setAnswers({});
    setFlagged({});
  };

  const handleAnswer = (optionIndex: number) => {
    setAnswers({ ...answers, [currentQuestion]: optionIndex });
  };

  const toggleFlag = () => {
    setFlagged({ ...flagged, [currentQuestion]: !flagged[currentQuestion] });
  };

  const handleSubmitExam = () => {
    // In a real app, send answers to server
    alert("Exam submitted successfully!");
    setActiveExam(null);
    setShowConfirmSubmit(false);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ":" : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "upcoming":
        return (
          <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-xs rounded font-medium">
            Upcoming
          </span>
        );
      case "ongoing":
        return (
          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded font-medium animate-pulse">
            Ongoing
          </span>
        );
      case "completed":
        return (
          <span className="px-2 py-1 bg-slate-500/10 text-slate-500 text-xs rounded font-medium">
            Completed
          </span>
        );
      default:
        return null;
    }
  };

  if (activeExam) {
    // Filter questions based on activeExam.type or subject
    let activeQuestions = questions.filter(
      (q) => q.subject === activeExam.title || q.subject === activeExam.type,
    );
    if (activeQuestions.length === 0) activeQuestions = questions; // fallback to all questions if none match

    if (activeQuestions.length === 0) {
      return (
        <div className="p-8 text-center">No questions found for this exam.</div>
      );
    }

    const question = activeQuestions[currentQuestion];
    const answeredCount = Object.keys(answers).length;

    return (
      <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-[#0a0a0a] flex flex-col font-sans">
        {/* Exam Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 px-6 py-4 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {activeExam.title}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {activeExam.type}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold shadow-inner border",
                timeLeft < 300
                  ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 animate-pulse"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10",
              )}
            >
              <Clock className="w-5 h-5" />
              {formatTime(timeLeft)}
            </div>
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm"
            >
              Finish Exam
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Question Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-12">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                  Question {currentQuestion + 1} of {activeQuestions.length}
                </h2>
                <button
                  onClick={toggleFlag}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg font-medium border transition-colors",
                    flagged[currentQuestion]
                      ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700",
                  )}
                >
                  <Flag className="w-4 h-4" />
                  {flagged[currentQuestion] ? "Flagged" : "Flag for review"}
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-sm mb-8">
                <div
                  className="text-lg text-slate-700 dark:text-slate-300 mb-8 leading-relaxed prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: question?.text || "" }}
                />

                <div className="space-y-4">
                  {question?.options?.map((opt: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      className={cn(
                        "w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                        answers[currentQuestion] === idx
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 dark:border-indigo-400"
                          : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                      )}
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0",
                          answers[currentQuestion] === idx
                            ? "border-indigo-500 dark:border-indigo-400"
                            : "border-slate-300 dark:border-slate-600",
                        )}
                      >
                        {answers[currentQuestion] === idx && (
                          <div className="w-3 h-3 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-base font-medium",
                          answers[currentQuestion] === idx
                            ? "text-indigo-900 dark:text-indigo-200"
                            : "text-slate-700 dark:text-slate-300",
                        )}
                      >
                        {opt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() =>
                    setCurrentQuestion((prev) => Math.max(0, prev - 1))
                  }
                  disabled={currentQuestion === 0}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" /> Previous
                </button>
                <button
                  onClick={() =>
                    setCurrentQuestion((prev) =>
                      Math.min(activeQuestions.length - 1, prev + 1),
                    )
                  }
                  disabled={currentQuestion === activeQuestions.length - 1}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Question Navigator */}
          <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-white/10 flex flex-col shrink-0">
            <div className="p-6 border-b border-slate-200 dark:border-white/10">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">
                Question Navigator
              </h3>
              <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                <span>{answeredCount} Answered</span>
                <span>•</span>
                <span>{activeQuestions.length - answeredCount} Unanswered</span>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-4 gap-3">
                {activeQuestions.map((_, idx) => {
                  const isAnswered = answers[idx] !== undefined;
                  const isFlagged = flagged[idx];
                  const isCurrent = currentQuestion === idx;

                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentQuestion(idx)}
                      className={cn(
                        "h-12 rounded-lg font-medium text-sm relative flex items-center justify-center transition-all",
                        isCurrent
                          ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900"
                          : "",
                        isAnswered
                          ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-slate-700",
                      )}
                    >
                      {idx + 1}
                      {isFlagged && (
                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center">
                          <Flag className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        {showConfirmSubmit && (
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-white/10 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                Submit Exam?
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Are you sure you want to finish this exam? You have answered{" "}
                {answeredCount} out of {activeQuestions.length} questions.
              </p>

              {activeQuestions.length - answeredCount > 0 && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-400">
                    You still have{" "}
                    <strong>
                      {activeQuestions.length - answeredCount} unanswered
                      questions
                    </strong>
                    . You will not be able to return to the exam after
                    submitting.
                  </p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setShowConfirmSubmit(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={handleSubmitExam}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Yes, Submit Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      <div className="bg-gradient-to-r from-emerald-500/10 to-indigo-500/10 border border-emerald-500/20 dark:border-emerald-400/20 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Student Exam Portal
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Welcome to your computer-based test dashboard. You can take your
            scheduled exams here.
          </p>
        </div>
        <div className="text-right flex items-center gap-4 bg-white dark:bg-black/40 px-6 py-3 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="w-12 h-12 bg-indigo-500/10 flex items-center justify-center rounded-full">
            <CheckCircle2 className="w-6 h-6 text-indigo-500" />
          </div>
          <div className="text-left">
            <div className="text-sm text-slate-500 dark:text-slate-400 font-medium font-mono text-xs mb-1">
              System Status
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              All Systems Operational
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stats Cards */}
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <FileText className="w-5 h-5 text-indigo-500" />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Total Exams
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              3
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              For current semester
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Completed
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              1
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Tests finished
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Average Score
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              85
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Excellent standing
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/10 p-5 bg-slate-50/50 dark:bg-black/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
            My Exam Schedule
          </h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-white/5">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="p-5 flex flex-col sm:flex-row sm:items-center gap-6 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex-1 flex gap-4">
                <div
                  className={cn(
                    "w-12 h-12 shrink-0 rounded-xl flex items-center justify-center",
                    exam.status === "ongoing"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : exam.status === "upcoming"
                        ? "bg-indigo-500/10 text-indigo-500"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500",
                  )}
                >
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                      {exam.title}
                    </h4>
                    {getStatusBadge(exam.status)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-mono tracking-tight flex flex-wrap gap-4 mt-2">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> {exam.duration} Min
                    </span>
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {exam.type}
                    </span>
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-4 border-t sm:border-t-0 p-4 sm:p-0 border-slate-200 dark:border-slate-800 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0">
                {exam.status === "completed" && (
                  <div className="text-right">
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
                      Score
                    </div>
                    <div className="text-xl font-black text-slate-800 dark:text-slate-100">
                      {exam.score} / 100
                    </div>
                  </div>
                )}
                {exam.status === "ongoing" && (
                  <button
                    onClick={() => startExam(exam)}
                    className="flex-1 sm:flex-none w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Start Exam
                  </button>
                )}
                {exam.status === "upcoming" && (
                  <button
                    disabled
                    className="flex-1 sm:flex-none w-full px-6 py-2.5 rounded-lg font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                  >
                    Not Started
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
