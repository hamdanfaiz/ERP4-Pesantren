import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import express from "express";
import { configureRequestBodyParsing } from "../src/server/httpRequestBody";

async function parseJson(middleware: express.RequestHandler, body: string) {
  const request = Readable.from([body]) as Readable & Record<string, any>;
  request.headers = {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body)),
  };
  request.method = "POST";
  request.url = "/api/public/ppdb/registrations";

  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: new Map<string, string>(),
    getHeader(name: string) { return this.headers.get(name.toLowerCase()); },
    setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); },
    removeHeader(name: string) { this.headers.delete(name.toLowerCase()); },
  });

  return new Promise<any>((resolve, reject) => {
    middleware(request as any, response as any, (error?: any) => {
      if (error) reject(error);
      else resolve(request.body);
    });
  });
}

const app = express();
configureRequestBodyParsing(app);
const parserLayers = (app as any)._router.stack.filter((layer: any) => layer.name === "jsonParser");
assert.equal(parserLayers.length, 2, "PPDB and general JSON parsers are both registered");
assert.ok(parserLayers[0].regexp.test("/api/public/ppdb/registrations"), "the larger parser is scoped to public PPDB");

const base64 = Buffer.alloc(1024 * 1024).toString("base64");
const body = JSON.stringify({
  candidate: { name: "Uji sintetis" },
  files: Object.fromEntries(
    ["kk", "birthCertificate", "reportCards", "ijazah", "skhun", "pasPhoto"]
      .map((key) => [key, { mimeType: "application/pdf", base64 }]),
  ),
});
const parsed = await parseJson(parserLayers[0].handle, body);
assert.equal(Object.keys(parsed.files).length, 6, "PPDB accepts six files at the documented per-file maximum");
await assert.rejects(
  parseJson(parserLayers[1].handle, body),
  (error: any) => error?.status === 413,
  "unrelated endpoints retain the 5 MB body cap",
);
console.log("Public PPDB JSON request limit checks passed.");
