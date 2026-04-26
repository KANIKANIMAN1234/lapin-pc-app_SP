import { create } from 'zustand';
import type { AppNotification, User } from '@/types';

/**
 * 認証状態の Zustand Store (Supabase版)
 *
 * - JWTセッションは @supabase/ssr が Cookie で自動管理するため、
 *   このストアはUI表示用のユーザー情報と通知のみを管理する
 * - isAuthenticated はミドルウェアで保護されるため、
 *   クライアント側は user の存在で判定する
 */
interface AuthState {
  user: User | null;
  notifications: AppNotification[];
  isLoading: boolean;

  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: AppNotification) => void;
  markNotificationRead: (id: string) => void;
  clearAll: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  notifications: [],
  isLoading: false,

  setUser: (user) => set({ user }),

  setLoading: (isLoading) => set({ isLoading }),

  addNotification: (notification) =>
    set((state) => ({ notifications: [notification, ...state.notifications] })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  clearAll: () => set({ user: null, notifications: [] }),
}));
