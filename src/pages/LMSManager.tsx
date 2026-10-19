import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useRef } from 'react';
import { 
  MonitorPlay, BookOpen, Video, FileText, CheckCircle2, PlayCircle, 
  Users, BarChart2, Library, Plus, Search, Filter, Clock, MoreVertical,
  Activity, Award, Star, ListChecks, Download, Upload, X, Calendar, Edit3, Trash2, MessageSquare, Map, MapPin
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import ReactPlayer from 'react-player';
const Player = ReactPlayer as any;

const tenantStudentDocId = "mock_student_001";

type Tab = 'dashboard' | 'courses' | 'categories' | 'video-library' | 'assessments' | 'peer-reviews' | 'instructor';


const progressData = [
  { month: 'Jan', interactionTime: 120, completionRate: 60 },
  { month: 'Feb', interactionTime: 145, completionRate: 65 },
  { month: 'Mar', interactionTime: 160, completionRate: 70 },
  { month: 'Apr', interactionTime: 180, completionRate: 75 },
  { month: 'May', interactionTime: 210, completionRate: 82 },
  { month: 'Jun', interactionTime: 250, completionRate: 88 },
];

const gradeData = [
  { subject: 'Math', avgQuizScore: 85 },
  { subject: 'Science', avgQuizScore: 78 },
  { subject: 'Arabic', avgQuizScore: 92 },
  { subject: 'English', avgQuizScore: 88 },
  { subject: 'Aqidah', avgQuizScore: 95 },
];

const mockCourses = [
  { id: 1, title: 'Advanced Calculus (SMA)', instructor: 'Ust. Rahman', lessons: 24, enrolled: 120, progress: 85, color: 'bg-indigo-500', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { id: 2, title: 'Nahwu Shorof Dasaran', instructor: 'Ust. Hidayat', lessons: 32, enrolled: 350, progress: 65, color: 'bg-emerald-500', videoUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  { id: 3, title: 'Fiqh Al-Jihad', instructor: 'Ust. Khalid', lessons: 12, enrolled: 210, progress: 40, color: 'bg-amber-500', videoUrl: 'https://www.youtube.com/watch?v=L_jWHffIx5E' },
  { id: 4, title: 'English For Academics', instructor: 'Mr. Smith', lessons: 18, enrolled: 180, progress: 90, color: 'bg-blue-500', videoUrl: 'https://www.youtube.com/watch?v=FcsFxtiT-lY' },
];

export function LMSManager() {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('courses');
  const [courses, setCourses] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [peerProjects, setPeerProjects] = useState<any[]>([]);
  const [peerSubmissions, setPeerSubmissions] = useState<any[]>([]);
  const [peerReviews, setPeerReviews] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [modalType, setModalType] = useState<'syllabus' | 'class' | 'create_course' | 'upload_video' | 'create_assessment' | 'certificate' | 'peer_review' | 'submit_project' | 'peer_review_feedback' | null>(null);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [selectedCertificate, setSelectedCertificate] = useState<any>(null);

  const [syllabuses, setSyllabuses] = useState<Record<string, any[]>>({});
  const [completedModules, setCompletedModules] = useState<Record<string, boolean>>({});
  const [videoProgress, setVideoProgress] = useState<Record<string, number>>({});
  const [lastWatched, setLastWatched] = useState<any>(null);
  const [studentNotes, setStudentNotes] = useState<Record<string, any[]>>({});
  const [newVideoNote, setNewVideoNote] = useState({ timestamp: '', text: '' });
  
  const [videoComments, setVideoComments] = useState<Record<string, any[]>>({});
  const [newVideoComment, setNewVideoComment] = useState({ timestamp: '', text: '' });
  const [activeSideTab, setActiveSideTab] = useState<'notes' | 'comments'>('notes');
  
  const [viewingMaterial, setViewingMaterial] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    const unsubscribeCourses = onSnapshot(tenantScopedQuery(collection(db, 'lms_courses'), user?.tenantId), (snapshot) => {
      const fetchedCourses = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setCourses(fetchedCourses);
      
      const newSyllabuses: Record<string, any[]> = {};
      fetchedCourses.forEach((course: any) => {
        newSyllabuses[course.id] = course.modules || [];
      });
      setSyllabuses(newSyllabuses);
      
      // Update selected course if it's currently selected
      setSelectedCourse((prev: any) => {
        if (!prev) return prev;
        const updated = fetchedCourses.find(c => c.id === prev.id);
        return updated || prev;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_courses');
    });

    const unsubscribeProgress = onSnapshot(doc(db, 'lms_progress', tenantStudentDocId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompletedModules(data.completed || {});
        setVideoProgress(data.videoProgress || {});
        if (data.lastWatched) {
          setLastWatched(data.lastWatched);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_progress');
    });

    const unsubscribeNotes = onSnapshot(doc(db, 'lms_student_notes', tenantStudentDocId), (docSnap) => {
      if (docSnap.exists()) {
        setStudentNotes(docSnap.data().notes || {});
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_student_notes');
    });

    const unsubscribeAssessments = onSnapshot(tenantScopedQuery(collection(db, 'lms_assessments'), user?.tenantId), (snapshot) => {
      const fetchedAssessments = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setAssessments(fetchedAssessments);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_assessments');
    });

    const unsubscribePeerProjects = onSnapshot(tenantScopedQuery(collection(db, 'lms_peer_projects'), user?.tenantId, ...(['Admin', 'SuperAdmin', 'Ustadz'].includes(role) && user?.modulePermissions?.lms !== false ? [] : [where('createdByUid', '==', user?.uid || '__tenant_scope_unavailable__')])), (snapshot) => {
      setPeerProjects(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_peer_projects');
    });

    const unsubscribePeerSubmissions = onSnapshot(tenantScopedQuery(collection(db, 'lms_peer_submissions'), user?.tenantId, ...(['Admin', 'SuperAdmin', 'Ustadz'].includes(role) && user?.modulePermissions?.lms !== false ? [] : [where('createdByUid', '==', user?.uid || '__tenant_scope_unavailable__')])), (snapshot) => {
      setPeerSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_peer_submissions');
    });

    const unsubscribePeerReviews = onSnapshot(tenantScopedQuery(collection(db, 'lms_peer_reviews'), user?.tenantId, ...(['Admin', 'SuperAdmin', 'Ustadz'].includes(role) && user?.modulePermissions?.lms !== false ? [] : [where('createdByUid', '==', user?.uid || '__tenant_scope_unavailable__')])), (snapshot) => {
      setPeerReviews(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_peer_reviews');
    });

    const unsubscribeCategories = onSnapshot(tenantScopedQuery(collection(db, 'lms_categories'), user?.tenantId), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_categories');
    });

    const unsubscribeComments = onSnapshot(tenantScopedQuery(collection(db, 'lms_video_comments'), user?.tenantId), (snapshot) => {
      const allComments: Record<string, any[]> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as any;
        const materialId = data.materialId || doc.id;
        const previous = allComments[materialId] || [];
        const next = Array.isArray(data.comments)
          ? [...previous, ...data.comments]
          : [...previous, { id: doc.id, ...data }];
        allComments[materialId] = next;
      });
      setVideoComments(allComments);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'lms_video_comments');
    });

    return () => {
      unsubscribeCourses();
      unsubscribeProgress();
      unsubscribeNotes();
      unsubscribeAssessments();
      unsubscribePeerProjects();
      unsubscribePeerSubmissions();
      unsubscribePeerReviews();
      unsubscribeCategories();
      unsubscribeComments();
    };
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.lms]);

  const handleVideoReady = (videoId: string) => {
    if (playerRef.current && videoProgress[videoId]) {
       playerRef.current.seekTo(videoProgress[videoId], 'seconds');
    }
  };

  const parseTimestampToSeconds = (timestamp: string): number => {
    const parts = timestamp.split(':').reverse();
    let seconds = 0;
    if (parts[0]) seconds += parseInt(parts[0], 10);
    if (parts[1]) seconds += parseInt(parts[1], 10) * 60;
    if (parts[2]) seconds += parseInt(parts[2], 10) * 3600;
    return seconds;
  };

  const seekToTimestamp = (timestamp: string) => {
    if (playerRef.current) {
      playerRef.current.seekTo(parseTimestampToSeconds(timestamp), 'seconds');
    }
  };

  // Keep a local ref to track last saved progress to avoid spamming Firestore
  const lastSavedProgress = useRef<Record<string, number>>({});

  const onProgress = async (state: { playedSeconds: number }, videoId: string) => {
    const currentSeconds = Math.floor(state.playedSeconds);
    const lastSaved = lastSavedProgress.current[videoId] || 0;
    
    // Save to Firestore every 5 seconds
    if (currentSeconds - lastSaved >= 5 || currentSeconds < lastSaved - 5) {
      lastSavedProgress.current[videoId] = currentSeconds;
      const newProgress = { ...videoProgress, [videoId]: currentSeconds };
      setVideoProgress(newProgress);
      
      const lastWatchedData = viewingMaterial ? {
        id: viewingMaterial.id,
        title: viewingMaterial.title,
        type: viewingMaterial.type,
        url: viewingMaterial.url,
        courseId: selectedCourse?.id || '',
        courseTitle: selectedCourse?.title || '',
        timestamp: currentSeconds,
        updatedAt: new Date().toISOString()
      } : null;

      if (lastWatchedData) {
        setLastWatched(lastWatchedData);
      }

      try {
        await setDoc(doc(db, 'lms_progress', tenantStudentDocId), tenantRecord(user?.tenantId, { 
          videoProgress: newProgress,
          ...(lastWatchedData ? { lastWatched: lastWatchedData } : {})
        }), { merge: true });
      } catch (err) {
        console.error("Failed to save video progress", err);
      }
    }
  };

  const handleAddVideoNote = async () => {
    if (!viewingMaterial || viewingMaterial.type !== 'video' || !newVideoNote.text.trim()) return;
    
    const note = {
      id: Date.now().toString(),
      timestamp: newVideoNote.timestamp || '0:00',
      text: newVideoNote.text,
      createdAt: new Date().toISOString()
    };
    
    const videoNotes = studentNotes[viewingMaterial.id] || [];
    const newNotes = { ...studentNotes, [viewingMaterial.id]: [...videoNotes, note] };
    
    setStudentNotes(newNotes);
    setNewVideoNote({ timestamp: '', text: '' });
    
    try {
      await setDoc(doc(db, 'lms_student_notes', tenantStudentDocId), tenantRecord(user?.tenantId, { notes: newNotes }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'lms_student_notes');
    }
  };

  const handleAddVideoComment = async () => {
    if (!viewingMaterial || viewingMaterial.type !== 'video' || !newVideoComment.text.trim()) return;
    
    const comment = {
      id: Date.now().toString(),
      timestamp: newVideoComment.timestamp || '0:00',
      text: newVideoComment.text,
      author: 'Current User', // In a real app, this would be the actual user's name
      createdAt: new Date().toISOString()
    };
    
    const currentComments = videoComments[viewingMaterial.id] || [];
    const newCommentsList = [...currentComments, comment];
    
    // Optimistic update
    setVideoComments({ ...videoComments, [viewingMaterial.id]: newCommentsList });
    setNewVideoComment({ timestamp: '', text: '' });
    
    try {
      await addDoc(collection(db, 'lms_video_comments'), tenantRecord(user?.tenantId, {
        materialId: viewingMaterial.id, ...comment, createdByUid: user?.uid,
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'lms_video_comments');
    }
  };

  const toggleModuleCompletion = async (courseId: string, moduleId: string) => {
    const key = `${courseId}_${moduleId}`;
    const newValue = !completedModules[key];
    const newCompleted = { ...completedModules, [key]: newValue };
    setCompletedModules(newCompleted);
    try {
      await setDoc(doc(db, 'lms_progress', tenantStudentDocId), tenantRecord(user?.tenantId, { completed: newCompleted }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'lms_progress');
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const [addingModule, setAddingModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [addingMaterialTo, setAddingMaterialTo] = useState<string | null>(null);
  const [newMaterial, setNewMaterial] = useState({ title: '', type: 'pdf', url: '' });
  
  const [newVideoUpload, setNewVideoUpload] = useState({ courseId: '', moduleId: '', title: '', url: '' });
  
  const [newAssessment, setNewAssessment] = useState({ title: '', courseId: '', dueDate: '', status: 'Draft' });
  const [newPeerProject, setNewPeerProject] = useState({ title: '', courseId: '', description: '', rubric: '' });
  const [newPeerSubmission, setNewPeerSubmission] = useState({ projectId: '', url: '', comments: '' });
  const [newPeerFeedback, setNewPeerFeedback] = useState({ rating: 5, comments: '' });
  const [selectedPeerProject, setSelectedPeerProject] = useState<any>(null);
  const [selectedPeerSubmission, setSelectedPeerSubmission] = useState<any>(null);

  const handleCreatePeerProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeerProject.title || !newPeerProject.courseId) return;

    try {
      await addDoc(collection(db, 'lms_peer_projects'), tenantRecord(user?.tenantId, {
        ...newPeerProject,
        createdByUid: user?.uid,
        createdAt: new Date().toISOString()
      }));
      setModalType(null);
      setNewPeerProject({ title: '', courseId: '', description: '', rubric: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'lms_peer_projects');
    }
  };

  const handleSubmitPeerProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeerSubmission.projectId || !newPeerSubmission.url) return;

    try {
      await addDoc(collection(db, 'lms_peer_submissions'), tenantRecord(user?.tenantId, {
        ...newPeerSubmission,
        studentId: tenantStudentDocId,
        createdByUid: user?.uid,
        studentName: 'Current User',
        createdAt: new Date().toISOString()
      }));
      setModalType(null);
      setNewPeerSubmission({ projectId: '', url: '', comments: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'lms_peer_submissions');
    }
  };

  const handleSubmitPeerReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeerSubmission || !newPeerFeedback.comments) return;

    try {
      await addDoc(collection(db, 'lms_peer_reviews'), tenantRecord(user?.tenantId, {
        submissionId: selectedPeerSubmission.id,
        projectId: selectedPeerSubmission.projectId,
        reviewerId: tenantStudentDocId,
        createdByUid: user?.uid,
        reviewerName: 'Current User',
        ...newPeerFeedback,
        createdAt: new Date().toISOString()
      }));
      setSelectedPeerSubmission(null);
      setNewPeerFeedback({ rating: 5, comments: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'lms_peer_reviews');
    }
  };

  const handleCreateAssessmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssessment.title || !newAssessment.courseId) return;

    try {
      await addDoc(collection(db, 'lms_assessments'), tenantRecord(user?.tenantId, {
        ...newAssessment,
        createdAt: new Date().toISOString(),
        submissions: 0,
        totalEnrolled: courses.find(c => c.id === newAssessment.courseId)?.enrolled || 0
      }));
      setModalType(null);
      setNewAssessment({ title: '', courseId: '', dueDate: '', status: 'Draft' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'lms_assessments');
    }
  };

  const handleUploadVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUpload.courseId || !newVideoUpload.url || !newVideoUpload.title) return;
    
    if (newVideoUpload.moduleId) {
      const courseModules = syllabuses[newVideoUpload.courseId] || [];
      const updatedModules = courseModules.map(m => {
        if (m.id === newVideoUpload.moduleId) {
          return { ...m, materials: [...(m.materials || []), { id: Date.now().toString(), title: newVideoUpload.title, type: 'video', url: newVideoUpload.url }] };
        }
        return m;
      });
      
      setSyllabuses({...syllabuses, [newVideoUpload.courseId]: updatedModules});
      try {
        await updateDoc(doc(db, 'lms_courses', newVideoUpload.courseId), {
          modules: updatedModules
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `lms_courses/${newVideoUpload.courseId}`);
      }
    } else {
      // Just update course main video if no module is selected? Wait, maybe just module is required.
      // Let's just make it required to select a module, or fallback to course videoUrl.
      if (!newVideoUpload.moduleId) {
         try {
           await updateDoc(doc(db, 'lms_courses', newVideoUpload.courseId), {
             videoUrl: newVideoUpload.url
           });
         } catch (err) {
           handleFirestoreError(err, OperationType.UPDATE, `lms_courses/${newVideoUpload.courseId}`);
         }
      }
    }
    
    setModalType(null);
    setNewVideoUpload({ courseId: '', moduleId: '', title: '', url: '' });
  };
  
  const [activeDiscussionId, setActiveDiscussionId] = useState<string | null>(null);
  const [discussions, setDiscussions] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState('');

  const handlePostComment = (moduleId: string) => {
    if (!newComment.trim()) return;
    const comment = {
      id: Date.now().toString(),
      author: 'Ahmad Zaki',
      role: 'Student',
      text: newComment,
      timestamp: new Date().toISOString()
    };
    setDiscussions(prev => ({
      ...prev,
      [moduleId]: [...(prev[moduleId] || []), comment]
    }));
    setNewComment('');
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    const courseId = selectedCourse.id;
    const currentModules = syllabuses[courseId] || [];
    const newMod = { id: Date.now().toString(), title: newModuleTitle, materials: [] };
    const updatedModules = [...currentModules, newMod];
    setSyllabuses({...syllabuses, [courseId]: updatedModules});
    
    try {
      await updateDoc(doc(db, 'lms_courses', courseId), {
        modules: updatedModules
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lms_courses/${courseId}`);
    }

    setAddingModule(false);
    setNewModuleTitle('');
  };

  const handleAddMaterial = async (e: React.FormEvent, moduleId: string) => {
    e.preventDefault();
    if (!selectedCourse) return;
    const courseId = selectedCourse.id;
    const currentModules = syllabuses[courseId] || [];
    const updatedModules = currentModules.map(m => {
      if (m.id === moduleId) {
        return { ...m, materials: [...m.materials, { id: Date.now().toString(), ...newMaterial }] };
      }
      return m;
    });
    setSyllabuses({...syllabuses, [courseId]: updatedModules});

    try {
      await updateDoc(doc(db, 'lms_courses', courseId), {
        modules: updatedModules
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lms_courses/${courseId}`);
    }

    setAddingMaterialTo(null);
    setNewMaterial({ title: '', type: 'pdf', url: '' });
  };

  const availableCategories = categories.length > 0 
    ? categories.map(c => c.name) 
    : ['General', 'Programming', 'Design', 'Business', 'Languages', 'Religion', 'Other'];

  const [newCourse, setNewCourse] = useState({
    title: '',
    instructor: '',
    category: availableCategories[0],
    videoUrl: '',
    color: 'bg-indigo-500'
  });
  
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [courseCategoryFilter, setCourseCategoryFilter] = useState('All');
  const [videoCategoryFilter, setVideoCategoryFilter] = useState('All Categories');
  
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const getYoutubeEmbed = (url: string) => {
    if (!url) return "";
    let videoId = "";
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === 'youtu.be') {
        videoId = parsedUrl.pathname.slice(1);
      } else if (parsedUrl.hostname.includes('youtube.com')) {
        videoId = parsedUrl.searchParams.get('v') || "";
      }
    } catch (e) {
      // ignore
    }
    if (!videoId) {
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
      videoId = match ? match[1] : "";
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : "";
  };

  const getYoutubeThumbnail = (url: string) => {
    if (!url) return "";
    let videoId = "";
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === 'youtu.be') {
        videoId = parsedUrl.pathname.slice(1);
      } else if (parsedUrl.hostname.includes('youtube.com')) {
        videoId = parsedUrl.searchParams.get('v') || "";
      }
    } catch (e) {
      // ignore
    }
    if (!videoId) {
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
      videoId = match ? match[1] : "";
    }
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategoryId) {
        await updateDoc(doc(db, 'lms_categories', editingCategoryId), {
          name: newCategory.name,
          description: newCategory.description
        });
      } else {
        await addDoc(collection(db, 'lms_categories'), tenantRecord(user?.tenantId, {
          name: newCategory.name,
          description: newCategory.description
        }));
      }
      setNewCategory({ name: '', description: '' });
      setEditingCategoryId(null);
    } catch (err) {
      handleFirestoreError(err, editingCategoryId ? OperationType.UPDATE : OperationType.CREATE, 'lms_categories');
    }
  };

  const handleDeleteCategory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this category?")) return;
    try {
      await deleteDoc(doc(db, 'lms_categories', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'lms_categories');
    }
  };

  const handleEditCategory = (category: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCategoryId(category.id);
    setNewCategory({ name: category.name || '', description: category.description || '' });
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingCourseId) {
        await updateDoc(doc(db, 'lms_courses', editingCourseId), {
          title: newCourse.title || 'Untitled Course',
          instructor: newCourse.instructor || 'Unknown Instructor',
          category: newCourse.category || 'General',
          color: newCourse.color,
          videoUrl: newCourse.videoUrl
        });
        setModalType(null);
      } else {
        const course = {
          title: newCourse.title || 'Untitled Course',
          instructor: newCourse.instructor || 'Unknown Instructor',
          category: newCourse.category || 'General',
          lessons: 0,
          enrolled: 0,
          progress: 0,
          color: newCourse.color,
          videoUrl: newCourse.videoUrl,
          modules: []
        };
        const docRef = await addDoc(collection(db, 'lms_courses'), tenantRecord(user?.tenantId, course));
        setSelectedCourse({ id: docRef.id, ...course });
        setModalType('syllabus');
      }
      setEditingCourseId(null);
      setNewCourse({ title: '', instructor: '', category: availableCategories[0] || 'General', videoUrl: '', color: 'bg-indigo-500' });
    } catch (err) {
      handleFirestoreError(err, editingCourseId ? OperationType.UPDATE : OperationType.CREATE, 'lms_courses');
    }
  };

  const handleDeleteCourse = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this course?")) return;
    try {
      await deleteDoc(doc(db, 'lms_courses', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'lms_courses');
    }
  };

  const handleEditCourse = (course: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCourseId(course.id);
    setNewCourse({
      title: course.title || '',
      instructor: course.instructor || '',
      category: course.category || availableCategories[0] || 'General',
      videoUrl: course.videoUrl || '',
      color: course.color || 'bg-indigo-500'
    });
    setModalType('create_course');
  };

  const formatSecondsToTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getCourseProgress = (courseId: string) => {
    const mods = syllabuses[courseId] || [];
    if (mods.length === 0) return 0;
    const completed = mods.filter(m => completedModules[`${courseId}_${m.id}`]).length;
    return Math.round((completed / mods.length) * 100);
  };

  const renderDashboard = () => {
    const earnedCertificates = courses.filter(c => getCourseProgress(c.id) === 100);
    
    return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {lastWatched && (
        <div className="bg-indigo-600 dark:bg-indigo-900/40 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="flex-1 text-white z-10">
            <div className="flex items-center gap-2 text-indigo-200 text-sm font-medium mb-2 uppercase tracking-wider">
              <PlayCircle className="w-4 h-4" /> Continue Watching
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">{lastWatched.title}</h2>
            <p className="text-indigo-100 mb-6 max-w-xl text-sm md:text-base">
              You left off at {formatSecondsToTime(lastWatched.timestamp)} in {lastWatched.courseTitle || 'your course'}.
            </p>
            <button 
              onClick={() => setViewingMaterial(lastWatched)}
              className="bg-white text-indigo-600 hover:bg-indigo-50 px-6 py-2.5 rounded-lg font-bold shadow-sm transition-colors flex items-center gap-2"
            >
              <MonitorPlay className="w-5 h-5" /> Resume Video
            </button>
          </div>
          <div className="w-full md:w-1/3 aspect-video bg-black/30 rounded-xl flex items-center justify-center border border-white/10 z-10 relative overflow-hidden">
             {lastWatched.url && getYoutubeEmbed(lastWatched.url) ? (
                <img 
                  src={`https://img.youtube.com/vi/${getYoutubeEmbed(lastWatched.url)?.split('/').pop()?.split('?')[0]}/maxresdefault.jpg`} 
                  alt={lastWatched.title} 
                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80'; }}
                />
             ) : (
               <Video className="w-10 h-10 text-white/50" />
             )}
             <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-12 h-12 rounded-full bg-indigo-600/90 text-white flex items-center justify-center backdrop-blur-sm">
                 <PlayCircle className="w-6 h-6" />
               </div>
             </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative">
         <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Map className="w-5 h-5 text-indigo-500" /> Learning Roadmap
            </h3>
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-500/20">
              {courses.filter(c => getCourseProgress(c.id) === 100).length} / {courses.length} Completed
            </span>
         </div>
         
         <div className="relative flex items-center justify-between max-w-5xl mx-auto py-4 overflow-x-auto hide-scrollbar pb-8 px-4">
            {/* Connection Line Background */}
            <div className="absolute top-[28px] left-12 right-12 h-1.5 bg-slate-100 dark:bg-slate-800 -translate-y-1/2 rounded-full z-0"></div>
            
            {/* Active Connection Line */}
            <div 
              className="absolute top-[28px] left-12 h-1.5 bg-gradient-to-r from-emerald-500 to-indigo-500 -translate-y-1/2 rounded-full z-0 transition-all duration-1000"
              style={{ width: `${Math.max(0, courses.length > 1 ? (courses.filter(c => getCourseProgress(c.id) === 100).length / (courses.length - 1)) * 100 : 0)}%`, maxWidth: 'calc(100% - 6rem)' }}
            ></div>

            {courses.length === 0 && <p className="text-sm text-slate-500 mx-auto py-4">No courses available in your roadmap yet.</p>}

            {courses.map((course, idx) => {
              const progress = getCourseProgress(course.id);
              const isCompleted = progress === 100;
              const isActive = progress > 0 && progress < 100;
              // A course is "next" if it's 0% but the previous is 100% (or it's the first course)
              const isNext = progress === 0 && (idx === 0 || getCourseProgress(courses[idx - 1].id) === 100);
              
              return (
                <div key={course.id} className="relative z-10 flex flex-col items-center group min-w-[120px] shrink-0" onClick={() => { setActiveTab('courses'); setSelectedCourse(course); setModalType('syllabus'); }}>
                  <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center bg-white dark:bg-slate-900 shadow-sm transition-all cursor-pointer ${
                    isCompleted ? 'border-emerald-500 text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 
                    isActive ? 'border-indigo-500 text-indigo-500 ring-4 ring-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10' : 
                    isNext ? 'border-amber-400 text-amber-500 bg-amber-50 dark:bg-amber-500/10 shadow-lg shadow-amber-500/20' :
                    'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 hover:border-indigo-300'
                  }`}>
                     {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : isActive || isNext ? <MapPin className="w-6 h-6" /> : <MapPin className="w-5 h-5 opacity-50" />}
                  </div>
                  <div className="mt-4 text-center">
                    <p className={`text-xs font-bold truncate w-24 transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400 ${
                      isCompleted ? 'text-emerald-700 dark:text-emerald-400' : 
                      isActive || isNext ? 'text-indigo-700 dark:text-indigo-400' : 
                      'text-slate-500'
                    }`} title={course.title}>
                      {course.title}
                    </p>
                    <div className="flex items-center justify-center gap-1 mt-1.5">
                      <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 w-6 text-left">{progress}%</span>
                    </div>
                  </div>
                  {/* Tooltip */}
                  <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs px-3 py-2 rounded pointer-events-none whitespace-nowrap z-20 shadow-lg border border-slate-700 font-medium">
                    {course.title}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                  </div>
                </div>
              );
            })}
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Active Learners', value: '845', icon: Users, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20', trend: '+12% this month' },
          { title: 'Course Completion', value: '78%', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20', trend: '+5% vs last term' },
          { title: 'Video Hours Watched', value: '12,450', icon: PlayCircle, color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-500/20', trend: '240 hrs today' },
          { title: 'Average Assessment', value: '86.4', icon: Award, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/20', trend: 'A- Grade Average' }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center mb-4`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <p className="text-slate-500 text-sm font-medium">{stat.title}</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">{stat.value}</h3>
            <p className="text-xs text-slate-400 mt-2">{stat.trend}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
             <Activity className="w-5 h-5 text-indigo-500" /> Material Interaction & Completion
           </h3>
           <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={progressData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <defs>
                    <linearGradient id="colorInteraction" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCompletion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                 <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                 <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                 <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                 <Area type="monotone" name="Interaction (Hrs)" dataKey="interactionTime" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorInteraction)" />
                 <Area type="monotone" name="Completion Rate (%)" dataKey="completionRate" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCompletion)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
         </div>
         
         <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
             <BarChart2 className="w-5 h-5 text-emerald-500" /> Average Quiz Scores by Subject
           </h3>
           <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={gradeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                 <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                 <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                 <YAxis dataKey="subject" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} width={80} />
                 <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                 <Bar dataKey="avgQuizScore" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
               </BarChart>
             </ResponsiveContainer>
           </div>
         </div>
      </div>

      {earnedCertificates.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mt-6">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" /> Earned Certificates
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {earnedCertificates.map(cert => (
              <div key={cert.id} className="border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all" onClick={() => { setSelectedCertificate(cert); setModalType('certificate'); }}>
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{cert.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Completed! Click to view</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  };

  const renderCourses = () => {
    const filteredCourses = courses.filter(c => {
      const matchesSearch = c.title.toLowerCase().includes(courseSearchQuery.toLowerCase()) || c.instructor.toLowerCase().includes(courseSearchQuery.toLowerCase());
      const matchesCategory = courseCategoryFilter === 'All' || c.category === courseCategoryFilter;
      return matchesSearch && matchesCategory;
    });

    return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
         <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={courseSearchQuery}
              onChange={e => setCourseSearchQuery(e.target.value)}
              placeholder="Search courses, instructors, or topics..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200"
            />
         </div>
         <div className="flex gap-2">
            <div className="relative">
              <select
                value={courseCategoryFilter}
                onChange={e => setCourseCategoryFilter(e.target.value)}
                className="appearance-none pl-10 pr-8 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All Categories</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <button onClick={() => { setEditingCourseId(null); setNewCourse({ title: '', instructor: '', category: availableCategories[0] || 'General', videoUrl: '', color: 'bg-indigo-500' }); setModalType('create_course'); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors border border-transparent">
               <Plus className="w-4 h-4" /> Create Course
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {filteredCourses.map((course) => (
           <div key={course.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm group hover:shadow-md transition-shadow">
              <div className={`h-32 ${course.color} p-6 relative flex flex-col justify-end`}>
                 <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-2 py-1 rounded text-xs font-bold text-white">
                    {course.lessons} Modules
                 </div>
                 <h3 className="text-xl font-bold text-white drop-shadow-sm">{course.title}</h3>
                 <p className="text-white/80 text-sm mt-1 flex items-center gap-1">
                   <Users className="w-3 h-3" /> {course.enrolled} Enrolled
                 </p>
              </div>
              <div className="p-6">
                 <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700">
                         {course.instructor.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{course.instructor}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => handleEditCourse(course, e)} className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded-md transition-colors" title="Edit Course">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => handleDeleteCourse(course.id, e)} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-md transition-colors" title="Delete Course">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Completion Avg</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{course.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                       <div className={`h-2 rounded-full ${course.color}`} style={{ width: `${course.progress}%` }}></div>
                    </div>
                 </div>
                 <div className="mt-6 flex gap-2">
                    <button 
                      onClick={() => { setSelectedCourse(course); setModalType('syllabus'); }}
                      className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700"
                    >
                      Manage Syllabus
                    </button>
                    <button 
                      onClick={() => { setSelectedCourse(course); setModalType('class'); }}
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 py-2 rounded-lg text-sm font-medium transition-colors border border-transparent"
                    >
                      View Class
                    </button>
                 </div>
              </div>
           </div>
         ))}
      </div>
    </div>
  );
  };

  const videosByCourse = React.useMemo(() => {
    const groups: { course: any, videos: any[] }[] = [];
    courses.forEach(course => {
      const videos: any[] = [];
      if (course.videoUrl) {
        videos.push({
          id: `course-${course.id}`,
          title: `${course.title} - Overview`,
          subject: course.title,
          instructor: course.instructor,
          url: course.videoUrl,
          thumbnail: getYoutubeThumbnail(course.videoUrl),
          mat: { type: 'video', url: course.videoUrl, title: `${course.title} - Overview` }
        });
      }
      
      const courseModules = syllabuses[course.id] || [];
      courseModules.forEach((mod: any) => {
        (mod.materials || []).forEach((mat: any) => {
          if (mat.type === 'video') {
             videos.push({
               id: mat.id,
               title: mat.title,
               subject: course.title,
               instructor: course.instructor,
               url: mat.url,
               thumbnail: getYoutubeThumbnail(mat.url),
               mat: mat
             });
          }
        });
      });
      
      if (videos.length > 0) {
        groups.push({ course, videos });
      }
    });
    return groups;
  }, [courses, syllabuses]);

  const renderVideoLibrary = () => {
    const filteredVideoGroups = videosByCourse.filter(group => 
      videoCategoryFilter === 'All Categories' || group.course.category === videoCategoryFilter
    );

    return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-8 rounded-2xl text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 border border-indigo-500/20">
         <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>
         <div className="z-10 max-w-xl">
           <h2 className="text-3xl font-black mb-3">Enterprise Video Library</h2>
           <p className="text-indigo-200 text-sm mb-6 leading-relaxed">
             Host, stream, and index thousands of academic lectures, boarding school orientations, and specialized halaqah sessions with automated transcriptions and Adaptive Bitrate Streaming (ABS).
           </p>
           <button 
             onClick={() => { setModalType('upload_video'); }}
             className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2"
           >
             <Upload className="w-4 h-4" /> Add Video to Course
           </button>
         </div>
         <div className="z-10 flex gap-4">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 text-center">
               <div className="text-2xl font-black">{filteredVideoGroups.reduce((acc, curr) => acc + curr.videos.length, 0)}</div>
               <div className="text-xs text-indigo-300 uppercase tracking-wider font-bold">Videos</div>
            </div>
         </div>
      </div>

      <div className="flex gap-2 pb-2 overflow-x-auto hide-scrollbar">
         {['All Categories', ...availableCategories].map((cat, i) => (
            <button 
              key={i} 
              onClick={() => setVideoCategoryFilter(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${videoCategoryFilter === cat ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              {cat}
            </button>
         ))}
      </div>

      <div className="space-y-8">
         {filteredVideoGroups.length > 0 ? filteredVideoGroups.map((group) => (
           <div key={group.course.id} className="space-y-4">
             <div className="flex items-center gap-3">
               <div className="h-8 w-1 bg-indigo-500 rounded-full"></div>
               <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{group.course.title}</h3>
               <span className="text-sm font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">{group.videos.length} Videos</span>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               {group.videos.map((video) => (
                 <div key={video.id} className="group cursor-pointer" onClick={() => setViewingMaterial(video.mat)}>
                    <div className="w-full aspect-video bg-slate-800 rounded-xl relative overflow-hidden mb-3 border border-slate-200 dark:border-slate-800">
                       {video.thumbnail ? (
                         <img src={video.thumbnail} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />
                       ) : null}
                       <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <PlayCircle className="w-12 h-12 text-white/80 group-hover:text-white transition-colors group-hover:scale-110" />
                       </div>
                       <div className="absolute top-2 left-2 bg-white text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                         {video.subject}
                       </div>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm line-clamp-2 leading-tight mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {video.title}
                    </h4>
                    <div className="flex items-center text-xs text-slate-500 gap-2">
                       <span>{video.instructor}</span>
                    </div>
                 </div>
               ))}
             </div>
           </div>
         )) : (
           <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
             No videos available. Add videos to your courses and syllabus materials to see them here.
           </div>
         )}
      </div>
    </div>
  );
  };

  const renderInstructorView = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm md:col-span-1">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-indigo-500" /> My Classes
          </h3>
          <div className="space-y-3">
            {courses.slice(0, 3).map((course, idx) => (
              <div key={idx} className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{course.title}</h4>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {course.enrolled} Enrolled</span>
                  <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {course.progress}% Avg Progress</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm md:col-span-2">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
            <ListChecks className="w-5 h-5 text-emerald-500" /> Pending Assignments to Grade
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Course</th>
                  <th className="px-4 py-3 font-semibold">Assignment</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">Ahmad Zaki</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Advanced Calculus</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Module 2 Assignment</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">2 hours ago</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium text-xs bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-md border border-indigo-200 dark:border-indigo-500/20">Grade Now</button>
                  </td>
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">Fatimah Zahra</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Nahwu Shorof Dasaran</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Final Essay</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">1 day ago</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium text-xs bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-md border border-indigo-200 dark:border-indigo-500/20">Grade Now</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-rose-500" /> Class Engagement Metrics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
             <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Average Attendance</p>
             <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">92%</h4>
             <p className="text-emerald-500 text-xs font-medium mt-2 flex items-center gap-1">↑ 4% vs last week</p>
          </div>
          <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
             <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Discussion Posts</p>
             <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">142</h4>
             <p className="text-emerald-500 text-xs font-medium mt-2 flex items-center gap-1">↑ 12 active threads</p>
          </div>
          <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
             <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Material Downloads</p>
             <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">856</h4>
             <p className="text-amber-500 text-xs font-medium mt-2 flex items-center gap-1">Stable</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAssessments = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm text-center flex flex-col items-center max-w-2xl mx-auto">
         <ListChecks className="w-12 h-12 text-amber-500 mb-4" />
         <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Online Examinations & Quizzes</h3>
         <p className="text-slate-500 text-sm mb-6">
           Create, schedule, and grade assessments. Fully integrated with the CBT Engine for high-stakes exams, or use quick-quizzes for formative module evaluations.
         </p>
         <div className="flex gap-3">
            <button 
              onClick={() => setModalType('create_assessment')}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
               <Plus className="w-4 h-4" /> New Assessment
            </button>
            <button className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold px-6 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2">
               Link to CBT System <BarChart2 className="w-4 h-4" />
            </button>
         </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
         <table className="w-full text-sm text-left">
           <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
             <tr>
               <th className="px-6 py-4 font-semibold">Assessment Title</th>
               <th className="px-6 py-4 font-semibold">Course / Subject</th>
               <th className="px-6 py-4 font-semibold">Status</th>
               <th className="px-6 py-4 font-semibold">Due Date</th>
               <th className="px-6 py-4 font-semibold text-right">Submissions</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
             {assessments.length === 0 ? (
               <tr>
                 <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                   No assessments found. Create one to get started.
                 </td>
               </tr>
             ) : assessments.map((exam, i) => {
               const courseName = courses.find(c => c.id === exam.courseId)?.title || 'Unknown Course';
               return (
                 <tr key={exam.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{exam.title}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{courseName}</td>
                    <td className="px-6 py-4">
                       <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          exam.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          exam.status === 'Grading' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                       }`}>
                         {exam.status}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{exam.dueDate || 'Not Set'}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300">
                      {exam.submissions}/{exam.totalEnrolled || 0}
                    </td>
                 </tr>
               );
             })}
           </tbody>
         </table>
      </div>
    </div>
  );

  const renderPeerReviews = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
         <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
               <Users className="w-6 h-6" />
            </div>
            <div>
               <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Peer Review Projects</h3>
               <p className="text-slate-500 text-sm">Submit your assignments and review peers' work to earn points.</p>
            </div>
         </div>
         <button 
           onClick={() => setModalType('peer_review')}
           className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
         >
            <Plus className="w-4 h-4" /> Create Peer Project
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         {/* Active Projects */}
         <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
               <Upload className="w-5 h-5 text-indigo-500" /> Active Projects
            </h4>
            <div className="space-y-4">
               {peerProjects.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No active peer projects.</p>
               ) : peerProjects.map(project => {
                  const course = courses.find(c => c.id === project.courseId);
                  const hasSubmitted = peerSubmissions.some(sub => sub.projectId === project.id && sub.studentId === tenantStudentDocId);
                  
                  return (
                    <div key={project.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
                       <h5 className="font-bold text-slate-800 dark:text-slate-200">{project.title}</h5>
                       <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-2">{course?.title}</p>
                       <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{project.description}</p>
                       {hasSubmitted ? (
                          <div className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                             <CheckCircle2 className="w-4 h-4" /> Submitted
                          </div>
                       ) : (
                          <button 
                            onClick={() => { setSelectedPeerProject(project); setNewPeerSubmission({...newPeerSubmission, projectId: project.id}); setModalType('submit_project'); }}
                            className="text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 px-4 py-1.5 rounded-md font-medium text-slate-700 dark:text-slate-300 transition-colors"
                          >
                             Submit Project
                          </button>
                       )}
                    </div>
                  );
               })}
            </div>
         </div>

         {/* Needs Review */}
         <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
               <MessageSquare className="w-5 h-5 text-amber-500" /> Needs Review
            </h4>
            <div className="space-y-4">
               {peerSubmissions.filter(sub => sub.studentId !== tenantStudentDocId).length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No peer projects waiting for review.</p>
               ) : peerSubmissions.filter(sub => sub.studentId !== tenantStudentDocId).map(sub => {
                  const project = peerProjects.find(p => p.id === sub.projectId);
                  const hasReviewed = peerReviews.some(r => r.submissionId === sub.id && r.reviewerId === tenantStudentDocId);
                  
                  if (!project || hasReviewed) return null;
                  
                  return (
                    <div key={sub.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50 flex flex-col items-start gap-3">
                       <div>
                         <h5 className="font-bold text-slate-800 dark:text-slate-200">{project.title}</h5>
                         <p className="text-xs text-slate-500 mt-1">Submitted by: <span className="font-medium text-slate-700 dark:text-slate-300">{sub.studentName}</span></p>
                       </div>
                       <button 
                         onClick={() => { setSelectedPeerSubmission(sub); setModalType('peer_review_feedback'); }}
                         className="text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-md font-medium transition-colors"
                       >
                          Review & Grade
                       </button>
                    </div>
                  );
               })}
            </div>
         </div>
      </div>
    </div>
  );

  const renderCategories = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-indigo-500" /> Manage Categories
        </h3>
        
        <form onSubmit={handleSaveCategory} className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input 
              type="text" 
              required
              value={newCategory.name}
              onChange={e => setNewCategory({...newCategory, name: e.target.value})}
              placeholder="Category Name" 
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="flex-1">
            <input 
              type="text" 
              value={newCategory.description}
              onChange={e => setNewCategory({...newCategory, description: e.target.value})}
              placeholder="Description (optional)" 
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap">
            {editingCategoryId ? 'Update Category' : 'Add Category'}
          </button>
          {editingCategoryId && (
            <button type="button" onClick={() => { setEditingCategoryId(null); setNewCategory({ name: '', description: '' }); }} className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors">
              Cancel
            </button>
          )}
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                <th className="pb-3 font-medium px-4">Name</th>
                <th className="pb-3 font-medium px-4">Description</th>
                <th className="pb-3 font-medium px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{cat.name}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{cat.description}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={(e) => handleEditCategory(cat, e)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 mr-3">Edit</button>
                    <button onClick={(e) => handleDeleteCategory(cat.id, e)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-500 italic">No categories created yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <MonitorPlay className="w-8 h-8 text-indigo-600" />
            Digital LMS & Learning
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Hybrid learning management system, digital library video contents, and online examinations.
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto w-full md:w-auto hide-scrollbar">
          {(['dashboard', 'courses', 'categories', 'video-library', 'assessments', 'peer-reviews', 'instructor'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap",
                activeTab === tab 
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
         {activeTab === 'dashboard' && renderDashboard()}
         {activeTab === 'courses' && renderCourses()}
         {activeTab === 'categories' && renderCategories()}
         {activeTab === 'video-library' && renderVideoLibrary()}
         {activeTab === 'assessments' && renderAssessments()}
         {activeTab === 'peer-reviews' && renderPeerReviews()}
         {activeTab === 'instructor' && renderInstructorView()}
      </div>

      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0b0e14] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-black/40 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                {modalType === 'syllabus' && selectedCourse ? (
                  <><BookOpen className="w-5 h-5 text-emerald-500" /> Manage Syllabus: {selectedCourse.title}</>
                ) : modalType === 'class' && selectedCourse ? (
                  <><Video className="w-5 h-5 text-indigo-500" /> View Class: {selectedCourse.title}</>
                ) : modalType === 'upload_video' ? (
                  <><Upload className="w-5 h-5 text-indigo-500" /> Upload Video</>
                ) : modalType === 'create_assessment' ? (
                  <><ListChecks className="w-5 h-5 text-amber-500" /> Create Assessment</>
                ) : modalType === 'peer_review' ? (
                  <><Users className="w-5 h-5 text-indigo-500" /> Create Peer Review Project</>
                ) : modalType === 'submit_project' ? (
                  <><Upload className="w-5 h-5 text-indigo-500" /> Submit Peer Project</>
                ) : modalType === 'peer_review_feedback' ? (
                  <><MessageSquare className="w-5 h-5 text-amber-500" /> Review Peer Project</>
                ) : modalType === 'certificate' ? (
                  <><Award className="w-5 h-5 text-amber-500" /> Certificate of Completion</>
                ) : (
                  <><Plus className="w-5 h-5 text-indigo-500" /> {editingCourseId ? 'Edit Course' : 'Create New Course'}</>
                )}
              </h3>
              <button 
                onClick={() => { setModalType(null); setSelectedCourse(null); }} 
                className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {modalType === 'syllabus' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Manage course modules and materials.</p>
                    <button 
                      onClick={() => setAddingModule(!addingModule)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {addingModule ? 'Cancel' : 'Add Module'}
                    </button>
                  </div>
                  
                  {addingModule && (
                    <form onSubmit={handleAddModule} className="flex gap-2 mb-4">
                      <input 
                        type="text" 
                        required
                        value={newModuleTitle}
                        onChange={e => setNewModuleTitle(e.target.value)}
                        placeholder="Module Title..."
                        className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm"
                      />
                      <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">Save</button>
                    </form>
                  )}

                  <div className="space-y-3">
                    {(syllabuses[selectedCourse?.id] || []).map(mod => (
                      <div key={mod.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-black/20">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{mod.title}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">{mod.materials?.length || 0} Materials</span>
                            <button 
                              onClick={() => setAddingMaterialTo(addingMaterialTo === mod.id ? null : mod.id)}
                              className="text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded border border-indigo-200 dark:border-indigo-500/20 hover:bg-indigo-100"
                            >
                              + Material
                            </button>
                          </div>
                        </div>

                        {addingMaterialTo === mod.id && (
                          <form onSubmit={(e) => handleAddMaterial(e, mod.id)} className="my-3 p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                                <input 
                                  type="text" 
                                  required
                                  value={newMaterial.title}
                                  onChange={e => setNewMaterial({...newMaterial, title: e.target.value})}
                                  placeholder="e.g. Worksheet 1"
                                  className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-transparent dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                                <select 
                                  value={newMaterial.type}
                                  onChange={e => setNewMaterial({...newMaterial, type: e.target.value})}
                                  className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-transparent dark:text-white"
                                >
                                  <option value="pdf">PDF Document</option>
                                  <option value="excel">Excel Spreadsheet</option>
                                  <option value="video">Video Link</option>
                                  <option value="link">Web Link</option>
                                  <option value="quiz">Quiz (CBT)</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">URL / File / Quiz ID</label>
                              <input 
                                type="text" 
                                required
                                value={newMaterial.url}
                                onChange={e => setNewMaterial({...newMaterial, url: e.target.value})}
                                placeholder="https://..."
                                className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-transparent dark:text-white"
                              />
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                              <button type="button" onClick={() => setAddingMaterialTo(null)} className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400">Cancel</button>
                              <button type="submit" className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium">Add</button>
                            </div>
                          </form>
                        )}

                        <ul className="space-y-2 mt-3">
                          {(mod.materials || []).map((mat: any) => (
                            <li key={mat.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                                {mat.type === 'pdf' && <FileText className="w-3.5 h-3.5 text-red-500" />}
                                {mat.type === 'excel' && <FileText className="w-3.5 h-3.5 text-green-500" />}
                                {mat.type === 'video' && <Video className="w-3.5 h-3.5 text-indigo-500" />}
                                {mat.type === 'quiz' && <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />}
                                {mat.type === 'link' && <Library className="w-3.5 h-3.5 text-blue-500" />}
                                {mat.title}
                              </span>
                              <span className="text-slate-400 capitalize px-2 py-0.5 bg-slate-100 dark:bg-slate-900 rounded">{mat.type}</span>
                            </li>
                          ))}
                          {(!mod.materials || mod.materials.length === 0) && (
                            <li className="text-xs text-slate-500 italic text-center py-2">No materials added yet</li>
                          )}
                        </ul>
                      </div>
                    ))}
                    {(syllabuses[selectedCourse?.id] || []).length === 0 && !addingModule && (
                      <div className="text-center py-10 text-slate-500 text-sm">
                        No modules created yet. Click "Add Module" to start.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalType === 'create_course' && (
                <form onSubmit={handleSaveCourse} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Course Title</label>
                    <input 
                      type="text" 
                      required
                      value={newCourse.title}
                      onChange={e => setNewCourse({...newCourse, title: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      placeholder="e.g. Advanced Fiqh" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Instructor</label>
                    <input 
                      type="text" 
                      required
                      value={newCourse.instructor}
                      onChange={e => setNewCourse({...newCourse, instructor: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      placeholder="e.g. Ust. Hidayat" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                    <select 
                      value={newCourse.category}
                      onChange={e => setNewCourse({...newCourse, category: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    >
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">YouTube Video Link</label>
                    <input 
                      type="url" 
                      required
                      value={newCourse.videoUrl}
                      onChange={e => setNewCourse({...newCourse, videoUrl: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      placeholder="https://youtube.com/watch?v=..." 
                    />
                    {newCourse.videoUrl && getYoutubeThumbnail(newCourse.videoUrl) && (
                      <div className="mt-2 aspect-video bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
                        <img src={getYoutubeThumbnail(newCourse.videoUrl)} alt="Thumbnail preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Theme Color</label>
                    <select 
                      value={newCourse.color}
                      onChange={e => setNewCourse({...newCourse, color: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    >
                      <option value="bg-indigo-500">Indigo</option>
                      <option value="bg-emerald-500">Emerald</option>
                      <option value="bg-amber-500">Amber</option>
                      <option value="bg-blue-500">Blue</option>
                      <option value="bg-purple-500">Purple</option>
                      <option value="bg-rose-500">Rose</option>
                    </select>
                  </div>
                  <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
                      {editingCourseId ? 'Save Changes' : 'Create & Add Syllabus'}
                    </button>
                  </div>
                </form>
              )}

              {modalType === 'upload_video' && (
                <form onSubmit={handleUploadVideoSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Course</label>
                    <select
                      required
                      value={newVideoUpload.courseId}
                      onChange={e => setNewVideoUpload({...newVideoUpload, courseId: e.target.value, moduleId: ''})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                    >
                      <option value="">-- Select a Course --</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                  </div>
                  {newVideoUpload.courseId && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Module (Optional)</label>
                      <select
                        value={newVideoUpload.moduleId}
                        onChange={e => setNewVideoUpload({...newVideoUpload, moduleId: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      >
                        <option value="">-- Add as Course Main Video --</option>
                        {(syllabuses[newVideoUpload.courseId] || []).map((mod: any) => (
                          <option key={mod.id} value={mod.id}>{mod.title}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1">If no module is selected, this will replace the course's main overview video.</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Video Title</label>
                    <input 
                      type="text" 
                      required
                      value={newVideoUpload.title}
                      onChange={e => setNewVideoUpload({...newVideoUpload, title: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      placeholder="e.g. Chapter 1: Introduction" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">YouTube Video Link</label>
                    <input 
                      type="url" 
                      required
                      value={newVideoUpload.url}
                      onChange={e => setNewVideoUpload({...newVideoUpload, url: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      placeholder="https://youtube.com/watch?v=..." 
                    />
                    {newVideoUpload.url && getYoutubeThumbnail(newVideoUpload.url) && (
                      <div className="mt-2 aspect-video bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
                        <img src={getYoutubeThumbnail(newVideoUpload.url)} alt="Thumbnail preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
                      Upload Video
                    </button>
                  </div>
                </form>
              )}

              {modalType === 'create_assessment' && (
                <form onSubmit={handleCreateAssessmentSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Assessment Title</label>
                    <input 
                      type="text" 
                      required
                      value={newAssessment.title}
                      onChange={e => setNewAssessment({...newAssessment, title: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      placeholder="e.g. Mid-Term Algebra Review" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Linked Course</label>
                    <select
                      required
                      value={newAssessment.courseId}
                      onChange={e => setNewAssessment({...newAssessment, courseId: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                    >
                      <option value="">-- Select a Course --</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
                      <input 
                        type="date" 
                        value={newAssessment.dueDate}
                        onChange={e => setNewAssessment({...newAssessment, dueDate: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select
                        value={newAssessment.status}
                        onChange={e => setNewAssessment({...newAssessment, status: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" 
                      >
                        <option value="Draft">Draft</option>
                        <option value="Active">Active</option>
                      </select>
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors">
                      Create Assessment
                    </button>
                  </div>
                </form>
              )}

              {modalType === 'class' && selectedCourse && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="aspect-video bg-slate-900 rounded-xl flex items-center justify-center relative overflow-hidden group shadow-md">
                      {selectedCourse.videoUrl ? (
                         <div className="absolute inset-0 w-full h-full">
                            <Player
                             ref={playerRef}
                             url={selectedCourse.videoUrl as any}
                             width="100%"
                             height="100%"
                             controls
                             onReady={() => handleVideoReady(`course_${selectedCourse.id}`)}
                             onProgress={(state: any) => onProgress(state, `course_${selectedCourse.id}`)}
                           />
                         </div>
                      ) : (
                        <>
                          <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80" alt="Class preview" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                          <button className="w-16 h-16 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all transform group-hover:scale-110 z-10 shadow-xl">
                            <PlayCircle className="w-8 h-8" />
                          </button>
                        </>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-xl text-slate-800 dark:text-slate-100">{selectedCourse.title}</h4>
                      <p className="text-sm text-slate-500 mt-1">Instructor: {selectedCourse.instructor} • Live Class Session</p>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-4 text-lg">Course Modules & Materials</h4>
                    <div className="space-y-4">
                      {(syllabuses[selectedCourse.id] || []).map((mod: any, idx: number) => {
                        const isCompleted = completedModules[`${selectedCourse.id}_${mod.id}`] || false;
                        return (
                          <div key={mod.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 shadow-sm transition-all hover:shadow-md">
                            <div className="flex items-center gap-3 mb-3">
                              <button 
                                onClick={() => toggleModuleCompletion(selectedCourse.id, mod.id)}
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  isCompleted 
                                    ? 'bg-emerald-500 border-emerald-500 text-white' 
                                    : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500 dark:hover:border-emerald-500 text-transparent'
                                }`}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <h5 className={`font-bold text-slate-800 dark:text-slate-200 ${isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                                {idx + 1}. {mod.title}
                              </h5>
                            </div>
                            
                            <div className="pl-9 space-y-2">
                              {mod.materials && mod.materials.length > 0 ? (
                                mod.materials.map((mat: any) => (
                                  <button 
                                    key={mat.id}
                                    onClick={() => setViewingMaterial(mat)}
                                    className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors text-left w-full group"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 transition-colors">
                                      {mat.type === 'pdf' ? <FileText className="w-4 h-4" /> :
                                       mat.type === 'video' ? <Video className="w-4 h-4" /> :
                                       mat.type === 'link' ? <Library className="w-4 h-4" /> :
                                       <FileText className="w-4 h-4" />}
                                    </div>
                                    <span className="font-medium">{mat.title}</span>
                                    <span className="text-xs text-slate-400 uppercase ml-auto">{mat.type}</span>
                                  </button>
                                ))
                              ) : (
                                <p className="text-xs text-slate-500 italic">No materials available for this module.</p>
                              )}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50 pl-9">
                              <button 
                                onClick={() => setActiveDiscussionId(activeDiscussionId === mod.id ? null : mod.id)}
                                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1.5 transition-colors"
                              >
                                <MessageSquare className="w-4 h-4" /> 
                                {activeDiscussionId === mod.id ? 'Hide Discussion' : `Discussion (${(discussions[mod.id] || []).length})`}
                              </button>
                              
                              {activeDiscussionId === mod.id && (
                                <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                    {(discussions[mod.id] || []).length === 0 ? (
                                      <p className="text-xs text-slate-400 italic">No comments yet. Start the discussion!</p>
                                    ) : (
                                      (discussions[mod.id] || []).map(comment => (
                                        <div key={comment.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-slate-800 dark:text-slate-200">{comment.author}</span>
                                            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">{comment.role}</span>
                                            <span className="text-[10px] text-slate-400 ml-auto">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                          </div>
                                          <p className="text-slate-600 dark:text-slate-300">{comment.text}</p>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <input 
                                      type="text" 
                                      value={newComment}
                                      onChange={e => setNewComment(e.target.value)}
                                      onKeyDown={e => e.key === 'Enter' && handlePostComment(mod.id)}
                                      placeholder="Ask a question or add a comment..." 
                                      className="flex-1 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200"
                                    />
                                    <button 
                                      onClick={() => handlePostComment(mod.id)}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors flex shrink-0 items-center justify-center"
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {(syllabuses[selectedCourse.id] || []).length === 0 && (
                        <div className="text-center py-8 text-slate-500 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                          No modules have been added to this course yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {modalType === 'peer_review' && (
                <form onSubmit={handleCreatePeerProject} className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Title</label>
                    <input type="text" required value={newPeerProject.title} onChange={e => setNewPeerProject({...newPeerProject, title: e.target.value})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" placeholder="e.g. Final Web Design Assignment" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Course</label>
                    <select required value={newPeerProject.courseId} onChange={e => setNewPeerProject({...newPeerProject, courseId: e.target.value})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      <option value="">Select a course...</option>
                      {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Description</label>
                    <textarea required value={newPeerProject.description} onChange={e => setNewPeerProject({...newPeerProject, description: e.target.value})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" placeholder="Provide instructions for the project" rows={3} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Grading Rubric (for peers)</label>
                    <textarea required value={newPeerProject.rubric} onChange={e => setNewPeerProject({...newPeerProject, rubric: e.target.value})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" placeholder="e.g. 5 points for design, 5 points for usability..." rows={3} />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">Cancel</button>
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">Create Project</button>
                  </div>
                </form>
              )}

              {modalType === 'submit_project' && selectedPeerProject && (
                <form onSubmit={handleSubmitPeerProject} className="p-4 space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg mb-4 border border-slate-200 dark:border-slate-700">
                     <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2">{selectedPeerProject.title}</h4>
                     <p className="text-sm text-slate-600 dark:text-slate-400">{selectedPeerProject.description}</p>
                     <div className="mt-3 text-xs bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-400 p-2 rounded border border-amber-200 dark:border-amber-900/30">
                       <span className="font-bold">Rubric:</span> {selectedPeerProject.rubric}
                     </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Link (URL)</label>
                    <input type="url" required value={newPeerSubmission.url} onChange={e => setNewPeerSubmission({...newPeerSubmission, url: e.target.value})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" placeholder="https://github.com/your/project" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Submission Comments (Optional)</label>
                    <textarea value={newPeerSubmission.comments} onChange={e => setNewPeerSubmission({...newPeerSubmission, comments: e.target.value})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" placeholder="Any notes for your peer reviewers?" rows={3} />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">Cancel</button>
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">Submit Project</button>
                  </div>
                </form>
              )}

              {modalType === 'peer_review_feedback' && selectedPeerSubmission && (
                <form onSubmit={handleSubmitPeerReview} className="p-4 space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg mb-4 border border-slate-200 dark:border-slate-700">
                     <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Submission from: {selectedPeerSubmission.studentName}</p>
                     <a href={selectedPeerSubmission.url} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 text-sm hover:underline mt-1 inline-block break-all">{selectedPeerSubmission.url}</a>
                     {selectedPeerSubmission.comments && (
                       <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">{selectedPeerSubmission.comments}</p>
                     )}
                     
                     <div className="mt-3 text-xs bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-400 p-2 rounded border border-amber-200 dark:border-amber-900/30">
                       <span className="font-bold">Rubric Reminder:</span> {peerProjects.find(p => p.id === selectedPeerSubmission.projectId)?.rubric}
                     </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Qualitative Feedback</label>
                    <textarea required value={newPeerFeedback.comments} onChange={e => setNewPeerFeedback({...newPeerFeedback, comments: e.target.value})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" placeholder="Provide constructive feedback based on the rubric..." rows={4} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Score / Rating (out of 10)</label>
                    <input type="number" min="1" max="10" required value={newPeerFeedback.rating} onChange={e => setNewPeerFeedback({...newPeerFeedback, rating: parseInt(e.target.value)})} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">Cancel</button>
                    <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">Submit Review</button>
                  </div>
                </form>
              )}

              {modalType === 'certificate' && selectedCertificate && (
                <div className="p-8 text-center space-y-6 bg-slate-50 dark:bg-slate-900 rounded-b-2xl">
                  <div className="w-24 h-24 mx-auto bg-amber-100 dark:bg-amber-900/30 text-amber-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <Award className="w-12 h-12" />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-serif text-slate-800 dark:text-slate-100 font-bold tracking-tight">Certificate of Completion</h2>
                  <p className="text-slate-500 text-lg">This is to certify that you have successfully completed</p>
                  <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 my-4">{selectedCertificate.title}</h3>
                  <p className="text-slate-500 mt-4">Instructor: {selectedCertificate.instructor}</p>
                  
                  <div className="pt-8 border-t border-slate-200 dark:border-slate-800 mt-12 flex justify-center">
                    <div className="text-center">
                      <div className="w-48 border-b-2 border-slate-800 dark:border-slate-200 mb-2"></div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 uppercase tracking-widest">Authorized Signature</p>
                    </div>
                  </div>
                  <button onClick={() => window.print()} className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-sm transition-colors flex items-center gap-2 mx-auto">
                    <Download className="w-4 h-4" /> Download PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Material Viewer Modal */}
      {viewingMaterial && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0b0e14] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[95vh] h-full flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-black/40 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                {viewingMaterial.type === 'pdf' ? <FileText className="w-5 h-5 text-rose-500" /> :
                 viewingMaterial.type === 'video' ? <Video className="w-5 h-5 text-indigo-500" /> :
                 <Library className="w-5 h-5 text-emerald-500" />}
                {viewingMaterial.title}
              </h3>
              <div className="flex items-center gap-2">
                <a href={viewingMaterial.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition-colors" title="Open in new tab">
                  <Download className="w-4 h-4" />
                </a>
                <button 
                  onClick={() => setViewingMaterial(null)} 
                  className="p-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-black/60 overflow-hidden relative flex flex-col md:flex-row">
              {viewingMaterial.type === 'pdf' ? (
                <div className="flex-1 overflow-auto flex justify-center p-4">
                  <Document
                    file={viewingMaterial.url}
                    onLoadSuccess={onDocumentLoadSuccess}
                    className="max-w-full"
                    loading={<div className="flex items-center justify-center h-full text-slate-500">Loading PDF...</div>}
                    error={<div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2"><FileText className="w-12 h-12 text-slate-400" /><p>Could not load PDF. It might be blocked by CORS or the URL is invalid.</p><a href={viewingMaterial.url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Click here to open directly</a></div>}
                  >
                    <Page pageNumber={pageNumber} renderTextLayer={false} renderAnnotationLayer={false} width={Math.min(window.innerWidth - 80, 800)} className="shadow-lg" />
                  </Document>
                </div>
              ) : viewingMaterial.type === 'video' ? (
                <>
                  <div className="flex-1 p-4 flex items-center justify-center bg-black">
                     {viewingMaterial.url ? (
                        <div className="w-full max-w-4xl aspect-video rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 bg-black overflow-hidden relative">
                          <Player
                            ref={playerRef}
                            url={viewingMaterial.url as any}
                            width="100%"
                            height="100%"
                            controls
                            onReady={() => handleVideoReady(viewingMaterial.id)}
                            onProgress={(state: any) => onProgress(state, viewingMaterial.id)}
                          />
                        </div>
                     ) : (
                        <div className="text-slate-500">Invalid URL. <a href={viewingMaterial.url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Open link directly</a></div>
                     )}
                  </div>
                  <div className="w-full md:w-80 bg-white dark:bg-[#0b0e14] border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 max-h-64 md:max-h-none">
                    <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                      <button
                        onClick={() => setActiveSideTab('notes')}
                        className={`flex-1 p-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                          activeSideTab === 'notes' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <BookOpen className="w-4 h-4" /> Notes
                      </button>
                      <button
                        onClick={() => setActiveSideTab('comments')}
                        className={`flex-1 p-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                          activeSideTab === 'comments' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4" /> Discuss
                      </button>
                    </div>

                    {activeSideTab === 'notes' ? (
                      <>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                          {(studentNotes[viewingMaterial.id] || []).length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center mt-4">No notes for this video yet.</p>
                          ) : (
                            (studentNotes[viewingMaterial.id] || []).map(note => (
                              <div key={note.id} className="bg-indigo-50 dark:bg-indigo-900/10 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800 text-sm">
                                <button 
                                  onClick={() => seekToTimestamp(note.timestamp)}
                                  className="flex items-center gap-1.5 mb-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold text-xs transition-colors"
                                >
                                  <Clock className="w-3 h-3" /> {note.timestamp}
                                </button>
                                <p className="text-slate-700 dark:text-slate-300">{note.text}</p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                          <div className="flex gap-2 mb-2">
                            <input 
                              type="text" 
                              placeholder="e.g. 1:24" 
                              value={newVideoNote.timestamp}
                              onChange={e => setNewVideoNote({...newVideoNote, timestamp: e.target.value})}
                              className="w-20 text-xs px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                            />
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Add a note..." 
                              value={newVideoNote.text}
                              onChange={e => setNewVideoNote({...newVideoNote, text: e.target.value})}
                              onKeyDown={e => e.key === 'Enter' && handleAddVideoNote()}
                              className="flex-1 text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                            />
                            <button 
                              onClick={handleAddVideoNote}
                              disabled={!newVideoNote.text.trim()}
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto p-3 space-y-4">
                          {(videoComments[viewingMaterial.id] || []).length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center mt-4">No comments yet. Start a discussion!</p>
                          ) : (
                            (videoComments[viewingMaterial.id] || []).map(comment => (
                              <div key={comment.id} className="text-sm">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{comment.author}</span>
                                  <button 
                                    onClick={() => seekToTimestamp(comment.timestamp)}
                                    className="flex items-center gap-1 text-indigo-500 hover:text-indigo-600 font-bold text-xs"
                                  >
                                    <Clock className="w-3 h-3" /> {comment.timestamp}
                                  </button>
                                </div>
                                <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">{comment.text}</p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                          <div className="flex gap-2 mb-2">
                            <input 
                              type="text" 
                              placeholder="e.g. 1:24" 
                              value={newVideoComment.timestamp}
                              onChange={e => setNewVideoComment({...newVideoComment, timestamp: e.target.value})}
                              className="w-20 text-xs px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                            />
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Ask a question..." 
                              value={newVideoComment.text}
                              onChange={e => setNewVideoComment({...newVideoComment, text: e.target.value})}
                              onKeyDown={e => e.key === 'Enter' && handleAddVideoComment()}
                              className="flex-1 text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                            />
                            <button 
                              onClick={handleAddVideoComment}
                              disabled={!newVideoComment.text.trim()}
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                            >
                              Post
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1">
                  <iframe 
                    src={viewingMaterial.url} 
                    className="w-full h-full border-0 bg-white"
                    title={viewingMaterial.title}
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  />
                </div>
              )}
              
              {viewingMaterial.type === 'pdf' && numPages > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full shadow-lg flex items-center gap-4">
                  <button 
                    disabled={pageNumber <= 1}
                    onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
                    className="text-slate-600 dark:text-slate-300 disabled:opacity-50 font-medium"
                  >
                    Previous
                  </button>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Page {pageNumber} of {numPages}
                  </span>
                  <button 
                    disabled={pageNumber >= numPages}
                    onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
                    className="text-slate-600 dark:text-slate-300 disabled:opacity-50 font-medium"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

