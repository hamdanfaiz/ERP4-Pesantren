import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/pages/SupabaseCBTManager.tsx", import.meta.url), "utf8");
const tenantInitializationStart = component.indexOf(
  "if (tenantId && settingsAppliedTenant.current !== tenantId) {",
);
assert.notEqual(tenantInitializationStart, -1, "CBT refresh initializes state when the tenant changes");

const tenantInitializationEnd = component.indexOf("      } else {", tenantInitializationStart);
assert.notEqual(tenantInitializationEnd, -1, "tenant initialization has a bounded branch");
const tenantInitialization = component.slice(tenantInitializationStart, tenantInitializationEnd);

assert.match(
  tenantInitialization,
  /questionPageRequestId\.current \+= 1;[\s\S]*setQuestionPage\(EMPTY_QUESTION_PAGE\);[\s\S]*setQuestionPageLoading\(false\);[\s\S]*setQuestionListRevision\(\(revision\) => revision \+ 1\);/,
  "tenant bootstrap clears stale loading and triggers a fresh question-page request",
);
assert.match(
  tenantInitialization,
  /builderQuestionPageRequestId\.current \+= 1;[\s\S]*setBuilderQuestionPage\(EMPTY_QUESTION_PAGE\);[\s\S]*setBuilderQuestionPageLoading\(false\);[\s\S]*setBuilderQuestionPageError\(""\);/,
  "tenant bootstrap clears the builder page state after invalidating its request",
);
assert.match(
  component,
  /\}, \[tab, search, questionStatus, questionTemplateFilter, questionListRevision, user\?\.tenantId, user\?\.uid, loadQuestionPage\]\);/,
  "the question page effect reruns when the tenant bootstrap revision changes",
);

console.log("CBT initial question load: tenant bootstrap clears stale requests and reloads the page");
