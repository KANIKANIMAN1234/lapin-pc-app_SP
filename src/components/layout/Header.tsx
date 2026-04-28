'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  admin: '社長',
  staff: '事務',
  sales: '営業',
};

type AttStatus = 'none' | 'working' | 'break' | 'left';
type AttType = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';

interface AttRow {
  id: string;
  clock_in?: string;
  break_start?: string;
  break_end?: string;
  clock_out?: string;
}

function todayDateStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function calcWorkMinutes(clockIn: string, clockOut: string, breakStart?: string, breakEnd?: string): number {
  const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
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

export default function Header() {
  const { user, notifications, markNotificationRead, clearAll } = useAuthStore();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const [attRow, setAttRow] = useState<AttRow | null>(null);
  const [attStatus, setAttStatus] = useState<AttStatus>('none');
  const [attLoading, setAttLoading] = useState(true);
  const [punching, setPunching] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearAll();
    router.replace('/');
  };

  const fetchToday = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('t_attendance')
      .select('id, clock_in, break_start, break_end, clock_out')
      .eq('user_id', user.id)
      .eq('date', todayDateStr())
      .maybeSingle();
    if (data) {
      setAttRow(data);
      const s: AttStatus = data.clock_out ? 'left'
        : data.break_start && !data.break_end ? 'break'
        : data.clock_in ? 'working' : 'none';
      setAttStatus(s);
    }
    setAttLoading(false);
  }, [user]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const punch = useCallback(async (type: AttType, nextStatus: AttStatus) => {
    if (!user) return;
    setPunching(true);
    try {
      const supabase = createClient();
      const time = formatTime(new Date());
      const updates: Record<string, unknown> = {
        user_id: user.id,
        date: todayDateStr(),
        updated_at: new Date().toISOString(),
        [type]: time,
      };
      if (type === 'clock_in' || type === 'clock_out') {
        const loc = await getLocation();
        if (loc) {
          const url = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
          if (type === 'clock_in') updates['clock_in_location'] = url;
          else updates['clock_out_location'] = url;
        }
      }
      if (type === 'clock_out' && attRow?.clock_in) {
        updates['total_work_minutes'] = calcWorkMinutes(
          attRow.clock_in, time,
          attRow.break_start ?? undefined,
          attRow.break_end ?? undefined
        );
      }
      let result;
      if (!attRow) {
        result = await supabase.from('t_attendance').insert(updates).select().single();
      } else {
        result = await supabase.from('t_attendance').update(updates).eq('id', attRow.id).select().single();
      }
      if (!result.error) {
        setAttRow(result.data);
        setAttStatus(nextStatus);
      }
    } catch (e) {
      console.error('[Header] punch error:', e);
    }
    setPunching(false);
  }, [user, attRow]);

  const statusLabel = attStatus === 'working' ? '勤務中'
    : attStatus === 'break' ? '休憩中'
    : attStatus === 'left' ? '退勤済み' : '';

  const statusColor = attStatus === 'working' ? '#06C755'
    : attStatus === 'break' ? '#f59e0b'
    : attStatus === 'left' ? '#9ca3af' : '';

  return (
    <header className="header-bar">
      <div className="header-bar-left">
        <span className="material-icons header-logo-icon">business</span>
        <div>
          <h1 className="header-brand-title">ラパンリフォーム 業務管理システム</h1>
          <span className="header-brand-sub">Supabase版 v3.0</span>
        </div>
      </div>

      <div className="header-bar-right">
        {/* 出退勤ボタン群 */}
        <div className="header-attendance-group">
          <button
            onClick={() => punch('clock_in', 'working')}
            disabled={attLoading || punching || attStatus !== 'none'}
            className="att-btn att-clockin"
          >
            <span className="material-icons">login</span>出勤
          </button>
          <button
            onClick={() => punch('break_start', 'break')}
            disabled={attLoading || punching || attStatus !== 'working'}
            className="att-btn att-break"
          >
            <span className="material-icons">free_breakfast</span>休憩
          </button>
          <button
            onClick={() => punch('break_end', 'working')}
            disabled={attLoading || punching || attStatus !== 'break'}
            className="att-btn att-return"
          >
            <span className="material-icons">replay</span>戻り
          </button>
          <button
            onClick={() => punch('clock_out', 'left')}
            disabled={attLoading || punching || attStatus === 'none' || attStatus === 'left'}
            className="att-btn att-clockout"
          >
            <span className="material-icons">logout</span>退勤
          </button>
          {statusLabel && (
            <span className="att-status-label" style={{ color: statusColor }}>
              {statusLabel}
              {attRow?.clock_in && (
                <span className="att-time-detail">
                  {' '}{attRow.clock_in.slice(0, 5)}〜{attRow.clock_out?.slice(0, 5) ?? ''}
                </span>
              )}
            </span>
          )}
        </div>

        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="header-icon-btn"
          title="通知"
        >
          <span className="material-icons">notifications</span>
          {unreadCount > 0 && <span className="header-notif-badge">{unreadCount}</span>}
        </button>

        <div className="header-user-menu">
          <span className="header-user-name">{user?.name}</span>
          <span className="header-user-role">
            {user?.role ? ROLE_LABELS[user.role] || user.role : ''}
          </span>
          <button onClick={handleLogout} className="header-icon-btn" title="ログアウト">
            <span className="material-icons">logout</span>
          </button>
        </div>
      </div>

      {showNotifications && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
          <div className="notification-panel open">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold">通知</h3>
              <button onClick={() => setShowNotifications(false)}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="divide-y">
              {notifications.length === 0 && (
                <div className="p-6 text-center text-gray-400 text-sm">通知はありません</div>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex gap-3 cursor-pointer ${!n.read ? 'bg-blue-50' : ''}`}
                  onClick={() => markNotificationRead(n.id)}
                >
                  <span className="material-icons text-gray-400 shrink-0">
                    {n.type === 'line_message' ? 'chat'
                      : n.type === 'project' ? 'folder'
                      : n.type === 'inspection' ? 'event'
                      : n.type === 'followup' ? 'warning'
                      : 'photo'}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-gray-500">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
