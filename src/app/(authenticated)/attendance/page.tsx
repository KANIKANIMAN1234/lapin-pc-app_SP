'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

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
      { timeout: 5000 }
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

export default function AttendancePage() {
  const { user } = useAuthStore();
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

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

  const punch = async (type: AttendanceType) => {
    if (!user) { showToast('ユーザー情報がありません', 'error'); return; }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const today = todayDateStr();
      const time = formatTime(new Date());

      let locationUrl: string | null = null;
      if (type === 'clock_in' || type === 'clock_out') {
        const loc = await getLocation();
        locationUrl = buildLocationUrl(loc);
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

      showToast(`${LOG_CONFIG[type].label}を記録しました (${time})`, 'success');
      setAttendance(result.data);
      setLogs(deriveLogs(result.data));
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
    <div className="max-w-2xl mx-auto">
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

      {/* 打刻カード */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
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
      </div>

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
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl ${cfg.bg}`}
                >
                  <span className={`material-icons text-lg ${cfg.color}`}>{cfg.icon}</span>
                  <span className="font-bold text-gray-800">{log.time}</span>
                  <span className={`text-sm font-medium ${cfg.color}`}>{log.label}</span>
                </div>
              );
            })}
          </div>

          {/* 位置情報リンク */}
          {(attendance?.clock_in_location || attendance?.clock_out_location) && (
            <div className="mt-4 flex gap-3 text-sm">
              {attendance.clock_in_location && (
                <a href={attendance.clock_in_location} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-green-600 hover:underline">
                  <span className="material-icons text-sm">location_on</span>出勤時の位置
                </a>
              )}
              {attendance.clock_out_location && (
                <a href={attendance.clock_out_location} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-red-600 hover:underline">
                  <span className="material-icons text-sm">location_on</span>退勤時の位置
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
