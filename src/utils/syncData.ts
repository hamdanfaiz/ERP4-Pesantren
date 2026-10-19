import { Candidate } from '../types';
import { onboardingService } from '../services/onboardingService';

export const syncCandidatesToMasterData = async (
  candidates: Candidate[],
  tenantId: string
): Promise<{ success: number; errors: number; details: any[] }> => {
  if (!tenantId.trim()) throw new Error('Tenant wajib ditentukan sebelum sinkronisasi.');
  return onboardingService.batchOnboardAcceptedCandidates(candidates, tenantId);
};
