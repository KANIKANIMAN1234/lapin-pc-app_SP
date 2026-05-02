'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/** Google Maps URL `?q=LAT,LNG` から [lat, lng] を抽出 */
function parseLatLng(url: string): [number, number] | null {
  const m = url.match(/[?&]q=([-\d.]+),([-\d.]+)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
}

/** 位置情報URLを内部マップページへのリンクに変換 */
function buildMapPageUrl(locUrl: string, label: string): string {
  const coords = parseLatLng(locUrl);
  if (!coords) return locUrl; // パース失敗時は元URL
  return `/map?pin_lat=${coords[0]}&pin_lng=${coords[1]}&pin_label=${encodeURIComponent(label)}`;
}

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface UserOption {
  id: string;
  name: string;
}

type AttendanceStatus = 'none' | 'working' | 'break' | 'left';
type AttendanceType = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';

interface AttendanceRow {
  id: string;
  user_id: string;
  date: string;
  clock_in?: string;
  break_start?: string;
  break_end?: string;
  clock_out?: string;
  total_work_minutes?: number;
  clock_in_location?: string;
  clock_out_location?: string;
}

interface AttendanceLog {
  time: string;
  type: AttendanceType;
  label: string;
}

const LOG_CONFIG: Record<AttendanceType, { label: string; icon: string; color: string; bg: string }> = {
  clock_in:    { label: '出勤',     icon: 'login',         color: 'text-green-600',  bg: 'bg-green-50'  },
  break_start: { label: '休憩開始', icon: 'free_breakfast', color: 'text-yellow-600', bg: 'bg-yellow-50' },
  break_end:   { label: '休憩終了', icon: 'replay',        color: 'text-blue-600',   bg: 'bg-blue-50'   },
  clock_out:   { label: '退勤',     icon: 'logout',        color: 'text-red-600',    bg: 'bg-red-50'    },
};

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${DAYS[date.getDay()]}）`;
}

function todayDateStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function calcWorkMinutes(
  clockIn: string,
  clockOut: string,
  breakStart?: string,
  breakEnd?: string
): number {
  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  };
  let work = toMin(clockOut) - toMin(clockIn);
  if (breakStart && breakEnd) work -= toMin(breakEnd) - toMin(breakStart);
  return Math.max(0, work);
}

function getLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
    );
  });
}

function buildLocationUrl(loc: { latitude: number; longitude: number } | null): string | null {
  if (!loc) return null;
  return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
}

function deriveStatus(att: AttendanceRow | null): AttendanceStatus {
  if (!att) return 'none';
  if (att.clock_out) return 'left';
  if (att.break_start && !att.break_end) return 'break';
  if (att.clock_in) return 'working';
  return 'none';
}

function deriveLogs(att: AttendanceRow): AttendanceLog[] {
  const logs: AttendanceLog[] = [];
  if (att.clock_in)    logs.push({ time: att.clock_in.slice(0, 5),    type: 'clock_in',    label: '出勤' });
  if (att.break_start) logs.push({ time: att.break_start.slice(0, 5), type: 'break_start', label: '休憩開始' });
  if (att.break_end)   logs.push({ time: att.break_end.slice(0, 5),   type: 'break_end',   label: '休憩終了' });
  if (att.clock_out)   logs.push({ time: att.clock_out.slice(0, 5),   type: 'clock_out',   label: '退勤' });
  return logs.reverse();
}

function fmtMin(min: number | null | undefined): string {
  if (min == null) return '-';
  return `${Math.floor(min / 60)}h${min % 60 > 0 ? `${min % 60}m` : ''}`;
}

export default function AttendancePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.roleLevel === 'admin';

  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // 月間一覧
  const today = new Date();
  const [listYear, setListYear]   = useState(today.getFullYear());
  const [listMonth, setListMonth] = useState(today.getMonth() + 1);
  const [listRows, setListRows]   = useState<AttendanceRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [users, setUsers]       = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const status = deriveStatus(attendance);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchToday = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const today = todayDateStr();
    const { data, error } = await supabase
      .from('t_attendance')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();
    if (error) console.error('[Attendance] fetch error:', error);
    setAttendance(data ?? null);
    setLogs(data ? deriveLogs(data) : []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  // 管理者の場合はユーザー一覧を取得
  useEffect(() => {
    if (!isAdmin) return;
    const supabase = createClient();
    supabase
      .from('m_users')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        if (data) setUsers(data as UserOption[]);
      });
  }, [isAdmin]);

  // selectedUserId の初期値を自分自身に設定
  useEffect(() => {
    if (user?.id && !selectedUserId) setSelectedUserId(String(user.id));
  }, [user?.id, selectedUserId]);

  // 月間勤怠一覧を取得
  const fetchList = useCallback(async () => {
    const targetId = selectedUserId || (user?.id ? String(user.id) : '');
    if (!targetId) return;
    setListLoading(true);
    const supabase = createClient();
    const from = `${listYear}-${String(listMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(listYear, listMonth, 0).getDate();
    const to   = `${listYear}-${String(listMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { data, error } = await supabase
      .from('t_attendance')
      .select('*')
      .eq('user_id', targetId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) console.error('[Attendance] list fetch error:', error);
    setListRows(data ?? []);
    setListLoading(false);
  }, [listYear, listMonth, selectedUserId, user?.id]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const prevMonth = () => {
    if (listMonth === 1) { setListYear((y) => y - 1); setListMonth(12); }
    else setListMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (listMonth === 12) { setListYear((y) => y + 1); setListMonth(1); }
    else setListMonth((m) => m + 1);
  };

  const punch = async (type: AttendanceType) => {
    if (!user) { showToast('ユーザー情報がありません', 'error'); return; }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const today = todayDateStr();
      const time = formatTime(new Date());

      let locationUrl: string | null = null;
      if (type === 'clock_in' || type === 'clock_out') {
        setGettingLocation(true);
        const loc = await getLocation();
        setGettingLocation(false);
        locationUrl = buildLocationUrl(loc);
        if (locationUrl) {
          showToast(`位置情報を取得しました`, 'success');
        } else {
          showToast('位置情報を取得できませんでした（ブラウザの許可を確認してください）', 'error');
        }
      }

      const updates: Record<string, unknown> = {
        user_id: user.id,
        date: today,
        updated_at: new Date().toISOString(),
        [type]: time,
      };
      if (type === 'clock_in' && locationUrl) updates['clock_in_location'] = locationUrl;
      if (type === 'clock_out' && locationUrl) updates['clock_out_location'] = locationUrl;
      if (type === 'clock_out' && attendance?.clock_in) {
        updates['total_work_minutes'] = calcWorkMinutes(
          attendance.clock_in,
          time,
          attendance.break_start ?? undefined,
          attendance.break_end ?? undefined
        );
      }

      let result;
      if (!attendance) {
        result = await supabase.from('t_attendance').insert(updates).select().single();
      } else {
        result = await supabase.from('t_attendance').update(updates).eq('id', attendance.id).select().single();
      }

      if (result.error) throw result.error;

      showToast(`${LOG_CONFIG[type].label}を記録しました（${time}）`, 'success');
      setAttendance(result.data);
      setLogs(deriveLogs(result.data));
      fetchList();

      // 退勤時：月間残業アラートチェック
      if (type === 'clock_out') {
        const now2 = new Date();
        fetch('/api/attendance-overtime-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            year: now2.getFullYear(),
            month: now2.getMonth() + 1,
          }),
        })
          .then((r) => r.json())
          .then((json) => {
            if (json.alerted) {
              showToast(`⚠️ 今月の残業時間が規定を超えました。本人・管理者へLINE通知しました。`, 'error');
            }
          })
          .catch((err) => console.error('[attendance] overtime check error:', err));
      }

      // 全打刻後：労基法コンプライアンスチェック
      const updated = result.data as AttendanceRow;
      fetch('/api/labor-law-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          date: today,
          clock_in:    updated.clock_in,
          clock_out:   updated.clock_out,
          break_start: updated.break_start,
          break_end:   updated.break_end,
          total_work_minutes: updated.total_work_minutes,
        }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.checks > 0) {
            showToast(`⚠️ 労基法チェック：${json.checks}件の確認事項があります。管理者へ通知しました。`, 'error');
          }
        })
        .catch((err) => console.error('[attendance] labor-law check error:', err));
    } catch (e) {
      console.error('[Attendance] punch error:', e);
      showToast('記録に失敗しました', 'error');
    }
    setSubmitting(false);
  };

  const statusText = (() => {
    if (!attendance || status === 'none') return '未打刻';
    if (status === 'left')    return `退勤済み (${attendance.clock_in?.slice(0, 5)}〜${attendance.clock_out?.slice(0, 5)})`;
    if (status === 'break')   return `休憩中 (${attendance.break_start?.slice(0, 5)}〜)`;
    if (status === 'working') return `出勤中 (${attendance.clock_in?.slice(0, 5)}〜)`;
    return '未打刻';
  })();

  const statusStyle = {
    none:    { badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
    working: { badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    break:   { badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    left:    { badge: 'bg-gray-200 text-gray-600', dot: 'bg-gray-500' },
  }[status];

  const BUTTONS: { type: AttendanceType; label: string; icon: string; btnClass: string; disabled: boolean }[] = [
    {
      type: 'clock_in', label: '出勤', icon: 'login',
      btnClass: 'bg-green-500 hover:bg-green-600',
      disabled: submitting || status !== 'none',
    },
    {
      type: 'break_start', label: '休憩', icon: 'free_breakfast',
      btnClass: 'bg-yellow-500 hover:bg-yellow-600',
      disabled: submitting || status !== 'working',
    },
    {
      type: 'break_end', label: '戻り', icon: 'replay',
      btnClass: 'bg-blue-500 hover:bg-blue-600',
      disabled: submitting || status !== 'break',
    },
    {
      type: 'clock_out', label: '退勤', icon: 'logout',
      btnClass: 'bg-red-500 hover:bg-red-600',
      disabled: submitting || (status !== 'working' && status !== 'break'),
    },
  ];

  return (
    <div>
      {/* トースト */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <span className="material-icons text-green-600">schedule</span>
        出退勤
      </h1>

      {/* 2カラムレイアウト */}
      <div className="flex gap-6 items-start flex-wrap lg:flex-nowrap">

      {/* 左：打刻カード＋打刻履歴 */}
      <div className="flex flex-col gap-6 w-full lg:w-80 shrink-0">
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="text-center mb-6">
          <p className="text-gray-500 text-sm mb-1">{formatDate(now)}</p>
          <p
            className="font-extrabold text-gray-900 my-3"
            style={{ fontSize: '3rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px' }}
          >
            {now.toTimeString().slice(0, 8)}
          </p>

          {/* ステータスバッジ */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusStyle.badge}`}>
            <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
            {statusText}
          </span>

          {/* 位置情報取得中インジケーター */}
          {gettingLocation && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-blue-600">
              <span className="inline-block w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              位置情報を取得中...
            </div>
          )}
        </div>

        {/* ボタングリッド */}
        {loading ? (
          <div className="text-center py-4">
            <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {BUTTONS.map(({ type, label, icon, btnClass, disabled }) => (
              <button
                key={type}
                onClick={() => punch(type)}
                disabled={disabled}
                className={`flex flex-col items-center justify-center gap-2 py-5 rounded-2xl text-white font-bold
                  transition-all ${btnClass} disabled:opacity-40 disabled:cursor-not-allowed shadow-sm`}
              >
                <span className="material-icons text-3xl">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* 実労働時間 */}
        {status === 'left' && attendance?.total_work_minutes != null && (
          <div className="mt-4 text-center py-3 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500">本日の実労働時間</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">
              {Math.floor(attendance.total_work_minutes / 60)}時間
              {attendance.total_work_minutes % 60}分
            </p>
          </div>
        )}
      </div>{/* /打刻カード */}

      {/* 打刻履歴 */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="material-icons text-green-600 text-xl">history</span>
            本日の打刻履歴
          </h2>
          <div className="flex flex-col gap-1">
            {logs.map((log, i) => {
              const cfg = LOG_CONFIG[log.type];
              const locUrl =
                log.type === 'clock_in'  ? attendance?.clock_in_location :
                log.type === 'clock_out' ? attendance?.clock_out_location : null;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl ${cfg.bg}`}
                >
                  <span className={`material-icons text-lg ${cfg.color}`}>{cfg.icon}</span>
                  <span className="font-bold text-gray-800">{log.time}</span>
                  <span className={`text-sm font-medium ${cfg.color}`}>{log.label}</span>
                  {(log.type === 'clock_in' || log.type === 'clock_out') && (
                    locUrl ? (
                      <Link
                        href={buildMapPageUrl(locUrl, log.type === 'clock_in' ? '出勤位置' : '退勤位置')}
                        title={log.type === 'clock_in' ? '出勤時の位置を地図で確認' : '退勤時の位置を地図で確認'}
                        className={`ml-auto flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border
                          ${log.type === 'clock_in'
                            ? 'text-green-700 border-green-200 bg-green-50 hover:bg-green-100'
                            : 'text-red-600 border-red-200 bg-red-50 hover:bg-red-100'
                          } transition-colors`}
                      >
                        <span className="material-icons" style={{ fontSize: 13 }}>location_on</span>
                        地図で確認
                      </Link>
                    ) : (
                      <span className="ml-auto flex items-center gap-0.5 text-xs text-gray-300" title="位置情報未取得">
                        <span className="material-icons" style={{ fontSize: 13 }}>location_off</span>
                        <span className="text-[10px]">未取得</span>
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>{/* /左カラム */}

      {/* 右カラム：月間一覧 */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">

      {/* ── 月間勤怠一覧 ── */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        {/* ヘッダー行 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span className="material-icons text-green-600 text-xl">calendar_month</span>
            月間勤怠一覧
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 管理者: ユーザー切替 */}
            {isAdmin && users.length > 0 && (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
            {/* 月送りナビ */}
            <div className="flex items-center gap-1">
              <button onClick={prevMonth}
                className="p-1 rounded hover:bg-gray-100 text-gray-600">
                <span className="material-icons" style={{ fontSize: 20 }}>chevron_left</span>
              </button>
              <span className="text-sm font-semibold text-gray-700 w-24 text-center">
                {listYear}年{listMonth}月
              </span>
              <button onClick={nextMonth}
                className="p-1 rounded hover:bg-gray-100 text-gray-600">
                <span className="material-icons" style={{ fontSize: 20 }}>chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        {listLoading ? (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
          </div>
        ) : listRows.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <span className="material-icons text-4xl mb-2 block" style={{ color: '#d1d5db' }}>event_busy</span>
            <p className="text-sm">この月の勤怠記録がありません</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs">
                    <th className="px-3 py-2.5 text-left font-medium rounded-l-lg">日付</th>
                    <th className="px-3 py-2.5 text-center font-medium">出勤</th>
                    <th className="px-3 py-2.5 text-center font-medium">休憩</th>
                    <th className="px-3 py-2.5 text-center font-medium">退勤</th>
                    <th className="px-3 py-2.5 text-center font-medium">実労働時間</th>
                    <th className="px-3 py-2.5 text-center font-medium rounded-r-lg" style={{ minWidth: 88 }}>位置（出勤/退勤）</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((row) => {
                    const d = new Date(row.date + 'T00:00:00');
                    const dayIdx = d.getDay();
                    const dayColor = dayIdx === 0 ? 'text-red-500' : dayIdx === 6 ? 'text-blue-500' : 'text-gray-700';
                    const isToday = row.date === todayDateStr();
                    return (
                      <tr key={row.id}
                        className={`border-t border-gray-100 hover:bg-gray-50 transition-colors
                          ${isToday ? 'bg-green-50' : ''}`}>
                        <td className="px-3 py-3">
                          <span className={`font-medium text-sm ${dayColor}`}>
                            {row.date.slice(5).replace('-', '/')}
                            <span className="ml-1 text-xs">({DAYS[dayIdx]})</span>
                          </span>
                          {isToday && (
                            <span className="ml-1.5 text-[10px] bg-green-500 text-white rounded-full px-1.5 py-0.5">今日</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-mono text-green-700 font-semibold">
                            {row.clock_in ? row.clock_in.slice(0, 5) : '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-gray-500">
                          {row.break_start
                            ? `${row.break_start.slice(0, 5)}〜${row.break_end ? row.break_end.slice(0, 5) : '?'}`
                            : '-'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-mono text-red-600 font-semibold">
                            {row.clock_out ? row.clock_out.slice(0, 5) : (row.clock_in ? '勤務中' : '-')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${row.total_work_minutes != null ? 'text-gray-800' : 'text-gray-400'}`}>
                            {fmtMin(row.total_work_minutes)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {/* 出勤位置 */}
                            {row.clock_in_location ? (
                              <Link
                                href={buildMapPageUrl(row.clock_in_location, '出勤位置')}
                                title="出勤時の位置を地図で確認"
                                className="flex flex-col items-center gap-0.5 text-green-600 hover:text-green-800 transition-colors"
                              >
                                <span className="material-icons" style={{ fontSize: 18 }}>location_on</span>
                                <span className="text-[9px] font-bold leading-none">出勤</span>
                              </Link>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5 text-gray-300" title="出勤位置未取得">
                                <span className="material-icons" style={{ fontSize: 18 }}>location_off</span>
                                <span className="text-[9px] leading-none">出勤</span>
                              </div>
                            )}
                            {/* 退勤位置 */}
                            {row.clock_out_location ? (
                              <Link
                                href={buildMapPageUrl(row.clock_out_location, '退勤位置')}
                                title="退勤時の位置を地図で確認"
                                className="flex flex-col items-center gap-0.5 text-red-500 hover:text-red-700 transition-colors"
                              >
                                <span className="material-icons" style={{ fontSize: 18 }}>location_on</span>
                                <span className="text-[9px] font-bold leading-none">退勤</span>
                              </Link>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5 text-gray-300" title="退勤位置未取得">
                                <span className="material-icons" style={{ fontSize: 18 }}>location_off</span>
                                <span className="text-[9px] leading-none">退勤</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* 合計行 */}
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 rounded-bl-lg">
                      {listRows.length}日 合計
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-gray-800">
                      {fmtMin(listRows.reduce((s, r) => s + (r.total_work_minutes ?? 0), 0))}
                    </td>
                    <td className="rounded-br-lg" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>{/* /月間勤怠一覧 */}

      </div>{/* /右カラム */}
      </div>{/* /2カラムレイアウト */}
    </div>
  );
}
