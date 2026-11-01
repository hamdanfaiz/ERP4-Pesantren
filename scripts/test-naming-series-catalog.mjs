import assert from "node:assert/strict";
import {
  isCompleteTenantNamingSeriesCatalog,
  TENANT_NAMING_SERIES_KEYS,
} from "../src/lib/namingSeriesCatalog.js";

const complete = TENANT_NAMING_SERIES_KEYS.map((seriesKey) => ({ seriesKey }));

assert.equal(TENANT_NAMING_SERIES_KEYS.length, 15, "katalog berisi seluruh 15 seri operasional");
assert.equal(isCompleteTenantNamingSeriesCatalog(complete), true, "katalog lengkap diterima");
assert.equal(isCompleteTenantNamingSeriesCatalog(complete.slice(0, 6)), false, "respons lama enam seri ditolak");
assert.equal(isCompleteTenantNamingSeriesCatalog(complete.slice(1)), false, "seri yang hilang ditolak");
assert.equal(isCompleteTenantNamingSeriesCatalog([...complete.slice(0, -1), complete[0]]), false, "seri duplikat ditolak");
assert.equal(isCompleteTenantNamingSeriesCatalog([...complete.slice(0, -1), { seriesKey: "unknown" }]), false, "seri asing ditolak");
assert.equal(isCompleteTenantNamingSeriesCatalog(null), false, "respons kosong ditolak");

console.log("Naming Series catalog contract: 6 checks passed.");
