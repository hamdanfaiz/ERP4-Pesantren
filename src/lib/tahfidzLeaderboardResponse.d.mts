export function readTahfidzLeaderboardParticipantCount(result: unknown): number | null;
export type TahfidzLeaderboardRankingMode = "lifetime_hafalan" | "monthly_ziyadah";
export type NormalizedTahfidzLeaderboard = {
  rankingMode: TahfidzLeaderboardRankingMode;
  periodStart: string | null;
  businessDate: string;
  students: Array<{
    rank: number;
    id: string;
    name: string;
    grade: string;
    halaqah: string;
    ziyadahRecords: number;
    hafalanAyahs: number | null;
    ziyadahAyahs: number | null;
    ziyadahActiveDays: number;
  }>;
  hasMore: boolean;
  participants: number;
};
export function normalizeTahfidzLeaderboardResult(
  result: unknown,
  pageSize: number,
): NormalizedTahfidzLeaderboard | null;
