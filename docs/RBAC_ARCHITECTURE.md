# Role-Based Access Control (RBAC) & Architecture split

## Overview
Sebuah layer otentikasi simulasi telah diimplementasikan dalam aplikasi untuk membagi alur pengalaman pengguna ke dalam **dua domain (mode)**:
1. **Frontend (External/Client):** Halaman publik untuk umum, calon santri, walisantri, maupun donatur yang tidak masuk (login) ke dalam sistem dashboard internal. Aplikasi menampilkan landing page informatif, profil sekolah (PPDB & Donasi).
2. **Backend (Internal/Dashboard):** Area autentikasi terkurasi di mana akses fungsional fitur difilter bedasarkan peran atau Role pengguna.

## Component & State Architecture
Sistem dipayungi oleh sebuah Context bernama `AuthContext` yang membungkus komponen App di tingkat hierarki tertinggi (`main.tsx`).

### Roles Definition (`src/rbac.ts`)
Setiap Role memiliki limitasi akses ke modul-modul spesifik.
- **SuperAdmin:** Memiliki kontrol terhadap 100% modul (termasuk settings & CRM/ERP).
- **Admin:** Memiliki kontrol penuh atas master data, PPDB, akademi, cbt, donasi, dan alumni (operasional inti).
- **Ustadz:** Hanya difokuskan pada kegiatan fungsional Akademik (CBT, tahfidz, asrama, LMS, komunikasi).
- **Santri:** Portal akademik yang terbatas pada CBT, asrama, tagihan finansial, e-learning LMS, dan tahfidz personal.
- **Walisantri:** Sama dengan santri, ditambah akses visibilitas tagihan lengkap dan sistem donasi partisipatoris.
- **Public:** User tanpa autentikasi, hanya melihat portal frontend.

### Mode Tampilan (`src/App.tsx`)
Aplikasi sekarang memuat pengkondisian status di `App.tsx`:
```tsx
  if (role === 'Public') {
    if (showLogin) {
      // Halaman login untuk memilih peran (simulasi)
      return <LoginView onBack={() => setShowLogin(false)} />;
    }
    // Halaman landing page / Frontend Publik 
    return <FrontendOverview onLoginClick={() => setShowLogin(true)} branding={branding} />;
  }
  // Mode Dashboard / Internal Backend (ter-auth)
  return <div className="flex h-screen ..."> { /* Sidebar, Header, Modules */ } </div>
```
Modul sidebar diperkuat dengan `ROLE_MODULES[role]` agar modul yang tampil di layout navigasi (Sidebar) relevan dengan izin yang dimiliki. Jika role terdeteksi dan *activeModule* tidak direstui, route redirect secara otomatis ke index/modul izin tertingginya.
