export type CbtQuestionTemplate = { id: string; name: string; description: string };
export type CbtPackageQuestion = { templateReferenceId: string; subject: string; grade: string; status: string };

export type CbtPackageSummary = CbtQuestionTemplate & {
  totalQuestions: number;
  activeQuestions: number;
  subjects: string[];
  gradeLevels: string[];
};

export function deriveCbtPackageSummaries(templates: CbtQuestionTemplate[], questions: CbtPackageQuestion[]): CbtPackageSummary[] {
  const grouped = new Map(templates.map((template) => [template.id, {
    totalQuestions: 0,
    activeQuestions: 0,
    subjects: new Set<string>(),
    gradeLevels: new Set<string>(),
  }]));

  for (const question of questions) {
    const summary = grouped.get(question.templateReferenceId);
    if (!summary) continue;
    summary.totalQuestions += 1;
    if (String(question.status || "").toLowerCase() === "active") summary.activeQuestions += 1;
    const subject = typeof question.subject === "string" ? question.subject.trim() : "";
    const grade = typeof question.grade === "string" ? question.grade.trim() : "";
    if (subject) summary.subjects.add(subject);
    if (grade) summary.gradeLevels.add(grade);
  }

  return templates.map((template) => {
    const summary = grouped.get(template.id)!;
    return {
      ...template,
      totalQuestions: summary.totalQuestions,
      activeQuestions: summary.activeQuestions,
      subjects: [...summary.subjects].sort((left, right) => left.localeCompare(right, "id")),
      gradeLevels: [...summary.gradeLevels].sort((left, right) => left.localeCompare(right, "id")),
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "id") || left.id.localeCompare(right.id));
}
