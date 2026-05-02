/**
 * 見積PDFから抽出したテキストから作成日・税込合計相当の金額を推定する（ルールベース）。
 * スキャンPDFなどテキスト層がない場合は検出できません。
 */

function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 全角・カンマを除いた整数円 */
function parseYenToken(raw: string): number | null {
  const t = toHalfWidthDigits(raw).replace(/[,，\s]/g, '').replace(/¥|￥/g, '');
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

export type EstimateParseResult = {
  createdDate: string | null;
  /** 円（整数） */
  totalYen: number | null;
};

export function parseEstimateFromPdfText(raw: string): EstimateParseResult {
  const text = toHalfWidthDigits(raw).replace(/\r/g, '\n');

  let createdDate: string | null = null;
  const dateRes = [
    /作成\s*日\s*[:：]?\s*(\d{4})\s*[年./－-]\s*(\d{1,2})\s*[月./－-]\s*(\d{1,2})\s*日?/,
    /作成\s*日\s*[:：]?\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})/,
    /(?:見積|御見積|お見積)\s*[:：]?\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  ];
  for (const re of dateRes) {
    const m = text.match(re);
    if (!m) continue;
    const y = m[1];
    const mo = m[2].padStart(2, '0');
    const d = m[3].padStart(2, '0');
    createdDate = `${y}-${mo}-${d}`;
    break;
  }

  let totalYen: number | null = null;
  const amountRes = [
    /税込(?:み)?\s*合計(?:金額)?\s*[:：]?\s*[¥￥]?\s*([\d,，]+)\s*円?/gi,
    /(?:見積|御見積|お見積)\s*(?:提示)?\s*合計(?:金額)?\s*[:：]?\s*[¥￥]?\s*([\d,，]+)/gi,
    /合計(?:金額)?\s*[:：]?\s*[¥￥]?\s*([\d,，]+)\s*円/gi,
  ];
  for (const re of amountRes) {
    const matches = [...text.matchAll(re)];
    const last = matches[matches.length - 1];
    if (!last?.[1]) continue;
    const n = parseYenToken(last[1]);
    if (n != null) {
      totalYen = n;
      break;
    }
  }

  return { createdDate, totalYen };
}
