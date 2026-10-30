export type TahfidzAchievementMetrics = {
  totalRecords: number;
  ziyadahRecords: number;
  murojaahRecords: number;
  studyDays: number;
};

type AchievementMetric = keyof TahfidzAchievementMetrics;

export const TAHFIDZ_ACHIEVEMENTS: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  metric: AchievementMetric;
  threshold: number;
}> = [
  { id: "first-record", name: "Setoran pertama", description: "Mencatat setoran Tahfidz pertama.", metric: "totalRecords", threshold: 1 },
  { id: "ten-records", name: "10 catatan", description: "Mencatat 10 kegiatan Tahfidz.", metric: "totalRecords", threshold: 10 },
  { id: "seven-study-days", name: "7 hari belajar", description: "Belajar pada 7 hari kalender yang berbeda; tidak harus berturut-turut.", metric: "studyDays", threshold: 7 },
  { id: "ziyadah-25", name: "25 setoran Ziyadah", description: "Mencatat 25 setoran Ziyadah.", metric: "ziyadahRecords", threshold: 25 },
  { id: "murojaah-25", name: "25 setoran Murojaah", description: "Mencatat 25 setoran Murojaah.", metric: "murojaahRecords", threshold: 25 },
  { id: "hundred-records", name: "100 catatan", description: "Mencatat 100 kegiatan Tahfidz.", metric: "totalRecords", threshold: 100 },
];

export function getTahfidzAchievementProgress(metrics: TahfidzAchievementMetrics) {
  return TAHFIDZ_ACHIEVEMENTS.map((achievement) => {
    const rawValue = Number(metrics?.[achievement.metric]);
    const value = Number.isSafeInteger(rawValue) && rawValue > 0 ? rawValue : 0;
    return {
      ...achievement,
      progress: Math.min(value, achievement.threshold),
      earned: value >= achievement.threshold,
    };
  });
}
