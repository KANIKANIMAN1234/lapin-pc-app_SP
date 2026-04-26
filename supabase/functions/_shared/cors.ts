/**
 * Supabase Edge Functions 共通 CORS ヘッダー
 * Vercel フロントエンドからのリクエストを許可する
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
