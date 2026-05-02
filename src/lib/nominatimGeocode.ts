const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'LapinReformPC/1.0 (https://github.com/KANIKANIMAN1234/lapin-pc-app_SP)';

/** 都道府県名まで（先頭一致用）。`.+?` を前置しない（北海道が先頭の住所と矛盾しない） */
const PREF_PATTERN = '(?:北海道|[^、，]+?[都道府県])';

const FW_DIGIT = '０１２３４５６７８９';

/**
 * 郵便番号・全角スペース等を整え、ジオコード入力に使う。
 */
export function normalizeAddressInput(raw: string): string {
  let s = raw.trim().replace(/\u3000/g, ' ').replace(/\s+/g, ' ');
  s = s.replace(/^〒\s*/, '');
  // 半角・全角・長音記号風ハイフン・7桁連続
  s = s.replace(
    new RegExp(`^[${FW_DIGIT}]{3}[\\-－−﹣]?[${FW_DIGIT}]{4}\\s+`),
    ''
  );
  s = s.replace(
    new RegExp(`^[${FW_DIGIT}]{7}\\s+`),
    ''
  );
  s = s.replace(/^\d{3}[-－−﹣]?\d{4}\s+/, '');
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

/**
 * 最初の数字（番地・号など）の直前まで。丁目レベルまで含めて Nominatim に渡す。
 */
export function trimBeforeFirstStreetNumber(address: string): string | null {
  const c = normalizeAddressInput(address).replace(/\s+/g, '');
  if (c.length < 5) return null;
  const digitClass = `[0-9${FW_DIGIT}]`;
  const idx = c.search(new RegExp(digitClass));
  if (idx < 4) return null;
  const head = c.slice(0, idx);
  return head.length >= 4 ? head : null;
}

function pushUnique(list: string[], v: string | null | undefined) {
  const t = v?.trim();
  if (!t || list.includes(t)) return;
  list.push(t);
}

type NominatimHit = { lat: number; lon: number; importance: number; type: string; _class: string };

async function nominatimFreeform(query: string): Promise<NominatimHit | null> {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: '1',
    countrycodes: 'jp',
    'accept-language': 'ja',
    addressdetails: '1',
  });
  try {
    const resp = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'User-Agent': UA },
    });
    if (!resp.ok) return null;
    const results = (await resp.json()) as {
      lat?: string;
      lon?: string;
      importance?: string | number;
      type?: string;
      class?: string;
    }[];
    if (!Array.isArray(results) || results.length === 0 || !results[0].lat || !results[0].lon) {
      return null;
    }
    const row = results[0];
    return {
      lat: Number(row.lat),
      lon: Number(row.lon),
      importance: Number(row.importance ?? 0),
      type: row.type ?? '',
      _class: row.class ?? '',
    };
  } catch {
    return null;
  }
}

/** state + city で検索（自由検索でヒットしない／誤ヒットしやすいときの補助） */
async function nominatimStructured(state: string, city: string): Promise<NominatimHit | null> {
  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    countrycodes: 'jp',
    country: 'Japan',
    state,
    city,
    'accept-language': 'ja',
    addressdetails: '1',
  });
  try {
    const resp = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'User-Agent': UA },
    });
    if (!resp.ok) return null;
    const results = (await resp.json()) as {
      lat?: string;
      lon?: string;
      importance?: string | number;
      type?: string;
      class?: string;
    }[];
    if (!Array.isArray(results) || results.length === 0 || !results[0].lat || !results[0].lon) {
      return null;
    }
    const row = results[0];
    return {
      lat: Number(row.lat),
      lon: Number(row.lon),
      importance: Number(row.importance ?? 0),
      type: row.type ?? '',
      _class: row.class ?? '',
    };
  } catch {
    return null;
  }
}

/** 「埼玉県所沢市」→ structured 用 state / city */
function splitStructuredFromMuni(muni: string): { state: string; city: string } | null {
  const c = muni.replace(/\s+/g, '');
  if (c.startsWith('東京都')) {
    const rest = c.slice('東京都'.length);
    if (rest.length < 1) return null;
    return { state: '東京都', city: rest };
  }
  const m = c.match(new RegExp(`^(${PREF_PATTERN})(.+)$`));
  if (!m || m[2].length < 1) return null;
  return { state: m[1], city: m[2] };
}

/**
 * 自由検索の先頭結果が「ありきたりの番地ヒット」っぽく弱いとき、フォールバックを続行する。
 */
function shouldRejectWeakFirstHit(hit: NominatimHit, hasMoreCandidates: boolean): boolean {
  if (!hasMoreCandidates) return false;
  if (hit.importance >= 0.32) return false;
  if (hit._class === 'place' && (hit.type === 'house' || hit.type === 'building')) return true;
  if (hit._class === 'highway') return true;
  return hit.importance < 0.18;
}

const BETWEEN_MS = 1100;

/**
 * Nominatim で座標取得。複数のクエリ候補と structured 検索で再試行する。
 */
export async function geocodeJapaneseAddress(fullAddress: string): Promise<[number, number] | null> {
  const q = normalizeAddressInput(fullAddress);
  if (q.replace(/\s+/g, '').length < 2) return null;

  const compact = q.replace(/\s+/g, '');
  const muni = municipalityLevelQuery(q);
  const pref = prefectureLevelQuery(q);
  const trimNum = trimBeforeFirstStreetNumber(q);

  const tryQueries: string[] = [];
  pushUnique(tryQueries, q);
  if (compact !== q) pushUnique(tryQueries, compact);
  if (trimNum) pushUnique(tryQueries, trimNum);
  if (muni) pushUnique(tryQueries, muni);
  if (pref) pushUnique(tryQueries, pref);
  if (muni) pushUnique(tryQueries, `${muni}, Japan`);
  if (pref) pushUnique(tryQueries, `${pref}, Japan`);

  for (let i = 0; i < tryQueries.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, BETWEEN_MS));
    const hit = await nominatimFreeform(tryQueries[i]);
    if (!hit) continue;
    if (i === 0 && shouldRejectWeakFirstHit(hit, tryQueries.length > 1)) continue;
    return [hit.lat, hit.lon];
  }

  if (muni) {
    await new Promise((r) => setTimeout(r, BETWEEN_MS));
    const parts = splitStructuredFromMuni(muni);
    if (parts) {
      const hit = await nominatimStructured(parts.state, parts.city);
      if (hit) return [hit.lat, hit.lon];
    }
  }

  return null;
}
