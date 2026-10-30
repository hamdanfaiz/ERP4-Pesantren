import assert from "node:assert/strict";
import {
  libraryAssetSignatureMatches,
  validateLibraryDigitalAssetUpload,
} from "../src/server/supabaseLibraryAssets";

const valid = {
  clientRequestId: "a1600000-0000-4000-8000-000000000021",
  title: "Panduan Pesantren",
  description: "Materi pengantar",
  fileName: "panduan.pdf",
  contentType: "application/pdf",
  fileSize: 8,
  contentSha256: "ab".repeat(32),
};

assert.equal(validateLibraryDigitalAssetUpload(valid).extension, "pdf");
assert.throws(() => validateLibraryDigitalAssetUpload({ ...valid, fileName: "../rahasia.pdf" }), /Nama berkas tidak valid/);
assert.throws(() => validateLibraryDigitalAssetUpload({ ...valid, contentType: "text/html" }), /Jenis berkas yang didukung/);
assert.throws(() => validateLibraryDigitalAssetUpload({ ...valid, fileSize: 25 * 1024 * 1024 + 1 }), /Ukuran berkas/);
assert.throws(() => validateLibraryDigitalAssetUpload({ ...valid, contentSha256: "invalid" }), /SHA-256/);
assert.throws(() => validateLibraryDigitalAssetUpload({ ...valid, clientRequestId: "not-a-uuid" }), /ID permintaan upload/);

assert.equal(libraryAssetSignatureMatches("application/pdf", new TextEncoder().encode("%PDF-1.7")), true);
assert.equal(libraryAssetSignatureMatches("application/pdf", new TextEncoder().encode("<html>")), false);
assert.equal(libraryAssetSignatureMatches("application/epub+zip", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), true);
assert.equal(libraryAssetSignatureMatches("audio/mpeg", new TextEncoder().encode("ID3")), true);
assert.equal(libraryAssetSignatureMatches("audio/mpeg", Uint8Array.from([0xff, 0xfb])), true);
assert.equal(libraryAssetSignatureMatches("audio/mp4", new TextEncoder().encode("0000ftypM4A ")), true);
assert.equal(libraryAssetSignatureMatches("audio/mp4", new TextEncoder().encode("not-audio")), false);

console.log("Library private asset validation tests passed.");
