export type Tenant = {
  id: string;
  name: string;
  logoUrl?: string;
  type: 'Pesantren' | 'Sekolah' | 'Tahfidz Center';
};

export type Santri = {
  id: string;
  nis: string;
  name: string;
  grade: string;
  halaqah: string;
  avatarUrl?: string;
};

export type TahfidzProgress = {
  santriId: string;
  juzTarget: number;
  juzAchieved: number;
  status: 'on-track' | 'at-risk' | 'ahead';
};

export type RegistrationStage =
  | "Registered"
  | "Document Review"
  | "Entry Exam"
  | "Interview"
  | "Accepted"
  | "Rejected";

export interface Candidate {
  id: string;
  tenantId?: string;
  registrationId: string;
  name: string;
  avatar?: string;
  previousSchool: string;
  grade: string;
  phone: string;
  email?: string;
  nik?: string;
  nisn?: string;
  pob?: string;
  dob?: string;
  gender?: "L" | "P";
  address?: string;
  province?: string;
  regency?: string;
  district?: string;
  village?: string;
  fatherName?: string;
  motherName?: string;
  fatherJob?: string;
  motherJob?: string;
  fatherEducation?: string;
  motherEducation?: string;
  familyIncome?: string;
  whatsappPhone?: string;
  stage: RegistrationStage;
  score?: number;
  dateApplied: string;
  examSlot?: string;
  interviewer?: string;
  interviewSlot?: string;
  interviewNotified?: boolean;
  notes?: string;
  syncToMasterData?: boolean;
  syncDate?: string;
  documents?: {
    kk?: boolean;
    birthCertificate?: boolean;
    reportCards?: boolean;
    ijazah?: boolean;
    skhun?: boolean;
    pasPhoto?: boolean;
  };
  examScores?: {
    math?: number;
    science?: number;
    english?: number;
    tpa?: number;
    quran?: number;
    [subject: string]: number | undefined;
  };
  interviewScores?: {
    academicPotential?: number;
    personality?: number;
    communication?: number;
  };
  religiousScores?: {
    quranFluency?: number;
    tajweedMastery?: number;
    memorizedJuz?: string;
    worshipPractice?: number;
    notes?: string;
    evaluator?: string;
    evaluatedAt?: string;
    totalScore?: number;
  };
  payment?: {
    registrationFee?: {
      amount: number;
      status: 'Unpaid' | 'Verification' | 'Paid';
      paidAt?: string;
      method?: string;
      receiptNo?: string;
      invoiceId?: string;
      proofUrl?: string;
    };
    tuitionFee?: {
      amount: number;
      paidAmount?: number;
      status: 'Unpaid' | 'Partial' | 'Paid' | 'Verification';
      paidAt?: string;
      method?: string;
      receiptNo?: string;
      invoiceId?: string;
      proofUrl?: string;
    };
    totalPaid?: number;
  };
  cbtSync?: {
    syncedAt?: string;
    cbtExamId?: string;
    passed?: boolean;
    averageScore?: number;
  };
  nis?: string;
  classId?: string;
  className?: string;
  dormitory?: string;
  dormitoryId?: string;
  room?: string;
  roomId?: string;
  onboardingStatus?: 'Pending' | 'Completed';
  onboardedAt?: string;
  waliAccountCreated?: boolean;
  waliAccountStatus?: 'PendingProvisioning' | 'Active' | 'Disabled';
  waliUsername?: string;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  status: 'Active' | 'Completed' | 'Draft';
  endDate: string;
}

export interface Donor {
  id: string;
  name: string;
  phone: string;
  email: string;
  type: 'Regular' | 'Occasional' | 'Prospect';
  totalDonated: number;
  lastDonationDate?: string;
}

export interface Transaction {
  id: string;
  donorId: string;
  donorName: string;
  campaignId: string;
  campaignTitle: string;
  amount: number;
  date: string;
  method: 'Transfer' | 'Cash' | 'QRIS';
  status: 'Success' | 'Pending' | 'Failed';
}

export type ModuleId =
  | 'dashboard'
  | 'master-data'
  | 'ppdb'
  | 'tahfidz'
  | 'boarding'
  | 'finance'
  | 'communication'
  | 'academic'
  | 'healthcare'
  | 'cooperative'
  | 'hris'
  | 'document'
  | 'library'
  | 'donation'
  | 'laundry'
  | 'settings'
  | 'enterprise'
  | 'erp'
  | 'ga'
  | 'alumni'
  | 'crm'
  | 'lms'
  | 'intelligence'
  | 'marketplace'
  | 'cbt'
  | 'users';
