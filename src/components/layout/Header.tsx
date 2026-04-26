'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  admin: '社長',
  staff: '事務',
  sales: '営業',
};

export default function Header() {
  const { user, notifications, markNotificationRead, clearAll } = useAuthStore();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearAll();
    router.replace('/');
  };

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
