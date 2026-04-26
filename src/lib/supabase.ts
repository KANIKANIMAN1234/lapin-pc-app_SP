import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * クライアントコンポーネント用 Supabase クライアント
 * 'use client' なコンポーネントで使用する
 * サーバー専用の createServerSupabaseClient は supabase-server.ts を使うこと
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
