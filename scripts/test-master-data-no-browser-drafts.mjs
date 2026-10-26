import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterDataPath = path.join(root, 'src', 'pages', 'MasterDataManager.tsx');
const masterDataSource = fs.readFileSync(masterDataPath, 'utf8');

assert.doesNotMatch(masterDataSource, /\b(?:localStorage|sessionStorage)\b/,
  'Master Data forms can contain student and guardian PII; do not persist them in browser storage.');
assert.doesNotMatch(masterDataSource, /mdm-form-autosave|draftToRestore|Pulihkan Draf/,
  'The retired browser autosave and restore flow must not return to the Supabase Master Data screen.');

const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const retiredLocalImport = serverSource.match(/app\.post\(['"]\/api\/data-migrations\/local-storage['"][\s\S]*?\n  \}\);/);
assert.ok(retiredLocalImport, 'The legacy localStorage migration endpoint must remain explicitly retired.');
assert.match(retiredLocalImport[0], /status\(410\)/,
  'The legacy localStorage migration endpoint must fail closed with HTTP 410.');

console.log('Master Data PII is not persisted in browser storage; legacy localStorage import remains retired.');
