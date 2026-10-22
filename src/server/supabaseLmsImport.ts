import { createHmac } from "node:crypto";
import { SupabaseLmsError, applySupabaseLegacyLmsCatalog } from "./supabaseLms";

type Row = Record<string, any>;
export type LegacyLmsCollection = { categories: Array<{ id: string; data: Row }>; courses: Array<{ id: string; data: Row }>; assessments: Array<{ id: string; data: Row }> };

function stableValue(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const result: Row = {};
    for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]);
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}

function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseLmsError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stableValue(value))).digest("hex");
}

function sourceId(kind: string, value: string) { return `${kind.slice(0, 1)}:${fingerprint(`${kind}\u0000${value}`)}`; }
function ref(kind: string, value: string) { return fingerprint(`${kind}\u0000${value}`).slice(0, 12); }
function cleanText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function dateIso(value: any): string | null {
  try {
    const candidate = value instanceof Date ? value : value?.toDate?.() || (typeof value?._seconds === "number" ? new Date(value._seconds * 1000) : value);
    if (!candidate) return null;
    const date = new Date(candidate);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
}
function status(value: unknown, kind: "course" | "assignment" | "category") {
  const normalized = cleanText(value).toLowerCase();
  if (kind === "category") return ["archived", "inactive", "nonaktif", "disabled"].includes(normalized) ? "archived" : "active";
  if (["archived", "inactive", "nonaktif", "disabled"].includes(normalized)) return "archived";
  if (["draft", "draf"].includes(normalized)) return "draft";
  return "published";
}
function color(value: unknown) {
  const normalized = cleanText(value).toLowerCase();
  const match = normalized.match(/(?:bg-)?(indigo|emerald|amber|blue|rose|violet|slate)/);
  return match?.[1] || "indigo";
}

export function previewSupabaseLegacyLms(collections: LegacyLmsCollection, existingRows: Row[], teachers: Row[]) {
  const sources: LegacyLmsCollection = {
    categories: [...(collections.categories || [])].map((row) => ({ id: String(row.id || ""), data: stableValue(row.data || {}) })).sort((a, b) => a.id.localeCompare(b.id)),
    courses: [...(collections.courses || [])].map((row) => ({ id: String(row.id || ""), data: stableValue(row.data || {}) })).sort((a, b) => a.id.localeCompare(b.id)),
    assessments: [...(collections.assessments || [])].map((row) => ({ id: String(row.id || ""), data: stableValue(row.data || {}) })).sort((a, b) => a.id.localeCompare(b.id)),
  };
  const snapshotFingerprint = fingerprint(sources);
  const allCount = sources.categories.length + sources.courses.length + sources.assessments.length;
  const items: Row[] = [];
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" | "warning" }> = [];
  const counts = { source: allCount, categories: 0, courses: 0, modules: 0, materials: 0, assignments: 0, ready: 0, alreadyImported: 0, invalid: 0 };
  if (allCount > 3000) return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "", severity: "blocking" as const }], issueCount: 1, blockingCount: 1, canApply: false, items: [] as Row[] };
  const seen = new Set<string>();
  const existing = new Map<string, string>();
  for (const row of existingRows) existing.set(`${row.kind}:${String(row.source_record_id)}`, String(row.source_fingerprint || ""));
  const occupiedCategoryNames = new Set(existingRows.filter((row) => row.kind === "category" && !row.source_record_id).map((row) => String(row.name || "").toLocaleLowerCase("id-ID")));
  const addIssue = (code: string, recordRef: string) => { issues.push({ code, recordRef, severity: "blocking" }); counts.invalid += 1; };
  const addItem = (kind: string, originalKey: string, data: Row, mapped: Row) => {
    const sourceRecordId = sourceId(kind, originalKey);
    const sourceFingerprint = fingerprint(data);
    const key = `${kind}:${sourceRecordId}`;
    if (!originalKey || seen.has(key)) { addIssue(originalKey ? "duplicate_source_record" : "invalid_source_record", ref(kind, originalKey)); return; }
    seen.add(key);
    const prior = existing.get(key);
    if (prior) {
      if (prior !== sourceFingerprint) addIssue("source_changed_after_import", ref(kind, originalKey));
      else counts.alreadyImported += 1;
      return;
    }
    items.push({ kind, sourceRecordId, sourceFingerprint, ...mapped });
    counts[kind === "category" ? "categories" : kind === "course" ? "courses" : kind === "module" ? "modules" : kind === "material" ? "materials" : "assignments"] += 1;
  };

  const categoryByName = new Map<string, { id: string; name: string }>();
  const duplicateCategoryNames = new Set<string>();
  for (const category of sources.categories) {
    const data = category.data;
    const name = cleanText(data.name || data.title || data.category);
    const normalized = name.toLocaleLowerCase("id-ID");
    if (!name || name.length > 100 || cleanText(data.description).length > 1000) { addIssue("invalid_category_record", ref("category", category.id)); continue; }
    if (occupiedCategoryNames.has(normalized)) { addIssue("category_name_conflict", ref("category", category.id)); continue; }
    if (categoryByName.has(normalized)) { duplicateCategoryNames.add(normalized); addIssue("duplicate_category_name", ref("category", category.id)); continue; }
    categoryByName.set(normalized, { id: sourceId("category", category.id), name });
    addItem("category", category.id, data, { name, description: cleanText(data.description), status: status(data.status, "category") });
  }

  const teacherByName = new Map<string, Row[]>();
  for (const teacher of teachers) {
    const name = cleanText(teacher.display_name).replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
    if (name) teacherByName.set(name, [...(teacherByName.get(name) || []), teacher]);
  }
  const courseIds = new Set(sources.courses.map((course) => course.id));
  for (const course of sources.courses) {
    const data = course.data;
    const title = cleanText(data.title || data.name);
    const instructor = cleanText(data.instructor || data.instructorName || data.teacher);
    const teacher = teacherByName.get(instructor.replace(/\s+/g, " ").toLocaleLowerCase("id-ID")) || [];
    const categoryName = cleanText(data.category || data.categoryName) || "Umum";
    const matchedCategory = categoryByName.get(categoryName.toLocaleLowerCase("id-ID"));
    if (!course.id || course.id.length > 300 || !title || title.length > 180 || cleanText(data.description).length > 5000 || cleanText(data.grade).length > 80) { addIssue("invalid_course_record", ref("course", course.id)); continue; }
    if (teacher.length !== 1) { addIssue(teacher.length ? "ambiguous_instructor_mapping" : "unmapped_instructor", ref("course", course.id)); continue; }
    if (duplicateCategoryNames.has(categoryName.toLocaleLowerCase("id-ID"))) { addIssue("ambiguous_course_category", ref("course", course.id)); continue; }
    const courseSourceId = sourceId("course", course.id);
    const rawColor = color(data.color);
    addItem("course", course.id, data, { title, description: cleanText(data.description), grade: cleanText(data.grade), instructorUserId: String(teacher[0].user_id), status: status(data.status, "course"), categoryName, categorySourceRecordId: matchedCategory?.id || null, color: rawColor });
    const modules = Array.isArray(data.modules) ? data.modules : [];
    modules.forEach((module: any, moduleIndex: number) => {
      const moduleData = stableValue(module || {}) as Row;
      const moduleKey = `${course.id}/module/${String(moduleData.id || moduleIndex)}`;
      const moduleSourceId = sourceId("module", moduleKey);
      const moduleTitle = cleanText(moduleData.title || moduleData.name);
      const moduleDescription = cleanText(moduleData.description);
      if (!moduleTitle || moduleTitle.length > 180 || moduleDescription.length > 3000) { addIssue("invalid_course_module", ref("module", moduleKey)); return; }
      addItem("module", moduleKey, moduleData, { parentCourseSourceRecordId: courseSourceId, title: moduleTitle, description: moduleDescription, displayOrder: moduleIndex });
      const materials = Array.isArray(moduleData.materials) ? moduleData.materials : [];
      materials.forEach((material: any, materialIndex: number) => {
        const materialData = stableValue(material || {}) as Row;
        const materialKey = `${moduleKey}/material/${String(materialData.id || materialIndex)}`;
        const typeRaw = cleanText(materialData.type || materialData.materialType).toLowerCase();
        const materialType = ["video", "pdf", "link", "text"].includes(typeRaw) ? typeRaw : "";
        const url = cleanText(materialData.url || materialData.resourceUrl);
        const body = cleanText(materialData.body || materialData.content || materialData.text);
        const materialTitle = cleanText(materialData.title || materialData.name);
        const safeContent = materialType === "text" ? !!body : /^https:\/\//i.test(url);
        if (!materialTitle || materialTitle.length > 180 || !materialType || !safeContent || url.length > 2048 || body.length > 12000) { addIssue("invalid_or_unsafe_course_material", ref("material", materialKey)); return; }
        const duration = Number.isInteger(materialData.durationSeconds) && materialData.durationSeconds >= 0 && materialData.durationSeconds <= 86400 ? materialData.durationSeconds : null;
        addItem("material", materialKey, materialData, { parentModuleSourceRecordId: moduleSourceId, title: materialTitle, materialType, resourceUrl: materialType === "text" ? "" : url, body, durationSeconds: duration, displayOrder: materialIndex });
      });
    });
    const overviewUrl = cleanText(data.videoUrl);
    if (overviewUrl) {
      if (!/^https:\/\//i.test(overviewUrl) || overviewUrl.length > 2048) addIssue("invalid_or_unsafe_course_overview_video", ref("course", `${course.id}/overview`));
      else {
        const overviewModuleKey = `${course.id}/overview-module`;
        addItem("module", overviewModuleKey, { title: `${title} — pengantar` }, { parentCourseSourceRecordId: courseSourceId, title: "Pengantar", description: "", displayOrder: modules.length });
        addItem("material", `${course.id}/overview`, { title: `${title} — pengantar`, type: "video", url: overviewUrl }, { parentModuleSourceRecordId: sourceId("module", overviewModuleKey), title: `${title} — pengantar`, materialType: "video", resourceUrl: overviewUrl, body: "", durationSeconds: null, displayOrder: 0 });
      }
    }
  }

  const assessmentSeen = new Set<string>();
  for (const assessment of sources.assessments) {
    if (!assessment.id || assessmentSeen.has(assessment.id)) { addIssue("duplicate_or_invalid_assessment", ref("assignment", assessment.id)); continue; }
    assessmentSeen.add(assessment.id);
    const data = assessment.data;
    const courseId = cleanText(data.courseId);
    const title = cleanText(data.title || data.name);
    const dueAt = data.dueDate ? dateIso(data.dueDate) : null;
    if (!courseIds.has(courseId) || !title || title.length > 180 || cleanText(data.instructions).length > 12000 || (data.dueDate && !dueAt)) { addIssue("invalid_or_unmapped_legacy_assessment", ref("assignment", assessment.id)); continue; }
    const maxScore = data.maxScore == null || data.maxScore === "" ? 100 : Number(data.maxScore);
    if (maxScore < 0 || maxScore > 1000) { addIssue("invalid_assessment_max_score", ref("assignment", assessment.id)); continue; }
    addItem("assignment", assessment.id, data, { parentCourseSourceRecordId: sourceId("course", courseId), title, instructions: cleanText(data.instructions), dueAt, allowLate: data.allowLate === true, maxScore, status: status(data.status, "assignment") });
  }

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  counts.ready = items.length;
  return { snapshotFingerprint, counts, issues: issues.slice(0, 100), issueCount: issues.length, blockingCount, canApply: blockingCount === 0 && items.length > 0, items };
}

export async function applySupabaseLegacyLmsImport(tenantId: string, actorId: string, collections: LegacyLmsCollection, existingRows: Row[], teachers: Row[], expectedFingerprint: string) {
  const checked = previewSupabaseLegacyLms(collections, existingRows, teachers);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || checked.snapshotFingerprint !== expectedFingerprint) throw new SupabaseLmsError(409, "Snapshot LMS berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  if (!checked.canApply) throw new SupabaseLmsError(409, "Pratinjau impor LMS memiliki konflik atau data tidak valid.");
  const result = await applySupabaseLegacyLmsCatalog(tenantId, actorId, checked.snapshotFingerprint, checked.items);
  return { snapshotFingerprint: checked.snapshotFingerprint, counts: checked.counts, imported: Number(result?.imported || 0), skipped: Number(result?.skipped || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}
