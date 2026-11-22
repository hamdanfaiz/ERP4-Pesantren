const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/check-deployed-asset-graph.mjs <deployment-url>");
  process.exit(2);
}

const deploymentUrl = new URL(target);
const origin = deploymentUrl.origin;
const requestTimeoutMs = 15_000;
const failures = [];
const visited = new Set();
const queue = [];

function describeRequestError(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = typeof cause.code === "string" ? ` ${cause.code}` : "";
    return `${error.name}: ${error.message} (${cause.name}${code}: ${cause.message})`;
  }
  return `${error.name}: ${error.message}`;
}

function addSameOriginAsset(reference, baseUrl, expectedType = null) {
  try {
    const url = new URL(reference, baseUrl);
    const type = expectedType || (/\.css(?:$|\?)/i.test(url.href)
      ? "stylesheet"
      : /\.m?js(?:$|\?)/i.test(url.href) ? "javascript" : null);
    if (!type) return;
    if (url.origin !== origin || visited.has(url.href)) return;
    visited.add(url.href);
    queue.push({ url: url.href, expectedType: type });
  } catch {
    // Ignore malformed and non-URL references; only same-origin build assets are relevant.
  }
}

async function readAsset(url, expectedType) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    failures.push({ url, problem: `request failed: ${describeRequestError(error)}` });
    return;
  }

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  const looksLikeHtml = /(?:text\/html|<!doctype\s+html|<html\b)/i.test(`${contentType}\n${body.slice(0, 300)}`);
  const correctType = expectedType === "javascript"
    ? /(?:javascript|ecmascript)/i.test(contentType)
    : /text\/css/i.test(contentType);

  if (!response.ok || !correctType || looksLikeHtml) {
    failures.push({
      url,
      status: response.status,
      contentType,
      problem: looksLikeHtml ? "received HTML instead of a build asset" : "unexpected status or content type",
    });
    return;
  }

  if (expectedType !== "javascript") return;
  const importPattern = /\bimport\s*(?:\(\s*)?["']([^"']+)["']|\bfrom\s*["']([^"']+)["']/g;
  for (const match of body.matchAll(importPattern)) {
    const reference = match[1] || match[2];
    if (!reference || /^(?:data|blob):/i.test(reference)) continue;
    addSameOriginAsset(reference, url);
  }
}

let pageResponse;
try {
  pageResponse = await fetch(deploymentUrl, {
    headers: { Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
} catch (error) {
  console.error(`Deployment page request failed: ${describeRequestError(error)}`);
  process.exit(1);
}
const html = await pageResponse.text();
if (!pageResponse.ok || !/text\/html/i.test(pageResponse.headers.get("content-type") || "")) {
  console.error(`Deployment page failed: HTTP ${pageResponse.status} (${pageResponse.headers.get("content-type") || "unknown type"})`);
  process.exit(1);
}

for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
  addSameOriginAsset(match[1], deploymentUrl, "javascript");
}
for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
  const tag = match[0];
  const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "";
  const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
  const preloadType = tag.match(/\bas=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  if (!href) continue;
  if (rel.split(/\s+/).includes("stylesheet")) addSameOriginAsset(href, deploymentUrl, "stylesheet");
  else if (rel.split(/\s+/).includes("modulepreload") || (rel.split(/\s+/).includes("preload") && preloadType === "script")) {
    addSameOriginAsset(href, deploymentUrl, "javascript");
  }
}

for (let index = 0; index < queue.length; index += 1) {
  await readAsset(queue[index].url, queue[index].expectedType);
}

const javascriptCount = [...visited].filter((url) => /\.m?js(?:$|\?)/i.test(url)).length;
const stylesheetCount = [...visited].filter((url) => /\.css(?:$|\?)/i.test(url)).length;
if (failures.length) {
  console.error(`Deployed asset graph failed: ${failures.length} of ${visited.size} assets failed (${javascriptCount} JavaScript, ${stylesheetCount} CSS).`);
  for (const failure of failures) console.error(JSON.stringify(failure));
  process.exit(1);
}

console.log(`Deployed asset graph passed: ${visited.size} same-origin assets (${javascriptCount} JavaScript, ${stylesheetCount} CSS).`);
