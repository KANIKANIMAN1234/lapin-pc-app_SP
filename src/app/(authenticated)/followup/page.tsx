'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { ProjectStatus } from '@/types';

// API レスポンス型
interface ApiProjectRow {
  id: string;
  project_number: string;
  customer_name: string;
  address: string | null;
  phone: string | null;
  status: string;
  work_type: string[] | null;
  work_description: string | null;
  estimated_amount: number | null;
  inquiry_date: string | null;
  contract_date: string | null;
  notes: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  latest_meeting_date: string | null;
}

// 追客対象ステータス
const FOLLOWUP_STATUSES: ProjectStatus[] = ['inquiry', 'estimate', 'followup_status'];

const STATUS_LABEL: Record<string, string> = {
  inquiry:         '問い合わせ',
  estimate:        '見積もり',
  followup_status: '追客中',
  contract:        '契約',
};
const STATUS_COLOR: Record<string, string> = {
  inquiry:         'bg-yellow-100 text-yellow-800 border-yellow-200',
  estimate:        'bg-orange-100 text-orange-800 border-orange-200',
  followup_status: 'bg-blue-100  text-blue-800  border-blue-200',
};

function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function fmtDate(d?: string | null) { return d ? String(d).substring(0, 10) : '-'; }
function fmtYen(v?: number | null) {
  if (v == null) return '-';
  return v >= 10000 ? `${Math.floor(v / 10000).toLocaleString()}万円` : `${v.toLocaleString()}円`;
}

interface ProjectRow {
  id: string;
  project_number: string;
  customer_name: string;
  address: string | null;
  phone: string | null;
  status: string;
  work_type: string[] | null;
  work_description: string | null;
  estimated_amount: number | null;
  inquiry_date: string | null;
  contract_date: string | null;
  notes: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  latest_meeting_date: string | null;
  days_since_inquiry: number | null;
  days_since_meeting: number | null;
  urgency: 'critical' | 'warning' | 'normal';
}

export default function FollowupPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [editStatusId, setEditStatusId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [notifyLoadingId, setNotifyLoadingId] = useState<string | null>(null);

  // ── データ取得（サービスロールAPIルート経由でRLSバイパス） ────
  const { data: projects = [], isLoading, error: fetchError } = useQuery({
    queryKey: ['followup-projects'],
    queryFn: async (): Promise<ProjectRow[]> => {
      const res = await fetch('/api/followup');
      const json = await res.json() as { projects?: ApiProjectRow[]; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? '追客データの取得に失敗しました');

      return (json.projects ?? []).map((p) => {
        const dsi = daysSince(p.inquiry_date);
        const dsm = daysSince(p.latest_meeting_date);
        const urgency: ProjectRow['urgency'] =
          (dsi !== null && dsi > 30) || (dsm !== null && dsm > 21)
            ? 'critical'
            : (dsi !== null && dsi > 14) || (dsm !== null && dsm > 10)
            ? 'warning'
            : 'normal';
        return {
          ...p,
          days_since_inquiry:  dsi,
          days_since_meeting:  dsm,
          urgency,
        } as ProjectRow;
      });
    },
  });

  // ── ステータス更新（APIルート経由） ─────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch('/api/followup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) throw new Error(json.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditStatusId(null);
    },
  });

  const notifyAssignee = async (item: ProjectRow) => {
    if (!item.assigned_to) {
      setToast({ msg: '担当者が設定されていません', type: 'error' });
      setTimeout(() => setToast(null), 3500);
      return;
    }
    setNotifyLoadingId(item.id);
    try {
      const res = await fetch('/api/followup/notify-assignee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: item.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `送信に失敗しました (${res.status})`);
      }
      setToast({
        msg: `${item.assigned_to_name ?? '担当者'}へLINE通知を送信しました`,
        type: 'success',
      });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast({
        msg: e instanceof Error ? e.message : '送信に失敗しました',
        type: 'error',
      });
      setTimeout(() => setToast(null), 4500);
    } finally {
      setNotifyLoadingId(null);
    }
  };

  // ── フィルタ ────────────────────────────────────────────
  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (urgencyFilter === 'critical' && p.urgency !== 'critical') return false;
      if (urgencyFilter === 'warning' && p.urgency !== 'warning') return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        return (
          p.customer_name?.toLowerCase().includes(kw) ||
          p.project_number?.toLowerCase().includes(kw) ||
          p.address?.toLowerCase().includes(kw) ||
          false
        );
      }
      return true;
    });
  }, [projects, statusFilter, urgencyFilter, keyword]);

  const criticalCount = projects.filter((p) => p.urgency === 'critical').length;
  const warningCount  = projects.filter((p) => p.urgency === 'warning').length;

  // ── ステータス別件数 ──────────────────────────────────
  const statusCount = Object.fromEntries(
    FOLLOWUP_STATUSES.map((s) => [s, projects.filter((p) => p.status === s).length])
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="text-center py-16">
        <span className="material-icons text-5xl mb-2 block text-red-300">error_outline</span>
        <p className="text-red-500 font-medium">データ取得エラー</p>
        <p className="text-sm text-gray-400 mt-1">{String(fetchError)}</p>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-md ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">追客管理</h2>
        <Link href="/projects/new" className="btn-primary text-sm">
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>新規案件
        </Link>
      </div>

      {/* ── サマリカード（1行6列） ── */}
      <div className="grid grid-cols-6 gap-2 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-2.5 px-2 text-center">
          <div className="text-xl font-bold text-gray-800">{projects.length}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 whitespace-nowrap">追客中合計</div>
        </div>
        {FOLLOWUP_STATUSES.map((s) => (
          <div key={s} className="bg-white rounded-xl border border-gray-100 shadow-sm py-2.5 px-2 text-center cursor-pointer hover:shadow-md transition"
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}>
            <div className="text-xl font-bold text-gray-800">{statusCount[s] ?? 0}</div>
            <div className="text-[11px] text-gray-500 mt-0.5 whitespace-nowrap">{STATUS_LABEL[s]}</div>
          </div>
        ))}
        <div className="bg-red-50 rounded-xl border border-red-100 shadow-sm py-2.5 px-2 text-center cursor-pointer hover:shadow-md transition"
          onClick={() => setUrgencyFilter(urgencyFilter === 'critical' ? 'all' : 'critical')}>
          <div className="text-xl font-bold text-red-600">{criticalCount}</div>
          <div className="text-[11px] text-red-500 mt-0.5 whitespace-nowrap">要緊急対応</div>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-100 shadow-sm py-2.5 px-2 text-center cursor-pointer hover:shadow-md transition"
          onClick={() => setUrgencyFilter(urgencyFilter === 'warning' ? 'all' : 'warning')}>
          <div className="text-xl font-bold text-yellow-600">{warningCount}</div>
          <div className="text-[11px] text-yellow-600 mt-0.5 whitespace-nowrap">要注意</div>
        </div>
      </div>

      {/* ── フィルタ行 ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        {/* キーワード */}
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="顧客名・住所・案件番号"
          className="form-input text-sm"
          style={{ width: 220 }}
        />
        {/* ステータス */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">ステータス:</span>
          {([['all', '全て'], ...FOLLOWUP_STATUSES.map((s) => [s, STATUS_LABEL[s]])] as [string, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-2.5 py-0.5 text-xs rounded-full border transition ${statusFilter === v ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        {/* 緊急度 */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-gray-500 font-medium">緊急度:</span>
          {([['all', '全て', ''], ['critical', '緊急', 'text-red-600'], ['warning', '要注意', 'text-yellow-600'], ['normal', '通常', 'text-green-600']] as [string, string, string][]).map(([v, l, tc]) => (
            <button key={v} onClick={() => setUrgencyFilter(v)}
              className={`px-2.5 py-0.5 text-xs rounded-full border transition ${urgencyFilter === v ? 'bg-green-600 text-white border-green-600' : `bg-white border-gray-200 ${tc}`}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── 件数 ── */}
      <div className="text-sm text-gray-500 mb-3">{filtered.length}件表示中</div>

      {/* ── カード一覧 ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="material-icons text-5xl mb-2 block" style={{ color: '#d1d5db' }}>check_circle</span>
          <p className="text-gray-400">該当する追客案件はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const urgencyStyle =
              item.urgency === 'critical' ? 'border-red-200 bg-red-50/40'
              : item.urgency === 'warning' ? 'border-yellow-200 bg-yellow-50/30'
              : 'border-gray-100 bg-white';
            const urgencyBadge =
              item.urgency === 'critical'
                ? <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white">緊急</span>
                : item.urgency === 'warning'
                ? <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-400 text-white">要注意</span>
                : <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700">通常</span>;

            return (
              <div key={item.id} className={`rounded-xl border shadow-sm ${urgencyStyle}`}>
                {/* カードヘッダー */}
                <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-gray-100/60">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {/* ステータスバッジ（クリックで変更可能） */}
                    {editStatusId === item.id ? (
                      <select
                        autoFocus
                        className="form-input text-xs py-0.5"
                        defaultValue={item.status}
                        onBlur={() => setEditStatusId(null)}
                        onChange={(e) => updateStatus.mutate({ id: item.id, status: e.target.value })}
                      >
                        {(['inquiry', 'estimate', 'followup_status', 'contract', 'lost'] as const).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        className={`px-2 py-0.5 text-xs font-bold rounded border cursor-pointer hover:opacity-80 transition ${STATUS_COLOR[item.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                        onClick={() => setEditStatusId(item.id)}
                        title="クリックでステータス変更"
                      >
                        {STATUS_LABEL[item.status] ?? item.status} ▾
                      </button>
                    )}
                    {urgencyBadge}
                    <span className="font-bold text-gray-800 text-sm truncate">{item.customer_name}</span>
                    <span className="text-xs text-gray-400 font-mono">{item.project_number}</span>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      title={
                        item.assigned_to
                          ? '担当者のLINEに追客リマインドを送信'
                          : '担当者が未設定のため送信できません'
                      }
                      disabled={!item.assigned_to || notifyLoadingId === item.id}
                      onClick={() => void notifyAssignee(item)}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                      style={{ backgroundColor: '#06C755', border: '1px solid #05a94a' }}
                    >
                      {notifyLoadingId === item.id ? (
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="material-icons" style={{ fontSize: 14 }}>
                          chat
                        </span>
                      )}
                      担当者へ通知
                    </button>
                    <Link href={`/projects/${item.id}`}
                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 hover:underline font-medium">
                      詳細<span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                    </Link>
                  </div>
                </div>

                {/* カードボディ */}
                <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {/* 左列 */}
                  <div className="space-y-1.5">
                    {item.address && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <span className="material-icons text-gray-400 shrink-0" style={{ fontSize: 13, marginTop: 1 }}>location_on</span>
                        {item.address}
                      </div>
                    )}
                    {item.phone && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="material-icons text-gray-400 shrink-0" style={{ fontSize: 13 }}>phone</span>
                        <a href={`tel:${item.phone}`} className="text-green-600 hover:underline">{item.phone}</a>
                      </div>
                    )}
                    {(item.work_type ?? []).length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="material-icons text-gray-400 shrink-0" style={{ fontSize: 13 }}>construction</span>
                        {(item.work_type ?? []).map((w) => (
                          <span key={w} className="px-1.5 py-0 text-[11px] bg-green-50 text-green-700 rounded font-medium">{w}</span>
                        ))}
                      </div>
                    )}
                    {item.work_description && (
                      <div className="text-xs text-gray-500 pl-4">{item.work_description}</div>
                    )}
                  </div>

                  {/* 右列 */}
                  <div className="space-y-1.5">
                    {item.assigned_to_name && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="material-icons text-gray-400" style={{ fontSize: 13 }}>person</span>
                        担当: <span className="font-medium">{item.assigned_to_name}</span>
                      </div>
                    )}
                    {item.estimated_amount != null && item.estimated_amount > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="material-icons text-gray-400" style={{ fontSize: 13 }}>payments</span>
                        見積: <span className="font-bold text-gray-800">{fmtYen(item.estimated_amount)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="material-icons text-gray-400" style={{ fontSize: 13 }}>event</span>
                      問合わせ日: {fmtDate(item.inquiry_date)}
                      {item.days_since_inquiry !== null && (
                        <span className={`ml-1 font-bold ${item.days_since_inquiry > 30 ? 'text-red-600' : item.days_since_inquiry > 14 ? 'text-yellow-600' : 'text-gray-500'}`}>
                          ({item.days_since_inquiry}日前)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="material-icons text-gray-400" style={{ fontSize: 13 }}>forum</span>
                      最終商談: {item.latest_meeting_date ? fmtDate(item.latest_meeting_date) : '—'}
                      {item.days_since_meeting !== null && (
                        <span className={`ml-1 font-bold ${item.days_since_meeting > 21 ? 'text-red-600' : item.days_since_meeting > 10 ? 'text-yellow-600' : 'text-gray-500'}`}>
                          ({item.days_since_meeting}日前)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* メモ（あれば表示） */}
                {item.notes && (
                  <div className="px-4 pb-3">
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">
                      <span className="material-icons text-gray-300 align-middle mr-1" style={{ fontSize: 12 }}>notes</span>
                      {item.notes}
                    </div>
                  </div>
                )}

                {/* フッター: クイックアクション */}
                <div className="px-4 py-2 border-t border-gray-100/60 flex items-center justify-between gap-2 bg-gray-50/60 rounded-b-xl">
                  <div className="flex items-center gap-2">
                    <Link href={`/projects/${item.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1 transition">
                      <span className="material-icons" style={{ fontSize: 13 }}>forum</span>商談記録
                    </Link>
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 inline-flex items-center gap-1 transition"
                      onClick={() => setEditStatusId(item.id)}
                    >
                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>状態変更
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 inline-flex items-center gap-1 transition"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: item.id, status: 'contract' })}
                    >
                      <span className="material-icons" style={{ fontSize: 13 }}>check_circle</span>契約済みに変更
                    </button>
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 inline-flex items-center gap-1 transition"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: item.id, status: 'lost' })}
                    >
                      <span className="material-icons" style={{ fontSize: 13 }}>cancel</span>失注
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
