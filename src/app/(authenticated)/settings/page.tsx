'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${type === 'success' ? 'bg-green-600' : 'bg-red-500'}`}>
      {msg}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' }>({ show: false, msg: '', type: 'success' });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000);
  };

  // 個人設定
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');

  // 通知設定（m_settings から取得）
  const [bonusAlertRate, setBonusAlertRate] = useState('20');

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      // 自分のユーザー情報
      const { data: me } = await supabase
        .from('m_users')
        .select('name, phone, avatar_url')
        .eq('id', user?.id ?? '')
        .single();
      if (me) {
        setName(me.name ?? '');
        setPhone(me.phone ?? '');
        setAvatarUrl(me.avatar_url ?? '');
      }

      // システム設定
      const { data: settings } = await supabase
        .from('m_settings')
        .select('key, value')
        .in('key', ['gross_profit_alert_threshold']);
      if (settings) {
        settings.forEach((s) => {
          if (s.key === 'gross_profit_alert_threshold') setBonusAlertRate(s.value);
        });
      }

      setLoading(false);
    })();
  }, [user?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('m_users')
      .update({ name: name.trim(), phone: phone.trim() || null })
      .eq('id', user?.id ?? '');
    setSubmitting(false);
    if (error) showToast('プロフィールの保存に失敗しました: ' + error.message, 'error');
    else showToast('プロフィールを保存しました');
  };

  const handleSaveSystemSettings = async () => {
    if (user?.role !== 'admin') return;
    const supabase = createClient();
    const { error } = await supabase.from('m_settings')
      .upsert({ key: 'gross_profit_alert_threshold', value: bonusAlertRate }, { onConflict: 'key' });
    if (error) showToast('設定の保存に失敗しました', 'error');
    else showToast('システム設定を保存しました');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">設定</h2>

      {/* プロフィール設定 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
          <span className="material-icons text-green-600">person</span>プロフィール設定
        </h3>

        {/* アバター */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-icons text-gray-400 text-3xl">person</span>
              </div>
            )}
          </div>
          <div>
            <p className="font-medium">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.role === 'admin' ? '管理者' : user?.role === 'staff' ? '事務' : '営業'}</p>
            <p className="text-xs text-gray-400 mt-1">プロフィール画像はLINEアカウントから自動取得されます</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              氏名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="form-input w-full"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">携帯番号</label>
            <input
              type="tel"
              className="form-input w-full"
              placeholder="090-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="pt-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              <span className="material-icons text-base">save</span>
              {submitting ? '保存中...' : 'プロフィールを保存'}
            </button>
          </div>
        </form>
      </div>

      {/* アカウント情報 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-icons text-green-600">account_circle</span>アカウント情報
        </h3>
        <div className="space-y-3 text-sm">
          {[
            { label: 'ユーザーID', value: user?.id ?? '—' },
            { label: 'メールアドレス', value: user?.email ?? '—' },
            { label: 'ロール', value: user?.role === 'admin' ? '管理者' : user?.role === 'staff' ? '事務' : '営業' },
            { label: 'LINE認証', value: '連携済み ✓' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="text-gray-500 shrink-0 w-32">{label}</span>
              <span className="text-gray-800 break-all">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* システム設定（admin のみ） */}
      {user?.role === 'admin' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
            <span className="material-icons text-green-600">settings</span>システム設定
            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded ml-1">管理者のみ</span>
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                粗利率アラート閾値（%）
              </label>
              <p className="text-xs text-gray-400 mb-2">この粗利率を下回る案件にアラートを表示します</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-input w-32"
                  value={bonusAlertRate}
                  onChange={(e) => setBonusAlertRate(e.target.value)}
                />
                <span className="flex items-center text-gray-500">%</span>
                <button onClick={handleSaveSystemSettings} className="btn-primary text-sm py-2 px-4">
                  <span className="material-icons text-base">save</span>保存
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-2">Supabase 接続情報</p>
              <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex gap-2">
                  <span className="w-28 shrink-0">プロジェクトURL</span>
                  <span className="break-all">{process.env.NEXT_PUBLIC_SUPABASE_URL}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-28 shrink-0">LIFF ID</span>
                  <span>{process.env.NEXT_PUBLIC_LIFF_ID ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast.show && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
