'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';

// ── 型定義 ────────────────────────────────────────────────────
type NoticeCategory = 'general' | 'notice' | 'tip';

interface Notice {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  title: string | null;
  body: string;
  category: NoticeCategory;
  is_pinned: boolean;
  created_at: string;
}

const CATEGORY_LABELS: Record<NoticeCategory, string> = {
  general: '連絡事項',
  notice: 'お知らせ',
  tip: '今日のお気づき',
};

const CATEGORY_COLORS: Record<NoticeCategory, string> = {
  general: 'bg-blue-100 text-blue-700',
  notice: 'bg-amber-100 text-amber-700',
  tip: 'bg-green-100 text-green-700',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}時間前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}日前`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// ── メインコンポーネント ──────────────────────────────────────
export default function NoticesTab() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterCategory, setFilterCategory] = useState<NoticeCategory | 'all'>('all');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    body: '',
    category: 'general' as NoticeCategory,
    is_pinned: false,
  });

  // ── 一覧取得 ─────────────────────────────────────────────────
  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('t_notices')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setNotices((data ?? []) as Notice[]);
    } catch (e) {
      console.error('[NoticesTab] fetchNotices error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  // ── 投稿 ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.body.trim()) { setError('本文を入力してください'); return; }
    setError('');
    setSubmitting(true);

    try {
      const supabase = createClient();
      const displayName = isAdmin ? '社長' : (user?.name ?? '不明');

      const { error: insertError } = await supabase.from('t_notices').insert({
        user_id: user?.id ?? null,
        user_name: displayName,
        user_role: user?.role ?? 'general',
        title: form.title.trim() || null,
        body: form.body.trim(),
        category: form.category,
        is_pinned: isAdmin ? form.is_pinned : false,
      });
      if (insertError) throw insertError;

      // LINE一斉通知
      const catLabel = CATEGORY_LABELS[form.category];
      const lineMsg =
        `📢【${catLabel}】\n投稿者: ${displayName}\n` +
        (form.title.trim() ? `件名: ${form.title.trim()}\n` : '') +
        `---\n${form.body.trim()}`;

      fetch('/api/line-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMsg }),
      }).catch((e) => console.error('[NoticesTab] line-broadcast error:', e));

      setForm({ title: '', body: '', category: 'general', is_pinned: false });
      setShowForm(false);
      await fetchNotices();
    } catch (e) {
      console.error('[NoticesTab] submit error:', e);
      setError('投稿に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // ── ピン留めトグル（adminのみ）────────────────────────────────
  const togglePin = async (notice: Notice) => {
    if (!isAdmin) return;
    try {
      const supabase = createClient();
      await supabase
        .from('t_notices')
        .update({ is_pinned: !notice.is_pinned })
        .eq('id', notice.id);
      await fetchNotices();
    } catch (e) {
      console.error('[NoticesTab] togglePin error:', e);
    }
  };

  // ── 削除（adminのみ）─────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm('この連絡事項を削除しますか？')) return;
    try {
      const supabase = createClient();
      await supabase.from('t_notices').delete().eq('id', id);
      await fetchNotices();
    } catch (e) {
      console.error('[NoticesTab] delete error:', e);
    }
  };

  // ── フィルター済みリスト ──────────────────────────────────────
  const filtered = filterCategory === 'all'
    ? notices
    : notices.filter((n) => n.category === filterCategory);

  // ── レンダリング ──────────────────────────────────────────────
  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="material-icons text-green-600">campaign</span>
          連絡事項
        </h2>
        <button
          className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2"
          onClick={() => setShowForm((v) => !v)}
        >
          <span className="material-icons" style={{ fontSize: 18 }}>
            {showForm ? 'close' : 'edit'}
          </span>
          {showForm ? '閉じる' : '投稿する'}
        </button>
      </div>

      {/* 投稿フォーム */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-4"
        >
          <h3 className="font-semibold text-gray-700 flex items-center gap-1.5">
            <span className="material-icons text-green-600" style={{ fontSize: 18 }}>edit_note</span>
            新規投稿
          </h3>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as NoticeCategory }))}
                className="form-input w-full"
              >
                <option value="general">連絡事項</option>
                <option value="notice">お知らせ</option>
                <option value="tip">今日のお気づき</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">件名（省略可）</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="form-input w-full"
                placeholder="件名を入力"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              本文 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className="form-input w-full"
              rows={4}
              placeholder="連絡内容を入力..."
              required
            />
          </div>

          {isAdmin && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-green-600"
              />
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <span className="material-icons text-amber-500" style={{ fontSize: 16 }}>push_pin</span>
                ピン留めする
              </span>
            </label>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(''); }}
              className="btn-secondary px-4 py-2 text-sm"
            >
              キャンセル
            </button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-2 text-sm">
              {submitting ? (
                <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> 投稿中...</>
              ) : (
                <><span className="material-icons" style={{ fontSize: 16 }}>send</span> 投稿 &amp; LINE通知</>
              )}
            </button>
          </div>
        </form>
      )}

      {/* カテゴリフィルター */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'general', 'notice', 'tip'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              filterCategory === cat
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
            }`}
          >
            {cat === 'all' ? 'すべて' : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="spinner mr-3" style={{ width: 20, height: 20, borderWidth: 2 }} />
          読み込み中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <span className="material-icons text-gray-200" style={{ fontSize: 48 }}>forum</span>
          <p className="text-gray-400 mt-3 text-sm">連絡事項はまだありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((notice) => (
            <div
              key={notice.id}
              className={`bg-white rounded-xl border p-5 transition-shadow hover:shadow-sm ${
                notice.is_pinned ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {notice.is_pinned && (
                    <span className="material-icons text-amber-500" style={{ fontSize: 16 }}>push_pin</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[notice.category as NoticeCategory] ?? CATEGORY_COLORS.general}`}>
                    {CATEGORY_LABELS[notice.category as NoticeCategory] ?? notice.category}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(notice.created_at)}</span>
                  <span className="text-xs font-medium text-gray-600">{notice.user_name}</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => togglePin(notice)}
                      className={`p-1 rounded hover:bg-gray-100 transition-colors ${notice.is_pinned ? 'text-amber-500' : 'text-gray-400'}`}
                      title={notice.is_pinned ? 'ピン解除' : 'ピン留め'}
                    >
                      <span className="material-icons" style={{ fontSize: 16 }}>push_pin</span>
                    </button>
                    <button
                      onClick={() => handleDelete(notice.id)}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="削除"
                    >
                      <span className="material-icons" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                )}
              </div>

              {notice.title && (
                <p className="font-semibold text-gray-800 mt-2">{notice.title}</p>
              )}
              <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap leading-relaxed">
                {notice.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
