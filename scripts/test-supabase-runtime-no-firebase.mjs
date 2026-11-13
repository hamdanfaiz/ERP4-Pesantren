import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configFile.error, undefined, 'Could not read tsconfig.json.');
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const compilerOptions = parsedConfig.options;
const entryPoint = path.join(root, 'src', 'main.tsx');
const visited = new Set();
const violations = [];
const moduleHost = {
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  directoryExists: ts.sys.directoryExists,
  getCurrentDirectory: () => root,
  getDirectories: ts.sys.getDirectories,
  realpath: ts.sys.realpath,
};

function isFirebasePackage(specifier) {
  return /^(?:firebase|firebase-admin|@firebase)(?:\/|$)/.test(specifier);
}

function visit(fileName) {
  const normalizedFile = path.resolve(fileName);
  if (visited.has(normalizedFile)) return;
  visited.add(normalizedFile);
  if (!ts.sys.fileExists(normalizedFile)) return;

  const source = ts.sys.readFile(normalizedFile);
  if (source === undefined) return;
  const sourceFile = ts.createSourceFile(normalizedFile, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  function addSpecifier(node) {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      imports.push({ specifier: node.text, position: node.getStart(sourceFile) });
    }
  }
  function collect(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) addSpecifier(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) addSpecifier(node.arguments[0]);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') addSpecifier(node.arguments[0]);
    ts.forEachChild(node, collect);
  }
  collect(sourceFile);

  for (const item of imports) {
    if (isFirebasePackage(item.specifier)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(item.position);
      violations.push(`${path.relative(root, normalizedFile)}:${line + 1}:${character + 1} imports ${item.specifier}`);
      continue;
    }
    const resolved = ts.resolveModuleName(item.specifier, normalizedFile, compilerOptions, moduleHost).resolvedModule;
    if (!resolved) continue;
    const resolvedPath = path.resolve(resolved.resolvedFileName);
    if (/(?:^|[\\/])src[\\/]firebase(?:FirestoreDisabled)?\.[cm]?[jt]sx?$/.test(resolvedPath)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(item.position);
      violations.push(`${path.relative(root, normalizedFile)}:${line + 1}:${character + 1} reaches retired Firebase adapter ${path.relative(root, resolvedPath)}`);
      continue;
    }
    if (resolvedPath.startsWith(path.join(root, 'src') + path.sep) && /\.(?:[cm]?js|[cm]?jsx|ts|tsx|mts|cts)$/.test(resolvedPath)) visit(resolvedPath);
  }
}

visit(entryPoint);
assert.ok(visited.has(entryPoint), 'Frontend entry point src/main.tsx was not checked.');
const serverEntryPoint = path.join(root, 'server.ts');
visit(serverEntryPoint);
assert.ok(visited.has(serverEntryPoint), 'Server runtime entry point server.ts was not checked.');
assert.deepEqual(violations, [], `Firebase must not appear in the active frontend or server import graph:\n${violations.join('\n')}`);
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const firebaseDependencies = [...Object.keys(packageManifest.dependencies || {}), ...Object.keys(packageManifest.devDependencies || {})]
  .filter(isFirebasePackage);
assert.deepEqual(firebaseDependencies, [], 'Firebase packages must not be installed in this application.');
assert.equal(compilerOptions.paths?.['firebase/firestore'], undefined,
  'TypeScript must not mask Firebase imports; retired screens stay outside active compile roots.');
console.log(`Supabase-only runtime import graphs passed (${visited.size} modules checked from src/main.tsx and server.ts; Firebase packages absent).`);

const appPath = path.join(root, 'src', 'App.tsx');
const appText = fs.readFileSync(appPath, 'utf8');
const app = ts.createSourceFile(appPath, appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expectedRoutes = new Map([
  ['dashboard', ['SupabaseDashboardOverview']], ['master-data', ['MasterDataManager']],
  ['intelligence', ['SupabaseDashboardOverview']],
  ['users', ['UserManagementView']], ['ppdb', ['SupabasePpdbManager']],
  ['cbt', ['SupabaseCBTStudentDashboard', 'SupabaseCBTManager']], ['tahfidz', ['TahfidzManager']],
  ['boarding', ['SupabaseBoardingManager']], ['academic', ['SupabaseAcademicManager']],
  ['lms', ['SupabaseLMSManager']], ['library', ['SupabaseLibraryManager']],
  ['finance', ['SupabaseFinanceManager']], ['communication', ['SupabaseCommunicationHub']],
  ['healthcare', ['SupabaseHealthcareManager']], ['cooperative', ['SupabaseCooperativeManager']],
  ['hris', ['SupabaseHrisManager']], ['document', ['SupabaseDocumentManager']],
  ['donation', ['SupabaseDonationManager']], ['laundry', ['SupabaseLaundryManager']],
  ['ga', ['SupabaseGeneralAffairManager']], ['alumni', ['SupabaseAlumniManager']],
  ['crm', ['SupabaseCrmManager']], ['marketplace', ['SupabaseMarketplaceManager']],
  ['enterprise', ['SupabaseEnterpriseUnitsManager']],
  ['settings', ['SettingsManager']],
  ['erp', ['SupabaseFinanceBudgetManager']],
]);
const legacyRuntimeScreens = [
  './pages/Dashboard', './pages/CBTManager', './pages/CBTStudentDashboard', './pages/BoardingManager',
  './pages/FinanceManager', './pages/CommunicationHub', './pages/AcademicManager', './pages/HealthcareManager',
  './pages/CooperativeManager', './pages/DocumentManager', './pages/LibraryManager', './pages/DonationManager',
  './pages/GeneralAffairManager', './pages/AlumniManager', './pages/CRMManager', './pages/LMSManager',
  './pages/MarketplaceManager', './pages/EnterpriseManager', './pages/ERPManager', './pages/IntelligenceManager',
  './pages/EcosystemManager',
];
const activeImports = [];
function collectAppImports(node) {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const argument = node.arguments[0];
    if (argument && ts.isStringLiteral(argument)) activeImports.push(argument.text);
  }
  ts.forEachChild(node, collectAppImports);
}
collectAppImports(app);
for (const legacyScreen of legacyRuntimeScreens) {
  assert.ok(!activeImports.includes(legacyScreen), `Supabase-only App must not load legacy screen ${legacyScreen}.`);
}

let moduleSwitch;
function findModuleSwitch(node) {
  if (ts.isSwitchStatement(node) && node.expression.getText(app) === 'activeModule') moduleSwitch = node;
  ts.forEachChild(node, findModuleSwitch);
}
findModuleSwitch(app);
assert.ok(moduleSwitch, 'Could not find the activeModule route switch in src/App.tsx.');
const routeClauses = new Map();
for (const clause of moduleSwitch.caseBlock.clauses) {
  if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression)) routeClauses.set(clause.expression.text, clause);
}
function jsxComponentNames(node, names = new Set()) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) names.add(node.tagName.getText(app));
  ts.forEachChild(node, (child) => { jsxComponentNames(child, names); });
  return names;
}
for (const [moduleId, components] of expectedRoutes) {
  const clause = routeClauses.get(moduleId);
  assert.ok(clause, `Missing App route for ${moduleId}.`);
  const names = jsxComponentNames(clause);
  for (const component of components) assert.ok(names.has(component), `Route ${moduleId} must render ${component} in the Supabase-only runtime.`);
}
const sidebarText = fs.readFileSync(path.join(root, 'src', 'components', 'Sidebar.tsx'), 'utf8');
const menuGroups = sidebarText.match(/const MENU_GROUPS = \[([\s\S]*?)\n\];/);
assert.ok(menuGroups, 'Could not find the main Sidebar menu groups.');
for (const moduleId of expectedRoutes.keys()) {
  if (moduleId === 'intelligence') continue; // This destination has its own Analitik group.
  assert.match(menuGroups[1], new RegExp(`id:\\s*['"]${moduleId}['"]`), `Sidebar must expose the ${moduleId} destination for roles allowed by RBAC.`);
}
assert.match(sidebarText, /allowedModules\.includes\(['"]intelligence['"]\)/, 'Sidebar must expose the Analitik destination through its dedicated group.');
assert.ok(!routeClauses.has('ecosystem'), 'PPOB/ecosystem must not have an application route in the initial release.');
assert.ok(!fs.existsSync(path.join(root, 'src', 'pages', 'EcosystemManager.tsx')),
  'The retired mock PPOB/ecosystem screen must not ship in the initial release source.');
assert.ok(!fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes('PAYMENT_GATEWAY_SECRET_KEY'),
  'The initial release must not expose a payment gateway configuration placeholder.');
const tahfidzSource = fs.readFileSync(path.join(root, 'src', 'pages', 'TahfidzManager.tsx'), 'utf8');
assert.match(tahfidzSource, /\{!SUPABASE_TAHFIDZ_RUNTIME && <button[\s\S]*?title="AI Audio Assessment"/,
  'Mock AI audio actions must remain hidden outside the Supabase Tahfidz runtime.');
assert.match(tahfidzSource, /\{!SUPABASE_TAHFIDZ_RUNTIME && isAssessmentOpen && selectedSantri && \(/,
  'The mock AI assessment modal must not render in the Supabase Tahfidz runtime.');

const masterDataSource = fs.readFileSync(path.join(root, 'src', 'pages', 'MasterDataManager.tsx'), 'utf8');
assert.match(masterDataSource, /const visibleTabs = TABS;/,
  'Master Data must keep its owner-focused navigation, including Naming Series, visible in every runtime.');
const masterDataTabs = masterDataSource.match(/const TABS = \[([\s\S]*?)\n\];/);
assert.ok(masterDataTabs, 'Could not find the Master Data tab catalog.');
for (const tabId of ['entities', 'structure', 'naming', 'audit']) {
  assert.match(masterDataTabs[1], new RegExp(`id:\\s*["']${tabId}["']`),
    `Master Data must expose the ${tabId} owner tab.`);
}
assert.doesNotMatch(masterDataTabs[1], /id:\s*["']references["']/,
  'Reference catalogs must live with their owning modules instead of a generic Master Data tab.');
assert.match(masterDataSource, /activeTab === ["']naming["'] \? \(SUPABASE_MASTER_DATA_RUNTIME \? <SupabaseNamingSeriesManager \/> : <section[\s\S]*?Pengaturan penomoran belum tersedia saat ini[\s\S]*?<\/section>\)/,
  'Naming Series must show a clear unavailable state rather than disappear or fall through to mock CRUD when runtime is disabled.');
assert.match(masterDataSource, /const isTenantConfigurationTab = activeTab === ["']naming["'];/,
  'Naming Series configuration must not expose mock record actions when runtime is disabled.');
assert.match(masterDataSource, /const visibleSubTabs = SUB_TABS\[activeTab\] \|\| \[\]/,
  'Master Data must render only categories owned by the selected tab.');
const masterDataCategories = masterDataSource.match(/const SUB_TABS: Record<string, string\[]> = \{([\s\S]*?)\n\};/);
assert.ok(masterDataCategories, 'Could not find the Master Data category map.');
assert.match(masterDataCategories[1], /entities:\s*\["Santri"\]/,
  'The entity tab must own only the student record category.');
assert.match(masterDataCategories[1], /structure:\s*\["Gedung",\s*"Kamar",\s*"Kelas",\s*"Peta Struktur"\]/,
  'The structure tab must own only campus/dorm structure categories.');
assert.doesNotMatch(masterDataCategories[1], /references\s*:/,
  'The Master Data category map must not retain a generic references category.');
assert.doesNotMatch(masterDataCategories[1], /["'](?:Wali Santri|Guru dan Asatidz|Guru|Asatidz|Pegawai|Alumni|Halaqah|Yayasan dan Kampus|Pemesanan Fasilitas)["']/,
  'Records owned by other modules must not be listed as Master Data categories.');
assert.doesNotMatch(masterDataSource, /onNavigate|activeHandoff|MASTER_DATA_DESTINATIONS|Data terkait|Kategori lain dikelola/,
  'Master Data must not render redirects or a related-data shortcut strip.');
assert.doesNotMatch(masterDataSource, /setActiveSubTab\(["']Wali Santri["']\)|Buka Profil Lengkap Wali Santri/,
  'Student details must not navigate into the retired Wali category inside Master Data.');
for (const label of ['Semua Aktivitas', 'Penyaring Multi-Kriteria', 'Relasi Terpadu (berdasarkan ID)', 'Jumlah data:', 'Menampilkan ${paginatedData.length} dari ${filteredData.length} data']) {
  assert.ok(masterDataSource.includes(label), `Master Data interface must use the Indonesian label "${label}".`);
}
for (const retiredLabel of ['Room Booking', 'All Activity', 'Multi-Facet Filter', 'ID-Normalized', 'Showing ${paginatedData.length} of ${filteredData.length} records']) {
  assert.ok(!masterDataSource.includes(retiredLabel), `Master Data interface must not retain the English label "${retiredLabel}".`);
}
assert.match(masterDataSource, /return labels\[value\.toLowerCase\(\)\] \|\| value \|\| "—"/,
  'Master Data status values must be displayed in Indonesian without changing their stored values.');
assert.match(masterDataSource, /const SUPABASE_MASTER_DATA_IMPORT\s*=\s*legacyArchiveImportEnabled\s*&&\s*publicRuntimeConfigValue\(["']VITE_SUPABASE_MASTER_DATA_IMPORT_ENABLED["']\)\s*===\s*["']true["']/,
  'Master Data archive import must remain independently gated from Supabase-only runtime.');
const boardingSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseBoardingManager.tsx'), 'utf8');
for (const section of ['permits', 'discipline', 'attendance', 'assignments', 'facility-ops']) {
  assert.match(boardingSource, new RegExp(`id:\\s*["']${section}["']`), `Asrama must keep the ${section} section visible in the Supabase runtime.`);
}
assert.match(boardingSource, /<ERPTabs\s+tabs=\{tabs\}/,
  'Asrama sections must use the shared tab component.');
assert.match(boardingSource, /<UnavailableSection\s+label=\{selected\.label\}\s+flag=\{selected\.flag\}\s*\/>/,
  'Disabled Asrama sections must show an explicit readiness state instead of disappearing.');
assert.doesNotMatch(boardingSource, /if\s*\(!available\.length\)\s*return\s+null/,
  'Asrama must not render a blank screen when runtime gates are closed.');
const academicSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseAcademicManager.tsx'), 'utf8');
for (const feature of ['report-card', 'conflict-resolver']) {
  assert.ok(academicSource.includes(`id: "${feature}"`), `Academic reference submenu ${feature} must remain visible.`);
}
for (const feature of ['teachers', 'subjects', 'curricula']) {
  assert.ok(academicSource.includes(`id: "${feature}"`), `Academic must own the ${feature} reference submenu moved from Master Data.`);
}
assert.match(academicSource, /!\[\"schedule\",\s*\"conflict-resolver\",\s*\"teachers\",\s*\"subjects\",\s*\"curricula\"\]\.includes\(tab\.id\)\s*\|\|\s*isAdmin/,
  'Academic owner reference tabs must be limited to Admin roles.');
assert.match(academicSource, /activeTab === "teachers"\s*\?\s*<TeacherDirectory[\s\S]*?activeTab === "subjects"\s*\?\s*<SubjectReferenceList[\s\S]*?activeTab === "curricula"\s*\?\s*<CurriculumReferenceList/,
  'Moved academic reference tabs must render their tenant-backed views in the Academic module.');
assert.match(academicSource, /activeTab === "report-card"\s*\?\s*<SupabaseAcademicReportPanel\s+isAdmin=\{isAdmin\}\s*\/>/,
  'E-Rapor must render its tenant-backed report workspace.');
const academicReportSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseAcademicReportPanel.tsx'), 'utf8');
assert.match(academicReportSource, /reportRequest\("\/api\/academic\/report-cards"/,
  'E-Rapor must request its tenant workspace from the Supabase API.');
assert.match(academicReportSource, /error && <div role="alert"/,
  'E-Rapor must show backend readiness and request errors to the operator.');
const generalAffairSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseGeneralAffairManager.tsx'), 'utf8');
assert.match(generalAffairSource, /id:\s*"booking",\s*label:\s*"Pemesanan Fasilitas"/,
  'Facility booking must be owned by Sarana & Prasarana.');
assert.match(generalAffairSource, /activeTab === "booking"\s*\?\s*<Suspense[\s\S]*?<FacilityBooking\s*\/>/,
  'Facility booking must render in its owner module without redirecting from Master Data.');
for (const [file, label, description] of [
  ['SupabaseCrmManager.tsx', 'Wali santri', 'Wali records must be managed in CRM.'],
  ['SupabaseHrisManager.tsx', 'Direktori Pegawai', 'Employee records must be managed in HRIS.'],
  ['SupabaseAlumniManager.tsx', 'directory', 'Alumni records must be managed in the Alumni module.'],
]) {
  const ownerSource = fs.readFileSync(path.join(root, 'src', 'pages', file), 'utf8');
  assert.ok(ownerSource.includes(label), description);
}
const enterpriseSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseEnterpriseUnitsManager.tsx'), 'utf8');
assert.match(enterpriseSource, /yayasan|pesantren|sekolah/i,
  'Yayasan and campus units must remain managed in the multi-unit module.');
assert.match(tahfidzSource, /halaqah/i,
  'Halaqah records must remain managed in the Tahfidz module.');
const cbtSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseCBTManager.tsx'), 'utf8');
for (const feature of ['dashboard', 'calendar', 'packages', 'monitor', 'settings']) {
  assert.ok(cbtSource.includes(`id: "${feature}"`), `CBT reference submenu ${feature} must remain visible.`);
}
for (const feature of ['dashboard', 'calendar', 'packages', 'monitor', 'settings']) {
  assert.ok(cbtSource.includes(`tab === "${feature}" &&`), `CBT ${feature} tab must render its module screen.`);
}
const lmsSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseLMSManager.tsx'), 'utf8');
for (const feature of ['dashboard', 'categories', 'video-library', 'assessments', 'peer-review', 'instructor']) {
  assert.ok(lmsSource.includes(`id: "${feature}"`), `LMS reference submenu ${feature} must remain visible.`);
}
for (const feature of ['dashboard', 'categories', 'video-library', 'assessments', 'peer-review', 'instructor']) {
  assert.ok(lmsSource.includes(`tab === "${feature}" &&`), `LMS ${feature} tab must render its module screen.`);
}
const hrisSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseHrisManager.tsx'), 'utf8');
for (const feature of ['tracking', 'shifts', 'payroll', 'performance', 'hiring', 'analytics']) {
  assert.ok(hrisSource.includes(`id: "${feature}"`), `HRIS reference submenu ${feature} must remain visible.`);
  assert.ok(hrisSource.includes(`tab === "${feature}" &&`), `HRIS ${feature} tab must render its module screen.`);
}
const alumniSource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseAlumniManager.tsx'), 'utf8');
for (const feature of ['directory', 'tracer', 'community', 'donations']) {
  assert.ok(alumniSource.includes(`id: "${feature}"`), `Alumni reference submenu ${feature} must remain visible.`);
}
assert.match(alumniSource, /tab === "directory"\s*\?\s*<>[\s\S]*?<section/,
  'Alumni directory must render its tenant-backed screen.');
assert.match(alumniSource, /tab === "tracer"\s*\?\s*<section/,
  'Alumni tracer study must render its module screen.');
assert.match(alumniSource, /tab === "community"\s*\?\s*<section/,
  'Alumni community must render its module screen.');
assert.match(alumniSource, /requestAlumni\("\/api\/donation\/snapshot"\)/,
  'Alumni donations must read its backend module instead of demo data.');
const librarySource = fs.readFileSync(path.join(root, 'src', 'pages', 'SupabaseLibraryManager.tsx'), 'utf8');
assert.match(librarySource, /id:\s*["']digital["']\s*,\s*label:\s*["']Perpustakaan Digital["']/,
  'The digital library submenu must remain visible when the Storage feature flag is closed.');
assert.match(librarySource, /activeTab === "digital" && !digitalAssetsEnabled && <ERPFeatureStatus/,
  'The digital library must explain its closed Storage gate instead of appearing to disappear.');
const archiveImportPolicy = fs.readFileSync(path.join(root, 'src', 'runtimeBackend.ts'), 'utf8');
assert.match(archiveImportPolicy, /export const legacyArchiveImportEnabled = false/,
  'Firestore archive imports must remain disabled after the no-copy decision.');
const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
for (const retiredServerCapability of [
  'firebase-admin', 'initializeApp', 'getFirestore', 'LEGACY_FIREBASE_ADMIN_ENABLED',
  'readLegacyFirestoreTenantRows', 'isLegacyArchiveImportEnabled',
]) {
  assert.ok(!serverSource.includes(retiredServerCapability),
    `The Supabase server must not retain the retired Firebase/import capability ${retiredServerCapability}.`);
}
assert.doesNotMatch(serverSource, /\b(?:firebase|firestore)\b/i,
  'The Supabase server must not retain Firebase or Firestore references.');
assert.doesNotMatch(serverSource, /SUPABASE_[A-Z0-9_]*IMPORT[A-Z0-9_]*_ENABLED/,
  'Archive import feature flags must not be able to reopen a retired server endpoint.');
assert.match(serverSource, /const financeBudgetRuntimeEnabled\s*=\s*String\(process\.env\.SUPABASE_FINANCE_BUDGET_RUNTIME_ENABLED\s*\|\|\s*["']{2}\)\.trim\(\)\.toLowerCase\(\)\s*===\s*["']true["']/,
  'RKAT runtime must remain disabled unless its explicit server-side flag is true.');
assert.match(serverSource, /app\.get\(["']\/api\/erp\/budget\/snapshot["'],\s*requireAuth,[\s\S]*?if\s*\(!financeRuntimeEnabled\s*\|\|\s*!financeBudgetRuntimeEnabled\)/,
  'RKAT reads must require authentication and both Finance and budget runtime flags.');
assert.match(serverSource, /app\.post\(["']\/api\/erp\/budget\/mutations["'],\s*requireAuth,[\s\S]*?if\s*\(!financeRuntimeEnabled\s*\|\|\s*!financeBudgetRuntimeEnabled\)/,
  'RKAT writes must require authentication and both Finance and budget runtime flags.');
assert.match(serverSource, /const enterpriseUnitsRuntimeEnabled\s*=\s*String\(process\.env\.SUPABASE_ENTERPRISE_UNITS_RUNTIME_ENABLED\s*\|\|\s*["']{2}\)\.trim\(\)\.toLowerCase\(\)\s*===\s*["']true["']/,
  'Enterprise units runtime must remain disabled unless its explicit server-side flag is true.');
assert.match(serverSource, /app\.get\(["']\/api\/enterprise\/units\/snapshot["'],\s*requireAuth,[\s\S]*?if\s*\(!enterpriseUnitsRuntimeEnabled\)/,
  'Enterprise unit reads must require authentication and the runtime gate.');
assert.match(serverSource, /app\.post\(["']\/api\/enterprise\/units\/mutations["'],\s*requireAuth,[\s\S]*?if\s*\(!enterpriseUnitsRuntimeEnabled\)/,
  'Enterprise unit writes must require authentication and the runtime gate.');
assert.match(serverSource, /app\.get\(["']\/api\/enterprise\/master-data\/unit-assignment\/unmapped["'],\s*requireAuth,[\s\S]*?if\s*\(!enterpriseUnitsRuntimeEnabled\s*\|\|\s*!masterDataRuntimeEnabled\)/,
  'Unit assignment queue reads must require authentication and both enterprise and Master Data runtime gates.');
assert.match(serverSource, /app\.post\(["']\/api\/enterprise\/master-data\/unit-assignment["'],\s*requireAuth,[\s\S]*?if\s*\(!enterpriseUnitsRuntimeEnabled\s*\|\|\s*!masterDataRuntimeEnabled\)/,
  'Unit assignment writes must require authentication and both enterprise and Master Data runtime gates.');
assert.match(serverSource, /app\.get\(["']\/api\/enterprise\/finance\/unit-assignment\/unmapped["'],\s*requireAuth,[\s\S]*?if\s*\(!enterpriseUnitsRuntimeEnabled\s*\|\|\s*!financeRuntimeEnabled\)/,
  'Finance unit mapping reads must require authentication and both enterprise and Finance runtime gates.');
assert.match(serverSource, /app\.post\(["']\/api\/enterprise\/finance\/unit-assignment["'],\s*requireAuth,[\s\S]*?if\s*\(!enterpriseUnitsRuntimeEnabled\s*\|\|\s*!financeRuntimeEnabled\)/,
  'Finance unit mapping writes must require authentication and both enterprise and Finance runtime gates.');
const retiredServerImportRoutes = new Set([
  '/api/ppdb/legacy/import', '/api/academic/legacy/import', '/api/cbt/legacy/import',
  '/api/cbt/legacy/settings-import', '/api/healthcare/legacy/import', '/api/ga/legacy/import',
  '/api/cooperative/legacy/catalog-import', '/api/cooperative/legacy/financial-import/preview',
  '/api/cooperative/legacy/financial-import/apply', '/api/marketplace/legacy/import',
  '/api/facility-bookings/legacy/import', '/api/lms/legacy/import', '/api/library/legacy/import',
  '/api/library/circulations/legacy/import', '/api/master-data/structures/migrate',
  '/api/master-data/students/migrate', '/api/boarding/permits/migrate',
  '/api/boarding/discipline/migrate', '/api/boarding/attendance/migrate',
  '/api/boarding/facility-ops/migrate', '/api/tahfidz/migration',
  '/api/communication/announcements/migrate', '/api/system/settings/migrate',
  '/api/system/settings/prepare', '/api/hris/legacy/employees/import',
  '/api/data-migrations/local-storage',
]);
const serverSourceFile = ts.createSourceFile('server.ts', serverSource, ts.ScriptTarget.Latest, true);
const retiredRouteHandlers = new Map();
function collectRetiredServerRoutes(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'post' && node.arguments.length >= 3
    && ts.isStringLiteral(node.arguments[0]) && retiredServerImportRoutes.has(node.arguments[0].text)) {
    assert.ok(!retiredRouteHandlers.has(node.arguments[0].text),
      `${node.arguments[0].text} must not be registered more than once.`);
    assert.equal(node.arguments[1].getText(serverSourceFile), 'requireAuth',
      `${node.arguments[0].text} must remain authenticated while returning its retired status.`);
    retiredRouteHandlers.set(node.arguments[0].text, node.arguments[2].getText(serverSourceFile));
  }
  ts.forEachChild(node, collectRetiredServerRoutes);
}
collectRetiredServerRoutes(serverSourceFile);
assert.deepEqual([...retiredRouteHandlers.keys()].sort(), [...retiredServerImportRoutes].sort(),
  'Every retired archive/data migration route must be present exactly once and no route may be silently re-enabled.');
for (const [route, handler] of retiredRouteHandlers) {
  assert.match(handler, /status\(410\)/, `${route} must permanently reject legacy imports.`);
  assert.match(handler, /LEGACY_ARCHIVE_IMPORT_REMOVED/,
    `${route} must return a stable machine-readable retirement code.`);
}
const archiveImportScreens = [
  'src/pages/MasterDataManager.tsx', 'src/pages/SettingsManager.tsx', 'src/pages/TahfidzManager.tsx',
  'src/components/SupabaseFacilityBooking.tsx', 'src/pages/CommunicationHubLegacy.tsx',
  'src/pages/SupabaseAcademicManager.tsx',
  'src/pages/SupabaseBoardingAttendanceManager.tsx', 'src/pages/SupabaseBoardingDisciplineManager.tsx',
  'src/pages/SupabaseBoardingFacilityOpsManager.tsx', 'src/pages/SupabaseBoardingPermitsManager.tsx',
  'src/pages/SupabaseCommunicationHub.tsx', 'src/pages/SupabaseHealthcareManager.tsx',
  'src/pages/SupabaseLMSManager.tsx', 'src/pages/SupabaseGeneralAffairsAssets.tsx',
  'src/pages/SupabaseMarketplaceManager.tsx', 'src/pages/SupabaseCBTManager.tsx',
  'src/pages/SupabaseCooperativeManager.tsx', 'src/pages/SupabaseLibraryManager.tsx',
];
for (const relativePath of archiveImportScreens) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.match(source, /legacyArchiveImportEnabled/, `${relativePath} must respect the global no-copy policy.`);
}
const importGateScreens = [
  { path: 'src/pages/SettingsManager.tsx', constant: 'SUPABASE_SYSTEM_SETTINGS_IMPORT', flag: 'VITE_SUPABASE_SYSTEM_SETTINGS_IMPORT_ENABLED' },
  { path: 'src/pages/TahfidzManager.tsx', constant: 'SUPABASE_TAHFIDZ_IMPORT', flag: 'VITE_SUPABASE_TAHFIDZ_IMPORT_ENABLED' },
  { path: 'src/components/SupabaseFacilityBooking.tsx', constant: 'SUPABASE_FACILITY_BOOKINGS_IMPORT', flag: 'VITE_SUPABASE_FACILITY_BOOKINGS_IMPORT_ENABLED' },
  { path: 'src/pages/CommunicationHubLegacy.tsx', constant: 'SUPABASE_COMMUNICATION_IMPORT', flag: 'VITE_SUPABASE_COMMUNICATION_IMPORT_ENABLED' },
];
for (const { path: relativePath, constant, flag } of importGateScreens) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const gate = new RegExp("const " + constant + "\\s*=\\s*legacyArchiveImportEnabled\\s*&&\\s*publicRuntimeConfigValue\\([\"']" + flag + "[\"']\\)\\s*===\\s*[\"']true[\"']");
  assert.match(source, gate, relativePath + ' must require the global no-copy policy and its local import flag.');
}

const settingsImportSource = fs.readFileSync(path.join(root, 'src/pages/SettingsManager.tsx'), 'utf8');
assert.match(settingsImportSource, /const runSettingsMigration = async \(apply: boolean\) => \{\s*if \(!SUPABASE_SYSTEM_SETTINGS \|\| !SUPABASE_SYSTEM_SETTINGS_IMPORT\) return;/,
  'Settings migration action must fail closed when archive import is disabled.');
const tahfidzImportSource = fs.readFileSync(path.join(root, 'src/pages/TahfidzManager.tsx'), 'utf8');
assert.match(tahfidzImportSource, /const handleTahfidzImport = async \(apply = false\) => \{\s*if \(!SUPABASE_TAHFIDZ_RUNTIME \|\| !SUPABASE_TAHFIDZ_IMPORT\) return;/,
  'Tahfidz migration action must fail closed when archive import is disabled.');
const facilityBookingSource = fs.readFileSync(path.join(root, 'src/components/SupabaseFacilityBooking.tsx'), 'utf8');
assert.match(facilityBookingSource, /const previewImport = async \(\) => \{\s*if \(!SUPABASE_FACILITY_BOOKINGS_IMPORT\) return;/,
  'Facility booking preview action must fail closed when archive import is disabled.');
assert.match(facilityBookingSource, /const applyImport = async \(\) => \{\s*if \(!SUPABASE_FACILITY_BOOKINGS_IMPORT\) return;/,
  'Facility booking apply action must fail closed when archive import is disabled.');

const sessionStorageAllowlist = new Set([
  'src/utils/pendingMutationId.ts',
  'src/utils/supabase.ts',
]);
function isBrowserStorageObject(node, storageName) {
  return (ts.isIdentifier(node) && node.text === storageName)
    || (ts.isPropertyAccessExpression(node)
      && node.name.text === storageName
      && ts.isIdentifier(node.expression)
      && ['window', 'globalThis'].includes(node.expression.text));
}
function containsBrowserStorageObject(node, storageName) {
  if (isBrowserStorageObject(node, storageName)) return true;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return containsBrowserStorageObject(node.expression, storageName);
  }
  return false;
}
function findBrowserPersistenceViolations(relativeFile, source) {
  const violations = [];
  if (/\b(?:window\s*\.\s*)?sessionStorage\b/.test(source)) {
    if (!sessionStorageAllowlist.has(relativeFile)) {
      violations.push(`${relativeFile}:unapproved sessionStorage`);
    }
  }

  const sourceFile = ts.createSourceFile(relativeFile, source, ts.ScriptTarget.Latest, true);
  function inspectStorage(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['setItem', 'clear'].includes(node.expression.name.text)
      && containsBrowserStorageObject(node.expression.expression, 'localStorage')) {
      violations.push(`${relativeFile}:${node.expression.name.text}`);
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && containsBrowserStorageObject(node.left, 'localStorage')) {
      violations.push(`${relativeFile}:localStorage assignment`);
    }
    if (ts.isDeleteExpression(node) && containsBrowserStorageObject(node.expression, 'localStorage')) {
      violations.push(`${relativeFile}:localStorage delete`);
    }
    ts.forEachChild(node, inspectStorage);
  }
  inspectStorage(sourceFile);
  return violations;
}
const browserPersistenceViolations = [];
for (const runtimeFile of visited) {
  if (!runtimeFile.startsWith(path.join(root, 'src') + path.sep)) continue;
  const relativeFile = path.relative(root, runtimeFile).replaceAll('\\', '/');
  const source = fs.readFileSync(runtimeFile, 'utf8');
  browserPersistenceViolations.push(...findBrowserPersistenceViolations(relativeFile, source));
}
assert.deepEqual(browserPersistenceViolations, [],
  `Operational records must persist through the tenant backend, not browser localStorage:\n${browserPersistenceViolations.join('\n')}`);
assert.deepEqual(
  findBrowserPersistenceViolations('src/pages/Unsafe.tsx', "localStorage.setItem('students', JSON.stringify(students));"),
  ['src/pages/Unsafe.tsx:setItem'],
  'The browser persistence policy must reject a localStorage record-write regression.',
);
const structureRegistrationSource = fs.readFileSync(path.join(root, 'src/components/StructureRegistrationForm.tsx'), 'utf8');
assert.doesNotMatch(structureRegistrationSource, /Runtime Supabase Master Data|berhasil disimpan ke Supabase|Diterbitkan backend saat disimpan/,
  'Customer-facing structure forms must not expose provider or implementation details.');
console.log(`Supabase-only module routing passed (${expectedRoutes.size} Supabase routes; PPOB/ecosystem excluded; ${retiredRouteHandlers.size} retired migration routes closed).`);
console.log('Browser persistence policy passed (no active localStorage writes; sessionStorage limited to Supabase Auth and temporary idempotency keys).');




