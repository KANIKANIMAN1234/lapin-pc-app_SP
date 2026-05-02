import type { RoleLevel } from '@/types';

/** 管理画面・m_settings role_definitions の1行 */
export interface RoleDefinition {
  id: string;
  label: string;
  level: RoleLevel;
}

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  { id: 'admin', label: '管理者', level: 'admin' },
  { id: 'staff', label: '事務', level: 'staff' },
  { id: 'sales', label: '営業', level: 'sales' },
];

export function parseRoleDefinitions(json: string | null | undefined): RoleDefinition[] {
  if (!json?.trim()) return [...DEFAULT_ROLE_DEFINITIONS];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_ROLE_DEFINITIONS];
    const out: RoleDefinition[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id.trim() : '';
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      const level = o.level;
      if (!id || !label) continue;
      if (level !== 'admin' && level !== 'staff' && level !== 'sales') continue;
      out.push({ id, label, level });
    }
    return out.length > 0 ? out : [...DEFAULT_ROLE_DEFINITIONS];
  } catch {
    return [...DEFAULT_ROLE_DEFINITIONS];
  }
}

/** href → 非表示なら false。欠損キーは表示扱い */
export type NavVisibilityMap = Record<string, Record<string, boolean>>;

export function parseNavVisibility(json: string | null | undefined): NavVisibilityMap {
  if (!json?.trim()) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: NavVisibilityMap = {};
    for (const [roleId, pages] of Object.entries(parsed)) {
      if (!pages || typeof pages !== 'object' || Array.isArray(pages)) continue;
      const pageMap: Record<string, boolean> = {};
      for (const [href, v] of Object.entries(pages as Record<string, unknown>)) {
        if (typeof v === 'boolean') pageMap[href] = v;
      }
      out[roleId] = pageMap;
    }
    return out;
  } catch {
    return {};
  }
}

export interface NavItemDef {
  href: string;
  icon: string;
  label: string;
  /** 権限レベルが admin のユーザのみサイドバーに出せる（表示ページで他レベルはグレーアウト） */
  requiresAdminLevel?: boolean;
}

/** Sidebar と「表示ページ」設定の共通定義（href で nav_visibility と対応） */
export const NAV_ITEM_DEFS: NavItemDef[] = [
  { href: '/dashboard', icon: 'dashboard', label: 'ダッシュボード' },
  { href: '/projects', icon: 'folder', label: '案件一覧' },
  { href: '/attendance', icon: 'schedule', label: '出退勤' },
  { href: '/expense', icon: 'receipt_long', label: '経費登録' },
  { href: '/followup', icon: 'follow_the_signs', label: '追客管理' },
  { href: '/inspection', icon: 'event_note', label: '点検スケジュール' },
  { href: '/map', icon: 'map', label: '顧客マップ' },
  { href: '/thankyou', icon: 'mail', label: 'お礼状・DM' },
  { href: '/bonus', icon: 'payments', label: 'ボーナス計算', requiresAdminLevel: true },
  { href: '/settings', icon: 'person', label: '設定' },
  { href: '/admin', icon: 'admin_panel_settings', label: '管理', requiresAdminLevel: true },
];

export function isSidebarItemVisible(
  item: NavItemDef,
  roleId: string | undefined,
  roleLevel: RoleLevel | undefined,
  visibilityMap: NavVisibilityMap
): boolean {
  if (!roleId || !roleLevel) return false;
  if (item.requiresAdminLevel && roleLevel !== 'admin') return false;
  const perRole = visibilityMap[roleId];
  if (perRole && perRole[item.href] === false) return false;
  return true;
}

export function roleDefinitionForId(
  defs: RoleDefinition[],
  roleId: string
): RoleDefinition | undefined {
  return defs.find((d) => d.id === roleId);
}

export function levelForRoleId(defs: RoleDefinition[], roleId: string): RoleLevel {
  return roleDefinitionForId(defs, roleId)?.level ?? 'sales';
}

/** DB の role_level 列が未移行のとき、従来3種の role id から推定 */
export function coerceRoleLevel(role: string, explicit?: string | null): RoleLevel {
  if (explicit === 'admin' || explicit === 'staff' || explicit === 'sales') return explicit;
  if (role === 'admin') return 'admin';
  if (role === 'staff') return 'staff';
  return 'sales';
}
