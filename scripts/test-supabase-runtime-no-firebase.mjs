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
assert.deepEqual(violations, [], `Firebase must not appear in the active frontend import graph:\n${violations.join('\n')}`);
console.log(`Supabase-only frontend import graph passed (${visited.size} modules checked from src/main.tsx).`);

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
assert.match(masterDataSource, /const SUPABASE_MASTER_DATA_IMPORT\s*=\s*legacyArchiveImportEnabled\s*&&\s*publicRuntimeConfigValue\(["']VITE_SUPABASE_MASTER_DATA_IMPORT_ENABLED["']\)\s*===\s*["']true["']/,
  'Master Data archive import must remain independently gated from Supabase-only runtime.');
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
console.log(`Supabase-only module routing passed (${expectedRoutes.size} Supabase routes; PPOB/ecosystem excluded; ${retiredRouteHandlers.size} retired migration routes closed).`);

