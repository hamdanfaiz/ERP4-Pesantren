import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["src/pages", "src/components"];
const uiAttributes = new Set(["alt", "aria-description", "aria-label", "description", "emptyLabel", "emptyTitle", "helperText", "label", "placeholder", "title"]);
const uiDescriptors = new Set(["alt", "description", "emptyLabel", "emptyTitle", "helperText", "hint", "label", "message", "notice", "placeholder", "subtitle", "title"]);
const technicalTerm = /\b(?:api|backend|firebase|firestore|jwt|migrasi|migration|operator|postgres(?:ql)?|roster|rpc|runtime|server|snapshot|supabase|tenant|fingerprint|rekonsiliasi|rls)\b/i;
const messageCall = /^(?:set.*(?:error|notice|message|alert|success)|toERPUserMessage|alert|confirm|prompt|toast)$/i;
const findings = [];

function listTsx(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (/legacy/i.test(entry.name)) return [];
    if (entry.isDirectory()) return listTsx(relative);
    return /\.tsx$/i.test(entry.name) ? [path.join(root, relative)] : [];
  });
}

function isMessageCall(call, sourceFile) {
  const expression = call.expression;
  const name = ts.isIdentifier(expression) ? expression.text
    : ts.isPropertyAccessExpression(expression) ? expression.name.text : "";
  return messageCall.test(name) || /^toast\.(?:success|error|warning|info)$/i.test(expression.getText(sourceFile));
}

function isUserFacingLiteral(node, sourceFile) {
  let current = node;
  while (current && current !== sourceFile) {
    if (ts.isBinaryExpression(current.parent) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(current.parent.operatorToken.kind)) return false;
    if (ts.isJsxAttribute(current)) return uiAttributes.has(current.name.getText(sourceFile));
    if (ts.isJsxExpression(current)) {
      const host = current.parent;
      if (ts.isJsxElement(host) || ts.isJsxFragment(host)) return true;
      if (ts.isJsxAttribute(host)) return uiAttributes.has(host.name.getText(sourceFile));
      return false;
    }
    if (ts.isPropertyAssignment(current.parent)
      && uiDescriptors.has(current.parent.name.getText(sourceFile))) return true;
    if (ts.isCallExpression(current.parent) && isMessageCall(current.parent, sourceFile)) return true;
    current = current.parent;
  }
  return false;
}

for (const filePath of roots.flatMap(listTsx)) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  const addFinding = (node, text) => {
    if (!technicalTerm.test(text)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    findings.push(relativePath + ":" + line + ": " + text.trim().replace(/\s+/g, " "));
  };

  function visit(node) {
    if (ts.isJsxText(node)) addFinding(node, node.getText(sourceFile));
    else if (ts.isStringLiteralLike(node) && isUserFacingLiteral(node, sourceFile)) addFinding(node, node.text);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

assert.deepEqual(findings, [], [
  "Technical implementation terms were found in customer-facing UI copy:",
  ...findings.slice(0, 40),
].join("\n"));

const ppdbSource = fs.readFileSync(path.join(root, "src/pages/SupabasePpdbManager.tsx"), "utf8");
assert.doesNotMatch(ppdbSource, /Tagihan pendaftar dapat diterbitkan setelah layanan Keuangan tersedia/);
assert.match(ppdbSource, /PPDB_FINANCE_BILLS_ENABLED[\s\S]*Tagihan pendaftar dapat diterbitkan pada detail calon santri/);
assert.match(ppdbSource, /PPDB_FINANCE_BILLS_ENABLED[\s\S]*Penerbitan tagihan pendaftar belum tersedia/);
const landingSource = fs.readFileSync(path.join(root, "src/pages/FrontendOverview.tsx"), "utf8");
assert.match(landingSource, /onClick=\{\(\) => showHomeSection\('program'\)\}[^>]*>Program<\/button>/);
assert.match(landingSource, /onClick=\{\(\) => showHomeSection\('donasi'\)\}[^>]*>Donasi<\/button>/);
assert.match(landingSource, /id="program"/);
assert.match(landingSource, /id=\{f\.title === 'Donasi' \? 'donasi' : undefined\}/);
assert.doesNotMatch(landingSource, /Video Profil/);
const lmsSource = fs.readFileSync(path.join(root, "src/pages/SupabaseLMSManager.tsx"), "utf8");
assert.doesNotMatch(lmsSource, /LMS pesantren aktif\\./,
  "The LMS page must not show an internal activation banner to users.");
console.log("Customer-facing UI copy check passed.");

const referenceCatalogSource = fs.readFileSync(path.join(root, "src/components/SupabaseReferenceCatalogManager.tsx"), "utf8");
const hrisSource = fs.readFileSync(path.join(root, "src/pages/SupabaseHrisManager.tsx"), "utf8");
assert.ok(!hrisSource.includes("Direktori pegawai dan kehadiran berhasil diperbarui."));
assert.match(referenceCatalogSource, /onSaved\?: \(\) => void \| Promise<void>/);
assert.match(referenceCatalogSource, /try \{ await onSaved\?\.\(\); \}/);
assert.match(hrisSource, /onSaved=\{async \(\) => \{/);
assert.match(hrisSource, /setRefreshingSnapshot\(true\)[\s\S]*await refresh\(\)[\s\S]*finally \{\s*setRefreshingSnapshot\(false\);/);
assert.match(hrisSource, /disabled=\{refreshingSnapshot\}[\s\S]*Tambah pegawai/);
assert.match(hrisSource, /Jabatan<select required disabled=\{refreshingSnapshot\}/);
assert.match(hrisSource, /disabled=\{saving \|\| refreshingSnapshot \|\|/);
console.log("HRIS job-title refresh check passed.");

assert.match(hrisSource, /SupabaseModuleReferenceSettings domains=\{\["hris_job_title"\]\} label="Pengaturan jabatan pegawai" defaultOpen/);

const enterpriseUnitsSource = fs.readFileSync(path.join(root, "src/pages/SupabaseEnterpriseUnitsManager.tsx"), "utf8");
assert.doesNotMatch(enterpriseUnitsSource, /window\.confirm/);
assert.match(enterpriseUnitsSource, /Konfirmasi pemetaan data/);
assert.match(enterpriseUnitsSource, /Konfirmasi pemetaan pengeluaran/);
assert.match(enterpriseUnitsSource, /Pemetaan ini hanya dapat dilakukan sekali dan tidak dapat dibatalkan/);
assert.match(enterpriseUnitsSource, /catatan buku besar[\s\S]*tidak dapat dipindahkan ke unit lain/);
console.log("Enterprise unit assignment confirmation check passed.");
