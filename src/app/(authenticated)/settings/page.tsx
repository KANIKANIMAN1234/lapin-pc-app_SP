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

interface UserOption { id: string; name: string; }

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

  // 勤怠設定
  const [standardDailyHours, setStandardDailyHours] = useState('7');
  const [overtimeAlertHours, setOvertimeAlertHours] = useState('30');
  const [hrPersonId, setHrPersonId] = useState('');
  const [activeUsers, setActiveUsers] = useState<UserOption[]>([]);

  // 労基法チェック設定
  const [laborLawEnabled, setLaborLawEnabled] = useState('1');
  const [laborOvertimeWarn, setLaborOvertimeWarn] = useState('45');
  const [laborOvertimeAlert, setLaborOvertimeAlert] = useState('80');
  const [laborOvertimeCritical, setLaborOvertimeCritical] = useState('100');
  const [laborTab, setLaborTab] = useState<'settings' | 'guide'>('settings');

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
        .in('key', [
          'gross_profit_alert_threshold',
          'attendance_standard_daily_hours',
          'attendance_overtime_alert_hours',
          'hr_person_id',
          'labor_law_check_enabled',
          'labor_overtime_warn',
          'labor_overtime_alert',
          'labor_overtime_critical',
        ]);
      if (settings) {
        settings.forEach((s) => {
          if (s.key === 'gross_profit_alert_threshold') setBonusAlertRate(s.value);
          if (s.key === 'attendance_standard_daily_hours') setStandardDailyHours(s.value);
          if (s.key === 'attendance_overtime_alert_hours') setOvertimeAlertHours(s.value);
          if (s.key === 'hr_person_id') setHrPersonId(s.value);
          if (s.key === 'labor_law_check_enabled') setLaborLawEnabled(s.value);
          if (s.key === 'labor_overtime_warn') setLaborOvertimeWarn(s.value);
          if (s.key === 'labor_overtime_alert') setLaborOvertimeAlert(s.value);
          if (s.key === 'labor_overtime_critical') setLaborOvertimeCritical(s.value);
        });
      }

      // アクティブユーザー一覧（人事担当者選択用）
      const { data: users } = await supabase
        .from('m_users')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (users) setActiveUsers(users as UserOption[]);

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

  const handleSaveAttendanceSettings = async () => {
    if (user?.role !== 'admin') return;
    const supabase = createClient();
    const rows = [
      { key: 'attendance_standard_daily_hours', value: standardDailyHours },
      { key: 'attendance_overtime_alert_hours', value: overtimeAlertHours },
      { key: 'hr_person_id',                   value: hrPersonId },
    ].filter(r => r.value !== '');
    const { error } = await supabase.from('m_settings').upsert(rows, { onConflict: 'key' });
    if (error) showToast('勤怠設定の保存に失敗しました', 'error');
    else showToast('勤怠設定を保存しました');
  };

  const handleSaveLaborLawSettings = async () => {
    if (user?.role !== 'admin') return;
    const supabase = createClient();
    const rows = [
      { key: 'labor_law_check_enabled',  value: laborLawEnabled },
      { key: 'labor_overtime_warn',      value: laborOvertimeWarn },
      { key: 'labor_overtime_alert',     value: laborOvertimeAlert },
      { key: 'labor_overtime_critical',  value: laborOvertimeCritical },
    ];
    const { error } = await supabase.from('m_settings').upsert(rows, { onConflict: 'key' });
    if (error) showToast('労基法チェック設定の保存に失敗しました', 'error');
    else showToast('労基法チェック設定を保存しました');
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

      {/* 勤怠設定（admin のみ） */}
      {user?.role === 'admin' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
            <span className="material-icons text-green-600">schedule</span>勤怠設定
            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded ml-1">管理者のみ</span>
          </h3>
          <div className="space-y-5">
            {/* 標準労働時間 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日標準労働時間（時間）
              </label>
              <p className="text-xs text-gray-400 mb-2">残業時間の基準となる1日の所定労働時間</p>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="12" step="0.5"
                  className="form-input w-24"
                  value={standardDailyHours}
                  onChange={(e) => setStandardDailyHours(e.target.value)}
                />
                <span className="text-gray-500 text-sm">時間 / 日</span>
              </div>
            </div>

            {/* 月間残業アラート */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                月間残業アラート時間（時間）
              </label>
              <p className="text-xs text-gray-400 mb-2">この時間を超えると本人・管理者・人事担当者にLINEでアラートを送信します</p>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="200"
                  className="form-input w-24"
                  value={overtimeAlertHours}
                  onChange={(e) => setOvertimeAlertHours(e.target.value)}
                />
                <span className="text-gray-500 text-sm">時間 / 月</span>
              </div>
            </div>

            {/* 人事担当者 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                人事担当者
              </label>
              <p className="text-xs text-gray-400 mb-2">残業アラートの通知先となる人事担当者を設定します</p>
              <select
                className="form-input w-64"
                value={hrPersonId}
                onChange={(e) => setHrPersonId(e.target.value)}
              >
                <option value="">（未設定）</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              <button onClick={handleSaveAttendanceSettings} className="btn-primary text-sm">
                <span className="material-icons text-base">save</span>
                勤怠設定を保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 労基法チェック設定（admin のみ） */}
      {user?.role === 'admin' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* カードヘッダー */}
          <div className="px-6 pt-6 pb-0">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="material-icons text-green-600">gavel</span>労基法コンプライアンスチェック
              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded ml-1">管理者のみ</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              打刻時に自動で労働基準法チェックを実施し、問題があれば本人・管理者・人事担当者にLINE通知します。
            </p>

            {/* タブ */}
            <div className="flex border-b border-gray-200">
              {([
                { key: 'settings', label: '設定', icon: 'tune' },
                { key: 'guide',    label: 'チェック項目一覧', icon: 'menu_book' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setLaborTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    laborTab === tab.key
                      ? 'border-green-500 text-green-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="material-icons text-base">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* タブコンテンツ */}
          <div className="p-6">

            {/* ── 設定タブ ── */}
            {laborTab === 'settings' && (
              <div className="space-y-5">
                {/* ON/OFF */}
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700">労基法チェック機能</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio" name="laborEnabled" value="1"
                        checked={laborLawEnabled === '1'}
                        onChange={() => setLaborLawEnabled('1')}
                      />
                      <span className="text-sm text-green-700 font-medium">有効</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio" name="laborEnabled" value="0"
                        checked={laborLawEnabled === '0'}
                        onChange={() => setLaborLawEnabled('0')}
                      />
                      <span className="text-sm text-gray-500">無効</span>
                    </label>
                  </div>
                </div>

                {/* 残業閾値 */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3">月間残業アラート閾値</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100">
                      <label className="block text-xs font-semibold text-yellow-700 mb-1">🟡 注意</label>
                      <p className="text-[10px] text-yellow-600 mb-2">36協定 原則上限</p>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="1" max="200"
                          className="form-input w-16 text-sm py-1"
                          value={laborOvertimeWarn}
                          onChange={(e) => setLaborOvertimeWarn(e.target.value)}
                        />
                        <span className="text-xs text-gray-500">時間/月</span>
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                      <label className="block text-xs font-semibold text-red-600 mb-1">🔴 警告</label>
                      <p className="text-[10px] text-red-500 mb-2">過労死ライン</p>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="1" max="200"
                          className="form-input w-16 text-sm py-1"
                          value={laborOvertimeAlert}
                          onChange={(e) => setLaborOvertimeAlert(e.target.value)}
                        />
                        <span className="text-xs text-gray-500">時間/月</span>
                      </div>
                    </div>
                    <div className="bg-red-100 rounded-xl p-3 border border-red-200">
                      <label className="block text-xs font-semibold text-red-800 mb-1">🚨 緊急</label>
                      <p className="text-[10px] text-red-700 mb-2">絶対上限（法律違反）</p>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="1" max="200"
                          className="form-input w-16 text-sm py-1"
                          value={laborOvertimeCritical}
                          onChange={(e) => setLaborOvertimeCritical(e.target.value)}
                        />
                        <span className="text-xs text-gray-500">時間/月</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button onClick={handleSaveLaborLawSettings} className="btn-primary text-sm">
                    <span className="material-icons text-base">save</span>
                    労基法チェック設定を保存
                  </button>
                </div>
              </div>
            )}

            {/* ── チェック項目一覧タブ ── */}
            {laborTab === 'guide' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 mb-4">
                  2024年最新の労働基準法・36協定上限規制に基づき、以下の7項目を自動チェックします。
                </p>

                {([
                  {
                    num: '①',
                    level: 'critical',
                    badge: '🚨 緊急',
                    badgeClass: 'bg-red-100 text-red-700',
                    borderClass: 'border-red-200',
                    title: '休憩時間不足',
                    law: '労働基準法 第34条',
                    lawClass: 'text-red-600',
                    timing: '退勤時',
                    detail: '労働時間が6時間を超える場合は45分以上、8時間を超える場合は60分以上の休憩が必要です。この基準を下回ると労基法違反となり、30万円以下の罰金が科される可能性があります。',
                    rule: '6h超 → 45分以上  /  8h超 → 60分以上',
                  },
                  {
                    num: '②',
                    level: 'info',
                    badge: '🌙 情報',
                    badgeClass: 'bg-blue-100 text-blue-700',
                    borderClass: 'border-blue-200',
                    title: '深夜退勤（22:00以降）',
                    law: '労働基準法 第37条',
                    lawClass: 'text-blue-600',
                    timing: '退勤時',
                    detail: '22:00〜翌5:00の時間帯に労働させた場合、通常賃金に25%以上の割増賃金を支払う義務があります。退勤時刻が22:00以降の場合に周知通知を送信します。',
                    rule: '深夜帯（22:00〜5:00）の労働に25%以上の割増賃金',
                  },
                  {
                    num: '③',
                    level: 'warning',
                    badge: '⚠️ 警告',
                    badgeClass: 'bg-yellow-100 text-yellow-700',
                    borderClass: 'border-yellow-200',
                    title: '勤務間インターバル不足',
                    law: '労働時間等設定改善法（努力義務）',
                    lawClass: 'text-yellow-700',
                    timing: '出勤時（前日との比較）',
                    detail: '前日の退勤から当日の出勤までのインターバルが11時間未満の場合に通知します。2019年4月から企業の努力義務となっており、従業員の健康確保のため推奨されています。',
                    rule: '退勤〜翌出勤まで11時間以上を推奨',
                  },
                  {
                    num: '④',
                    level: 'warning',
                    badge: '⚠️ 警告',
                    badgeClass: 'bg-yellow-100 text-yellow-700',
                    borderClass: 'border-yellow-200',
                    title: '連続勤務6日以上',
                    law: '労働基準法 第35条',
                    lawClass: 'text-yellow-700',
                    timing: '退勤時（直近7日間確認）',
                    detail: '使用者は労働者に対して毎週少なくとも1回の休日を与えなければなりません（法定休日）。6日以上の連続勤務で警告、7日以上の連続勤務で緊急通知を送信します。',
                    rule: '週1日以上の法定休日確保が義務',
                  },
                  {
                    num: '⑤',
                    level: 'info',
                    badge: '🟡 注意',
                    badgeClass: 'bg-yellow-50 text-yellow-600 border border-yellow-300',
                    borderClass: 'border-yellow-100',
                    title: '月間残業45時間超',
                    law: '36協定（時間外労働の上限規制）',
                    lawClass: 'text-yellow-700',
                    timing: '退勤時（月次集計）',
                    detail: '36協定の原則上限は月45時間・年360時間です。月45時間を超える残業は年6回が限度とされており、これを超えると特別条項の適用が必要になります。',
                    rule: '月45時間・年360時間（原則上限）',
                  },
                  {
                    num: '⑥',
                    level: 'warning',
                    badge: '🔴 警告',
                    badgeClass: 'bg-red-100 text-red-600',
                    borderClass: 'border-red-200',
                    title: '月間残業80時間超（過労死ライン）',
                    law: '36協定 特別条項 / 過労死等防止対策推進法',
                    lawClass: 'text-red-600',
                    timing: '退勤時（月次集計）',
                    detail: '月間残業が80時間を超えると、いわゆる「過労死ライン」に達します。この基準を超えた場合、産業医による面接指導の実施が企業の義務となります（労安衛法66条の8）。',
                    rule: '複数月平均80時間以内（休日労働含む）/ 産業医面接義務',
                  },
                  {
                    num: '⑦',
                    level: 'critical',
                    badge: '🚨 緊急',
                    badgeClass: 'bg-red-200 text-red-800',
                    borderClass: 'border-red-300',
                    title: '月間残業100時間超（絶対上限）',
                    law: '36協定 特別条項（絶対的上限）',
                    lawClass: 'text-red-700 font-bold',
                    timing: '退勤時（月次集計）',
                    detail: '36協定特別条項を締結していても、時間外労働と休日労働の合計は月100時間未満でなければなりません。これを超えると労働基準法違反となり、6ヶ月以下の懲役または30万円以下の罰金が科されます。',
                    rule: '月100時間未満（絶対上限）/ 違反で懲役または罰金',
                  },
                ] as const).map((item) => (
                  <div key={item.num} className={`border rounded-xl p-4 ${item.borderClass}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-lg font-bold text-gray-400 shrink-0 w-6 pt-0.5">{item.num}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.badgeClass}`}>
                            {item.badge}
                          </span>
                          <span className="font-semibold text-gray-800 text-sm">{item.title}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 mb-2 text-xs">
                          <span className={`flex items-center gap-1 ${item.lawClass}`}>
                            <span className="material-icons" style={{ fontSize: 12 }}>gavel</span>
                            {item.law}
                          </span>
                          <span className="flex items-center gap-1 text-gray-500">
                            <span className="material-icons" style={{ fontSize: 12 }}>schedule</span>
                            チェックタイミング：{item.timing}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed mb-2">{item.detail}</p>
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono text-gray-700">
                          {item.rule}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
                  <p className="font-semibold mb-1 flex items-center gap-1">
                    <span className="material-icons" style={{ fontSize: 14 }}>info</span>
                    通知について
                  </p>
                  <ul className="space-y-1 text-blue-600">
                    <li>• 各チェックは同一期間で1回のみ通知されます（重複通知防止）</li>
                    <li>• 通知先：本人 / 管理者全員 / 人事担当者（勤怠設定で指定）</li>
                    <li>• 残業時間の基準は「日標準労働時間（勤怠設定）」を超えた分で計算</li>
                  </ul>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* システム設定（admin のみ）- 接続情報等 */}
      {user?.role === 'admin' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
            <span className="material-icons text-green-600">settings</span>その他システム設定
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
                  type="number" min="0" max="100"
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
