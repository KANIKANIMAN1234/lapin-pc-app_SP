'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { exchangeLineCodeForSupabaseSession, clearLineState } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import type { RoleLevel } from '@/types';
import {
  coerceRoleLevel,
  parseRoleDefinitions,
  roleDefinitionForId,
} from '@/lib/rolesAndNav';

const EDGE_FUNCTION_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
  : '';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('LINE認証がキャンセルされました: ' + (searchParams.get('error_description') || errorParam));
      return;
    }
    if (!code) {
      setError('認証コードが取得できませんでした');
      return;
    }

    // state 検証
    const savedState = sessionStorage.getItem('line_login_state');
    if (savedState && state !== savedState) {
      setError('認証状態が一致しません。再度ログインしてください。');
      return;
    }

    (async () => {
      try {
        // LINE code → Supabase JWT を Edge Function で取得
        const result = await exchangeLineCodeForSupabaseSession(code, EDGE_FUNCTION_URL);
        if (!result.access_token || !result.refresh_token || !result.user) {
          setError('認証に失敗しました: ' + (result.error || '不明なエラー'));
          return;
        }

        // Supabase クライアントにセッションをセット (Cookie も自動更新)
        const supabase = createClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (sessionError) {
          setError('セッション設定に失敗しました: ' + sessionError.message);
          return;
        }

        const { data: row } = await supabase
          .from('m_users')
          .select('name, role, role_level')
          .eq('id', result.user.id)
          .maybeSingle();
        const { data: rd } = await supabase
          .from('m_settings')
          .select('value')
          .eq('key', 'role_definitions')
          .maybeSingle();
        const defs = parseRoleDefinitions(rd?.value ?? null);
        const rrole = row?.role ?? result.user.role;
        const roleLevel = coerceRoleLevel(rrole, (row as { role_level?: string } | null)?.role_level) as RoleLevel;
        const roleLabel = roleDefinitionForId(defs, rrole)?.label ?? rrole;

        setUser({
          id: result.user.id,
          name: row?.name ?? result.user.name,
          role: rrole,
          roleLevel,
          roleLabel,
          email: result.user.email,
          status: 'active',
        });

        clearLineState();
        router.replace('/dashboard');
      } catch (err) {
        setError('ログイン処理中にエラーが発生しました: ' + String(err));
      }
    })();
  }, [searchParams, setUser, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md text-center">
          <span className="material-icons text-5xl text-red-400 mb-4">error_outline</span>
          <h2 className="text-lg font-bold mb-2">ログインエラー</h2>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            ログイン画面に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="spinner mb-4" style={{ margin: '0 auto' }} />
        <p className="text-gray-600">LINE認証処理中...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner mb-4" style={{ margin: '0 auto' }} />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
