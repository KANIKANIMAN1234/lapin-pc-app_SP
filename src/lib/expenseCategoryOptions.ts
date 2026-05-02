/** m_settings key=expense_category_options の JSON 配列。未設定時は経費登録フォーム用の既定 */
export const FALLBACK_EXPENSE_CATEGORY_OPTIONS = [
  '材料費',
  '交通費',
  '外注費',
  '消耗品費',
  '接待交際費',
  'その他',
] as const;

export function parseExpenseCategoryOptions(json: string | null | undefined): string[] {
  if (!json?.trim()) return [...FALLBACK_EXPENSE_CATEGORY_OPTIONS];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [...FALLBACK_EXPENSE_CATEGORY_OPTIONS];
    const strings = parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((s) => s.trim());
    return strings.length > 0 ? strings : [...FALLBACK_EXPENSE_CATEGORY_OPTIONS];
  } catch {
    return [...FALLBACK_EXPENSE_CATEGORY_OPTIONS];
  }
}

/** 現在の選択値が一覧に無いときの直し先（その他があれば優先） */
export function pickDefaultExpenseCategory(options: string[]): string {
  if (options.includes('その他')) return 'その他';
  return options[0] ?? 'その他';
}
