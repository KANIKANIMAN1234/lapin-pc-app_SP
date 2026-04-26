import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * クライアントコンポーネント用 Supabase クライアント
 *
 * Database ジェネリクスは意図的に外している。
 * @supabase/supabase-js v2.47+ は自動生成型と異なる手書き型定義を受け付けない
 * ため、型付けはクエリ結果を受け取る側（hooks / pages）でドメイン型にキャストする。
 * 本番運用時は `supabase gen types typescript` で自動生成した型に切り替えること。
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
