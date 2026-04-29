'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useProjects, useUpdateProject } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import type { Project, ProjectStatus } from '@/types';

// デフォルトのステータス定義（m_settings 未設定時のフォールバック）
const DEFAULT_STATUS_LIST: { value: ProjectStatus; label: string }[] = [
  { value: 'inquiry',        label: '問い合わせ' },
  { value: 'estimate',       label: '見積もり' },
  { value: 'followup_status', label: '追客中' },
  { value: 'contract',       label: '契約' },
  { value: 'in_progress',    label: '施工中' },
  { value: 'completed',      label: '完成' },
  { value: 'lost',           label: '失注' },
];

const STATUS_CSS: Record<string, string> = {
  inquiry:        'status-inquiry',
  estimate:       'status-estimate',
  followup_status:'status-followup_status',
  contract:       'status-contract',
  in_progress:    'status-in_progress',
  completed:      'status-completed',
  lost:           'status-lost',
};

function formatYen(v: number | undefined) {
  if (v == null) return '-';
  if (v >= 10000) return `${Math.floor(v / 10000).toLocaleString()}万円`;
  return `${v.toLocaleString()}円`;
}

const STATUS_BG: Record<string, string> = {
  inquiry:         '#eab308',
  estimate:        '#f97316',
  followup_status: '#f97316',
  contract:        '#7c3aed',
  in_progress:     '#2563eb',
  completed:       '#059669',
  lost:            '#9ca3af',
};

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isSales = user?.role === 'sales';
  const updateProject = useUpdateProject();
  const [keyword, setKeyword] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<ProjectStatus[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  // 営業担当は初期状態で自分の案件のみ表示
  const [myOnly, setMyOnly] = useState(isSales);
  const [sortKey, setSortKey] = useState<'inquiry_date' | 'contract_amount' | 'status'>('inquiry_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleStatusChange = async (projectId: string, newStatus: ProjectStatus) => {
    setUpdatingId(projectId);
    try {
      await updateProject.mutateAsync({ id: projectId, status: newStatus });
      showToast('ステータスを更新しました');
    } catch {
      showToast('更新に失敗しました', 'error');
    }
    setUpdatingId(null);
  };

  // m_settings からステータス一覧・工事種別一覧を取得
  const [statusList, setStatusList] = useState(DEFAULT_STATUS_LIST);
  const DEFAULT_WORK_TYPE_LIST = ['外壁塗装', '屋根塗装', '防水工事', '内装工事', 'リフォーム', 'その他'];
  const [workTypeList, setWorkTypeList] = useState<string[]>(DEFAULT_WORK_TYPE_LIST);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('m_settings')
      .select('key, value')
      .in('key', ['project_status_options', 'work_type_options'])
      .then(({ data }) => {
        if (!data) return;
        data.forEach((row) => {
          try {
            const parsed: string[] = JSON.parse(row.value);
            if (!Array.isArray(parsed) || parsed.length === 0) return;
            if (row.key === 'project_status_options') {
              const list = parsed.map((item) => {
                const idx = item.indexOf(':');
                if (idx === -1) return { value: item as ProjectStatus, label: item };
                return { value: item.slice(0, idx) as ProjectStatus, label: item.slice(idx + 1) };
              });
              setStatusList(list);
            }
            if (row.key === 'work_type_options') {
              setWorkTypeList(parsed);
            }
          } catch { /* パース失敗時はデフォルト値を維持 */ }
        });
      });
  }, []);

  const { data: projects, isLoading } = useProjects({
    status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    keyword: keyword || undefined,
    assigned_to: myOnly ? user?.id : undefined,
  });

  const toggleStatus = (s: ProjectStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleWorkType = (wt: string) => {
    setSelectedWorkTypes((prev) =>
      prev.includes(wt) ? prev.filter((x) => x !== wt) : [...prev, wt]
    );
  };

  const statusOrder = statusList.map((s) => s.value);
  const statusLabelMap = Object.fromEntries(statusList.map((s) => [s.value, s.label]));

  // 工事種別フィルタ（クライアント側）
  const filtered = selectedWorkTypes.length === 0
    ? (projects ?? [])
    : (projects ?? []).filter((p) =>
        selectedWorkTypes.some((wt) => (p.work_type ?? []).includes(wt))
      );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'inquiry_date') cmp = a.inquiry_date.localeCompare(b.inquiry_date);
    else if (sortKey === 'contract_amount') cmp = (a.contract_amount ?? 0) - (b.contract_amount ?? 0);
    else if (sortKey === 'status') cmp = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <div>
      {/* トースト */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── 1行目: タイトル + キーワード + 新規案件 ────────────────── */}
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xl font-bold whitespace-nowrap">案件一覧</h2>
        <div className="flex-1">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="顧客名・住所・案件番号"
            className="form-input w-full"
          />
        </div>
        <Link href="/projects/new" className="btn-primary whitespace-nowrap">
          <span className="material-icons" style={{ fontSize: 18 }}>add</span>
          新規案件
        </Link>
      </div>

      {/* ── 2行目: フィルタ ─────────────────────────────────────── */}
      <div className="search-panel mb-3">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          {/* ステータス */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-500 font-medium whitespace-nowrap">ステータス</span>
            {statusList.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => toggleStatus(value)}
                className={`px-2 py-0.5 text-xs rounded-full border transition ${
                  selectedStatuses.includes(value)
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 工事種別 */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-500 font-medium whitespace-nowrap">工事種別</span>
            {workTypeList.map((wt) => (
              <button
                key={wt}
                onClick={() => toggleWorkType(wt)}
                className={`px-2 py-0.5 text-xs rounded-full border transition ${
                  selectedWorkTypes.includes(wt)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {wt}
              </button>
            ))}
          </div>

          {/* 管理者のみ「自分の担当のみ」チェックボックス */}
          {isAdmin && (
            <label className="flex items-center gap-1.5 cursor-pointer text-sm whitespace-nowrap ml-auto">
              <input
                type="checkbox"
                checked={myOnly}
                onChange={(e) => setMyOnly(e.target.checked)}
                className="rounded"
                style={{ accentColor: '#06C755' }}
              />
              自分の担当のみ
            </label>
          )}
          {/* 営業担当：バッジ */}
          {isSales && (
            <span className="inline-flex items-center gap-1 ml-auto px-2 py-1 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg font-medium whitespace-nowrap">
              <span className="material-icons" style={{ fontSize: 13 }}>person</span>
              自分の担当のみ表示中
            </span>
          )}
        </div>
      </div>

      {/* 件数 */}
      <div className="text-sm text-gray-500 mb-3">
        {isLoading ? '読み込み中...' : `${sorted.length}件`}
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-16">
            <div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-16 text-center text-gray-400">
            <span className="material-icons text-5xl mb-2">folder_open</span>
            <p>案件が見つかりません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>案件番号</th>
                  <th>顧客名</th>
                  <th>住所</th>
                  <th>工事種別</th>
                  {/* 管理者のみ担当者列を表示 */}
                  {isAdmin && <th>担当者</th>}
                  <th
                    onClick={() => handleSort('status')}
                    className="cursor-pointer select-none"
                  >
                    ステータス {sortKey === 'status' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('contract_amount')}
                    className="cursor-pointer select-none"
                  >
                    契約金額 {sortKey === 'contract_amount' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('inquiry_date')}
                    className="cursor-pointer select-none"
                  >
                    問い合わせ日 {sortKey === 'inquiry_date' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((project: Project) => (
                  <tr key={project.id}>
                    <td className="font-mono text-xs">{project.project_number}</td>
                    <td className="font-medium">{project.customer_name}</td>
                    <td className="text-gray-500 text-xs">
                      {project.lat && project.lng ? (
                        <Link
                          href={`/map?focus=${project.id}`}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline group"
                          title="顧客マップで表示"
                        >
                          <span className="material-icons text-[13px] text-blue-400 group-hover:text-blue-600">location_on</span>
                          {project.address}
                        </Link>
                      ) : (
                        <span className="text-gray-400">{project.address}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {project.work_type.slice(0, 2).map((wt) => (
                          <span key={wt} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
                            {wt}
                          </span>
                        ))}
                        {project.work_type.length > 2 && (
                          <span className="text-[10px] text-gray-400">+{project.work_type.length - 2}</span>
                        )}
                      </div>
                    </td>
                    {/* 管理者のみ担当者名を表示 */}
                    {isAdmin && (
                      <td className="text-sm text-gray-700">
                        {project.assigned_to_name ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="material-icons text-gray-400" style={{ fontSize: 14 }}>person</span>
                            {project.assigned_to_name}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">未設定</span>
                        )}
                      </td>
                    )}
                    <td>
                      {updatingId === project.id ? (
                        <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
                      ) : (
                        <select
                          value={project.status}
                          onChange={(e) => handleStatusChange(project.id, e.target.value as ProjectStatus)}
                          style={{
                            background: STATUS_BG[project.status] ?? '#9ca3af',
                            color: 'white',
                            border: 'none',
                            borderRadius: '9999px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            outline: 'none',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {statusList.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="text-right font-medium">
                      {formatYen(project.contract_amount)}
                    </td>
                    <td className="text-gray-500 text-xs">
                      {project.inquiry_date}
                    </td>
                    <td>
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-xs text-green-600 hover:underline whitespace-nowrap"
                      >
                        詳細 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
