'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import type { UserRole } from '@/types';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // セッションからユーザー情報を復元（ページリロード時）
    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (!authUser) {
        router.replace('/');
        return;
      }

      if (!user) {
        // Supabase Auth のカスタムクレームからロール取得
        const role = authUser.user_metadata?.role as UserRole | undefined;
        const name = authUser.user_metadata?.name as string | undefined;

        // users テーブルから詳細を取得
        const { data: userData } = await supabase
          .from('users')
          .select('id, name, role, email, phone, avatar_url, status, line_user_id')
          .eq('id', authUser.id)
          .single();

        if (userData) {
          setUser({
            id: userData.id,
            name: userData.name,
            role: userData.role as UserRole,
            email: userData.email ?? '',
            phone: userData.phone ?? undefined,
            avatar_url: userData.avatar_url ?? undefined,
            line_user_id: userData.line_user_id ?? undefined,
            status: userData.status as 'active' | 'retired',
          });
        } else if (role && name) {
          setUser({
            id: authUser.id,
            name,
            role,
            email: authUser.email ?? '',
            status: 'active',
          });
        }
      }
    });

    // セッション変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        router.replace('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [user, setUser, router]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner mb-4" style={{ margin: '0 auto' }} />
          <p className="text-gray-500 text-sm">認証確認中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
