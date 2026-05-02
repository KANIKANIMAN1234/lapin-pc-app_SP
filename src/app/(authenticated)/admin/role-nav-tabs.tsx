'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import {
  DEFAULT_ROLE_DEFINITIONS,
  NAV_ITEM_DEFS,
  parseNavVisibility,
  parseRoleDefinitions,
  type NavVisibilityMap,
  type RoleDefinition,
} from '@/lib/rolesAndNav';
import type { RoleLevel } from '@/types';

type ToastFn = (msg: string, type?: 'success' | 'error') => void;

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

interface EmpRow {
  role: string;
}

export function RolesSettingsTab({
  showToast,
  employees,
  onSaved,
}: {
  showToast: ToastFn;
  employees: EmpRow[];
  onSaved: (defs: RoleDefinition[]) => void;
}) {
  const [defs, setDefs] = useState<RoleDefinition[]>(DEFAULT_ROLE_DEFINITIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RoleDefinition[]>([]);
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newLevel, setNewLevel] = useState<RoleLevel>('sales');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('m_settings').select('value').eq('key', 'role_definitions').maybeSingle();
    setDefs(parseRoleDefinitions(data?.value ?? null));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    setDraft(defs.map((d) => ({ ...d })));
    setEditing(true);
    setNewId('');
    setNewLabel('');
    setNewLevel('sales');
  };

  const countForRole = (id: string) => employees.filter((e) => e.role === id).length;

  const removeDraftRow = (idx: number) => {
    const row = draft[idx];
    if (row.id === 'admin') {
      showToast('管理者（admin）は削除できません', 'error');
      return;
    }
    if (countForRole(row.id) > 0) {
      showToast(`「${row.label}」を割り当てた従業員がいるため削除できません`, 'error');
      return;
    }
    setDraft((d) => d.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    const id = newId.trim().toLowerCase();
    if (!ID_PATTERN.test(id)) {
      showToast('IDは英小文字で始まり、英小文字・数字・アンダースコアのみ', 'error');
      return;
    }
    if (draft.some((d) => d.id === id)) {
      showToast('同じIDがあります', 'error');
      return;
    }
    const label = newLabel.trim();
    if (!label) {
      showToast('表示名を入力してください', 'error');
      return;
    }
    setDraft((d) => [...d, { id, label, level: newLevel }]);
    setNewId('');
    setNewLabel('');
    setNewLevel('sales');
  };

  const save = async () => {
    if (draft.length === 0) {
      showToast('役割が空です', 'error');
      return;
    }
    if (!draft.some((d) => d.id === 'admin')) {
      showToast('管理者（admin）行が必要です', 'error');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('m_settings')
      .upsert(
        {
          key: 'role_definitions',
          value: JSON.stringify(draft),
          description: 'システム役割（管理画面で編集）',
        },
        { onConflict: 'key' }
      );
    setSaving(false);
    if (error) {
      showToast('保存に失敗しました', 'error');
      return;
    }
    setDefs(draft);
    setEditing(false);
    onSaved(draft);
    showToast('役割を保存しました');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner" />
        <p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const rows = editing ? draft : defs;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div>
          <h3 className="font-bold flex items-center gap-1.5">
            <span className="material-icons text-green-600 text-xl">manage_accounts</span>
            役割一覧
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            ID は従業員の m_users.role と一致します。権限レベルは RLS・API のアクセス範囲に対応（管理者=全件、事務=事務ロール、営業=担当ベース）。
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1"
          >
            <span className="material-icons text-sm">edit</span>
            編集
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs border rounded-lg">
              キャンセル
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">ID</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">表示名</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">権限レベル</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">割当人数</th>
              {editing && <th className="w-24" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.id}</td>
                <td className="px-4 py-2">
                  {editing ? (
                    <input
                      className="form-input text-sm py-1 w-full max-w-xs"
                      value={row.label}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => d.map((x, i) => (i === idx ? { ...x, label: v } : x)));
                      }}
                    />
                  ) : (
                    row.label
                  )}
                </td>
                <td className="px-4 py-2">
                  {editing ? (
                    <select
                      className="form-input text-sm py-1"
                      value={row.level}
                      onChange={(e) => {
                        const v = e.target.value as RoleLevel;
                        setDraft((d) => d.map((x, i) => (i === idx ? { ...x, level: v } : x)));
                      }}
                    >
                      <option value="admin">管理者（全権限）</option>
                      <option value="staff">事務</option>
                      <option value="sales">営業</option>
                    </select>
                  ) : (
                    <span className="text-gray-600">
                      {row.level === 'admin' ? '管理者' : row.level === 'staff' ? '事務' : '営業'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{countForRole(row.id)}</td>
                {editing && (
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => removeDraftRow(idx)}
                      className="text-gray-400 hover:text-red-500"
                      title="削除"
                    >
                      <span className="material-icons text-sm">delete</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-3">
          <p className="text-xs font-medium text-gray-600">役割を追加</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-0.5">ID</label>
              <input
                className="form-input text-sm py-1 w-36 font-mono"
                placeholder="例: designer"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-0.5">表示名</label>
              <input
                className="form-input text-sm py-1 w-40"
                placeholder="例: 設計"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-0.5">権限レベル</label>
              <select className="form-input text-sm py-1" value={newLevel} onChange={(e) => setNewLevel(e.target.value as RoleLevel)}>
                <option value="admin">管理者</option>
                <option value="staff">事務</option>
                <option value="sales">営業</option>
              </select>
            </div>
            <button type="button" onClick={addRow} className="btn-primary text-sm py-1.5 px-3">
              追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NavVisibilitySettingsTab({ showToast, roleDefinitions }: { showToast: ToastFn; roleDefinitions: RoleDefinition[] }) {
  const queryClient = useQueryClient();
  const [map, setMap] = useState<NavVisibilityMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('m_settings').select('value').eq('key', 'nav_visibility_by_role').maybeSingle();
    setMap(parseNavVisibility(data?.value ?? null));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isVisible = (roleId: string, href: string) => {
    const per = map[roleId];
    if (!per) return true;
    return per[href] !== false;
  };

  const toggle = (roleId: string, href: string, visible: boolean) => {
    setMap((prev) => {
      const next = { ...prev, [roleId]: { ...prev[roleId] } };
      if (!next[roleId]) next[roleId] = {};
      if (visible) {
        delete next[roleId][href];
        if (Object.keys(next[roleId]).length === 0) delete next[roleId];
      } else {
        next[roleId][href] = false;
      }
      return next;
    });
  };

  const fullMatrixForSave = useMemo(() => {
    const out: NavVisibilityMap = {};
    for (const role of roleDefinitions) {
      out[role.id] = {};
      for (const item of NAV_ITEM_DEFS) {
        if (item.requiresAdminLevel && role.level !== 'admin') {
          out[role.id][item.href] = false;
        } else {
          const vis = map[role.id]?.[item.href] !== false;
          out[role.id][item.href] = vis;
        }
      }
    }
    return out;
  }, [map, roleDefinitions]);

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('m_settings')
      .upsert(
        {
          key: 'nav_visibility_by_role',
          value: JSON.stringify(fullMatrixForSave),
          description: 'サイドバー表示（役割×パス）',
        },
        { onConflict: 'key' }
      );
    setSaving(false);
    if (error) {
      showToast('保存に失敗しました', 'error');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['nav_visibility'] });
    showToast('表示設定を保存しました');
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner" />
        <p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div>
          <h3 className="font-bold flex items-center gap-1.5">
            <span className="material-icons text-green-600 text-xl">visibility</span>
            サイドバー表示
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-3xl">
            役割ごとに左メニューの表示を切り替えられます。ボーナス計算・管理は権限レベルが「管理者」の役割のみ実質利用可能です（営業・事務レベルでは無効）。
          </p>
        </div>
        <button type="button" disabled={saving} onClick={save} className="btn-primary text-sm">
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full text-xs border-collapse min-w-[720px]">
          <thead>
            <tr>
              <th className="text-left p-2 border-b bg-gray-50">ページ</th>
              {roleDefinitions.map((r) => (
                <th key={r.id} className="text-center p-2 border-b bg-gray-50 whitespace-nowrap px-3">
                  {r.label}
                  <span className="block text-[10px] text-gray-400 font-normal font-mono">{r.id}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NAV_ITEM_DEFS.map((item) => (
              <tr key={item.href} className="border-b border-gray-100">
                <td className="p-2 text-gray-800">
                  <span className="material-icons text-base align-middle text-gray-400 mr-1" style={{ fontSize: 16 }}>
                    {item.icon}
                  </span>
                  {item.label}
                  {item.requiresAdminLevel && (
                    <span className="ml-1 text-[10px] text-amber-600">要管理者</span>
                  )}
                </td>
                {roleDefinitions.map((role) => {
                  const disabled = item.requiresAdminLevel && role.level !== 'admin';
                  const checked = disabled ? false : isVisible(role.id, item.href);
                  return (
                    <td key={role.id} className="p-2 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={checked}
                        disabled={disabled}
                        title={disabled ? '権限レベル管理者の役割のみ表示可能' : undefined}
                        onChange={(e) => !disabled && toggle(role.id, item.href, e.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
