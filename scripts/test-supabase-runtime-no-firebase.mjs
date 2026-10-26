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
  ['settings', ['SettingsManager']],
]);
const unavailableRoutes = ['enterprise', 'erp', 'intelligence', 'ecosystem'];
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
for (const moduleId of unavailableRoutes) {
  const clause = routeClauses.get(moduleId);
  assert.ok(clause, `Missing fail-closed App route for ${moduleId}.`);
  assert.match(clause.getText(app), /supabaseRuntimeUnavailable/, `Route ${moduleId} must fail closed until its Supabase module exists.`);
}
const masterDataSource = fs.readFileSync(path.join(root, 'src', 'pages', 'MasterDataManager.tsx'), 'utf8');
assert.match(masterDataSource, /const SUPABASE_MASTER_DATA_IMPORT\s*=\s*import\.meta\.env\.VITE_SUPABASE_MASTER_DATA_IMPORT_ENABLED\s*===\s*["']true["']/,
  'Master Data archive import must remain independently gated from Supabase-only runtime.');
console.log(`Supabase-only module routing passed (${expectedRoutes.size} Supabase routes and ${unavailableRoutes.length} fail-closed routes).`);

