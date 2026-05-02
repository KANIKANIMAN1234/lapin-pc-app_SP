/** 管理画面マスタ inspection_eligible_work_types のデフォルト・パース */
export const DEFAULT_INSPECTION_ELIGIBLE_WORK_TYPES = ['外壁塗装', '屋根塗装'] as const;

export function parseInspectionEligibleWorkTypes(json: string | null | undefined): string[] {
  if (!json?.trim()) return [...DEFAULT_INSPECTION_ELIGIBLE_WORK_TYPES];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_INSPECTION_ELIGIBLE_WORK_TYPES];
    const strings = parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((s) => s.trim());
    return strings.length > 0 ? strings : [...DEFAULT_INSPECTION_ELIGIBLE_WORK_TYPES];
  } catch {
    return [...DEFAULT_INSPECTION_ELIGIBLE_WORK_TYPES];
  }
}

/** 案件の工事種別が点検対象に該当するか */
export function projectHasInspectionEligibleWorkType(
  workType: string[] | null | undefined,
  eligible: string[]
): boolean {
  const wt = workType ?? [];
  return eligible.some((e) => wt.includes(e));
}
