export const generateMockData = () => {
  const GENDERS = ["L", "P"] as ("L" | "P")[];
  const STATUSES = ["Active", "Inactive", "Alumni"];
  const GRADES = ["X-A", "X-B", "XI-A", "XI-B", "XII-A", "XII-B"];
  const BLOOD_TYPES = ["A", "B", "AB", "O"];
  const JOBS = ["PNS", "BUMN", "Wiraswasta", "Guru", "Dokter", "TNI/Polri"];
  const INCOMES = ["< Rp 2.000.000", "Rp 2.000.000 - Rp 5.000.000", "Rp 5.000.000 - Rp 10.000.000", "Rp 10.000.000 - Rp 20.000.000", "> Rp 20.000.000"];
  const CITIES = ["Jakarta", "Bandung", "Surabaya", "Yogyakarta", "Semarang", "Malang"];
  const EDU_DEGREES = ["SD", "SMP", "SMA", "D3", "S1", "S2", "S3"];
  const PREV_SCHOOLS = ["SMPN 1 Jakarta", "SMP IT Nurul Fikri", "MTS Negeri 3", "SMP Islam Al Azhar"];
  const STAGES = ["Registered", "Document Review", "Entry Exam", "Interview", "Accepted", "Rejected"] as any[];

  const randomFrom = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
  const randomPhone = () => `+62 8${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const randomNik = () => `317${Math.floor(1000000000000 + Math.random() * 9000000000000)}`;

  const generateNames = (count: number, prefix: string) => 
    Array.from({ length: count }, (_, i) => `${prefix} ${i + 1} - ${randomFrom(["Ahmad", "Budi", "Cahyo", "Fatimah", "Aisyah", "Zaid", "Umar", "Siti", "Dewi", "Khadijah"])}`);

  const generateEntity = (type: string, idPrefix: string) => {
    return Array.from({ length: 50 }, (_, i) => ({
      id: `${idPrefix}-${1000 + i}`,
      name: `${type} Name ${i + 1}`,
      type,
      gender: randomFrom(GENDERS),
      phone: randomPhone(),
      email: `user${1000+i}@example.com`,
      status: randomFrom(STATUSES),
      address: `Jl. ${randomFrom(CITIES)} No. ${i+1}`,
      createdAt: new Date().toISOString()
    }));
  };

  const santris = generateEntity("Santri", "SNT").map(s => ({
    ...s,
    grade: randomFrom(GRADES),
    nik: randomNik(),
    nisn: `00${Math.floor(10000000 + Math.random() * 90000000)}`,
    pob: randomFrom(CITIES),
    dob: "2005-01-01",
    dormitory: `Asrama ${randomFrom(["Abu Bakar", "Umar", "Khadijah", "Aisyah"])}`,
    bloodType: randomFrom(BLOOD_TYPES),
    medical: "None",
    virtualAccount: `8801${Math.floor(10000000 + Math.random() * 90000000)}`
  }));

  const walis = generateEntity("Wali Santri", "WAL").map((w, i) => ({
    ...w,
    nik: randomNik(),
    occupation: randomFrom(JOBS),
    income: randomFrom(INCOMES),
    education: randomFrom(EDU_DEGREES),
    studentName: santris[i % santris.length].name,
    studentGrade: santris[i % santris.length].grade
  }));

  const asatidz = generateEntity("Asatidz", "AST").map(a => ({
    ...a,
    specialization: randomFrom(["Fiqih", "Aqidah", "Tahfidz", "Bahasa Arab", "Tafsir"]),
    halaqah: `Halaqah ${Math.floor(Math.random() * 20) + 1}`,
    education: randomFrom(["S1 Madinah", "S1 Al-Azhar", "S1 LIPIA"])
  }));

  const guru = generateEntity("Guru", "GRU").map(g => ({
    ...g,
    subject: randomFrom(["Matematika", "IPA", "IPS", "Bahasa Indonesia", "Bahasa Inggris"]),
    certificationStatus: randomFrom(["Certified", "Not Certified"])
  }));

  const pegawai = generateEntity("Pegawai", "PEG").map(p => ({
    ...p,
    department: randomFrom(["Keuangan", "IT", "HR", "Logistik", "Dapur", "Keamanan"]),
    role: randomFrom(["Staff", "Supervisor", "Manager"]),
    shift: randomFrom(["Pagi", "Siang", "Malam"])
  }));

  const alumni = generateEntity("Alumni", "ALU").map(a => ({
    ...a,
    graduationYear: Math.floor(Math.random() * 10) + 2010,
    currentActivity: randomFrom(["Kuliah UI", "Kuliah UGM", "Kerja BUMN", "Wiraswasta"]),
    status: "Alumni"
  }));

  const EXAM_SLOTS = ["session-1", "session-2", "session-3"];
  const INTERVIEW_SLOTS = ["int-1", "int-2", "int-3"];

  const candidates = Array.from({ length: 50 }, (_, i) => {
    const stage = randomFrom(STAGES);
    const hasExam = ["Entry Exam", "Interview", "Accepted", "Rejected"].includes(stage);
    const hasInterview = ["Interview", "Accepted", "Rejected"].includes(stage);

    return {
      id: `CND-${1000 + i}`,
      registrationId: `REG-${2026}${1000 + i}`,
      name: `Calon Santri ${i + 1}`,
      previousSchool: randomFrom(PREV_SCHOOLS),
      grade: randomFrom(["SD", "SMP", "SMA", "TK"]),
      phone: randomPhone(),
      email: `candidate${i+1}@example.com`,
      nik: randomNik(),
      nisn: `00${Math.floor(10000000 + Math.random() * 90000000)}`,
      pob: randomFrom(CITIES),
      dob: "2010-01-01",
      gender: randomFrom(GENDERS),
      address: `Jl. ${randomFrom(CITIES)} No. ${i+1}`,
      fatherName: `Bapak Calon ${i+1}`,
      motherName: `Ibu Calon ${i+1}`,
      fatherJob: randomFrom(JOBS),
      motherJob: randomFrom(JOBS),
      fatherEducation: randomFrom(EDU_DEGREES),
      motherEducation: randomFrom(EDU_DEGREES),
      familyIncome: randomFrom(INCOMES),
      whatsappPhone: randomPhone(),
      stage,
      score: hasExam ? Math.floor(Math.random() * 40) + 60 : null,
      examSlot: hasExam ? randomFrom(EXAM_SLOTS) : null,
      interviewSlot: hasInterview ? randomFrom(INTERVIEW_SLOTS) : null,
      dateApplied: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString()
    };
  });

  // Structure Data
  const generateStructure = (count: number, type: string, pref: string, baseCap: number) => 
    Array.from({ length: count }, (_, i) => ({
      id: `${pref}-${100 + i}`,
      name: `${type} ${i + 1}`,
      type,
      capacity: `${baseCap + Math.floor(Math.random() * 10)} Orang`,
      location: `Area ${randomFrom(["Utara", "Selatan", "Timur", "Barat"])}`,
      status: "Active"
    }));

  return {
    Santri: santris,
    "Wali Santri": walis,
    Asatidz: asatidz,
    Guru: guru,
    Pegawai: pegawai,
    Alumni: alumni,
    candidates: candidates,
    Kampus: generateStructure(5, "Kampus", "KMP", 500),
    Gedung: generateStructure(15, "Gedung", "BLD", 200),
    Kamar: generateStructure(50, "Kamar", "RM", 10),
    Kelas: generateStructure(30, "Kelas", "CLS", 30),
    Halaqah: generateStructure(40, "Halaqah", "HLQ", 15),
    "Active Unit": generateStructure(10, "Unit", "UNT", 50),
    "Active Role": [
      { id: "ROLE-1", name: "Super Administrator", type: "System", capacity: "-", location: "-", status: "Active" },
      { id: "ROLE-2", name: "Admin Data", type: "Staff", capacity: "-", location: "-", status: "Active" },
      { id: "ROLE-3", name: "Keuangan", type: "Staff", capacity: "-", location: "-", status: "Active" },
    ]
  };
};
