export type CbtQuestionTemplate = { id: string; name: string; description: string };
export type CbtPackageQuestion = { templateReferenceId: string; subject: string; grade: string; status: string };

export type CbtPackageSummary = CbtQuestionTemplate & {
  totalQuestions: number;
  activeQuestions: number;
  subjects: string[];
  gradeLevels: string[];
};

export function deriveCbtPackageSummaries(templates: CbtQuestionTemplate[], questions: CbtPackageQuestion[]): CbtPackageSummary[] {
  return templates.map((template) => {
    const relatedQuestions = questions.filter((question) => question.templateReferenceId === template.id);
    return {
      ...template,
      totalQuestions: relatedQuestions.length,
      activeQuestions: relatedQuestions.filter((question) => String(question.status || "").toLowerCase() === "active").length,
      subjects: [...new Set(relatedQuestions.map((question) => question.subject.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "id")),
      gradeLevels: [...new Set(relatedQuestions.map((question) => question.grade.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "id")),
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "id") || left.id.localeCompare(right.id));
}
