const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'LapinReformPC/1.0 (https://github.com/KANIKANIMAN1234/lapin-pc-app_SP)';

/** 都道府県名まで（先頭一致用）。`.+?` を前置しない（北海道が先頭の住所と矛盾しない） */
const PREF_PATTERN = '(?:北海道|[^、，]+?[都道府県])';

/**
 * 郵便番号・全角スペース等を整え、ジオコード入力に使う。
 */
export function normalizeAddressInput(raw: string): string {
  let s = raw.trim().replace(/\u3000/g, ' ').replace(/\s+/g, ' ');
  s = s.replace(/^〒\s*/, '');
  s = s.replace(/^\d{3}-\d{4}\s+/, '');
  s = s.replace(/^\d{7}\s+/, '');
  return s.trim();
}

/** 都道府県のみ（最後のフォールバック。県庁所在地付近のヒットになりうる） */
export function prefectureLevelQuery(address: string): string | null {
  const s = normalizeAddressInput(address).replace(/\s+/g, '');
  if (s.length < 2) return null;
  if (s.startsWith('北海道')) return '北海道';
  const m = s.match(/^(.+?[都道府県])/);
  return m ? m[1] : null;
}

/**
 * 詳細（丁目・番号）が不明なとき用: 都道府県＋市、または郡＋町村、東京都は区、政令市は「市＋区」まで含める。
 */
export function municipalityLevelQuery(address: string): string | null {
  const s = normalizeAddressInput(address).replace(/\s+/g, '');
  if (s.length < 2) return null;

  if (s.startsWith('東京都')) {
    const ku = s.match(/^(東京都[^、，]*?区)/);
    if (ku) return ku[1];
  }

  const prefAndCity = s.match(new RegExp(`^(${PREF_PATTERN})(.+?市)`));
  if (prefAndCity) {
    const prefixLen = prefAndCity[1].length + prefAndCity[2].length;
    const afterCity = s.slice(prefixLen);
    const ward = afterCity.match(/^(.+?区)/);
    if (ward) return s.slice(0, prefixLen + ward[1].length);
    return prefAndCity[1] + prefAndCity[2];
  }

  const gun = s.match(new RegExp(`^(${PREF_PATTERN})(.+?郡.+?[町村])`));
  if (gun) return gun[1] + gun[2];

  const townOnly = s.match(new RegExp(`^(${PREF_PATTERN})([^、，市郡]*?[町村])`));
  if (townOnly && !townOnly[2].includes('市')) return townOnly[1] + townOnly[2];

  return null;
}

async function nominatimOnce(query: string): Promise<[number, number] | null> {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: '1',
    countrycodes: 'jp',
  });
  try {
    const resp = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'User-Agent': UA },
    });
    if (!resp.ok) return null;
    const results: { lat?: string; lon?: string }[] = await resp.json();
    if (Array.isArray(results) && results.length > 0 && results[0].lat && results[0].lon) {
      return [Number(results[0].lat), Number(results[0].lon)];
    }
    return null;
  } catch {
    return null;
  }
}

const BETWEEN_MS = 1100;

/**
 * Nominatim で座標取得。フル住所でヒットしなければ市町村レベル → 都道府県の順で再試行する。
 */
export async function geocodeJapaneseAddress(fullAddress: string): Promise<[number, number] | null> {
  const q = normalizeAddressInput(fullAddress);
  if (q.replace(/\s+/g, '').length < 2) return null;

  const tryQueries: string[] = [q];
  const muni = municipalityLevelQuery(q);
  if (muni && muni !== q.replace(/\s+/g, '') && !tryQueries.includes(muni)) {
    tryQueries.push(muni);
  }
  const pref = prefectureLevelQuery(q);
  if (pref && !tryQueries.includes(pref)) tryQueries.push(pref);

  for (let i = 0; i < tryQueries.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, BETWEEN_MS));
    const coords = await nominatimOnce(tryQueries[i]);
    if (coords) return coords;
  }
  return null;
}
