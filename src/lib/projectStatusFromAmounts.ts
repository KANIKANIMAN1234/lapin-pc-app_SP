import type { ProjectStatus } from '@/types';

function parseAmountYen(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * 見積金額・契約金額から自動反映するステータス。
 * 契約金額が正なら契約へ。それ以外で見積金額が正なら見積もりへ。
 * 施工中・完成は自動では下げない。失注は自動で戻さない。
 */
export function statusInferredFromAmounts(
  currentStatus: ProjectStatus,
  estimatedAmount: unknown,
  contractAmount: unknown
): ProjectStatus | undefined {
  if (currentStatus === 'lost') return undefined;

  const c = parseAmountYen(contractAmount);
  const e = parseAmountYen(estimatedAmount);

  if (c > 0) {
    if (currentStatus === 'in_progress' || currentStatus === 'completed') return undefined;
    return 'contract';
  }
  if (e > 0) {
    if (['contract', 'in_progress', 'completed'].includes(currentStatus)) return undefined;
    return 'estimate';
  }
  return undefined;
}
