/**
 * auth-line Edge Function
 *
 * 2つのモードをサポート:
 *  [A] LIFF モード  : フロントから { id_token } を受け取り直接検証
 *  [B] OAuth コードモード: { code, redirect_uri } でトークン交換 (PC版)
 *
 * 共通フロー:
 *  1. LINE APIでユーザー情報を取得
 *  2. m_users テーブルでユーザーを検索 or 新規作成
 *  3. Supabase Auth にユーザーを作成 or 更新
 *  4. magic link → token_hash → verifyOtp でセッション生成
 *  5. access_token / refresh_token をフロントエンドに返す
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 環境変数 ─────────────────────────────────────────────
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LINE_CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID')!;
    const LINE_CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET')!;

    if (!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET) {
      return errRes(500, 'CONFIG_ERROR', 'LINE_CHANNEL_ID または LINE_CHANNEL_SECRET が未設定です');
    }

    // ── リクエスト解析 ────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      code,
      redirect_uri,
      id_token: liffIdToken,
    } = body as { code?: string; redirect_uri?: string; id_token?: string };

    // ── LINE ユーザー情報の取得 ───────────────────────────────
    let lineUserId: string;
    let displayName: string;
    let avatarUrl: string | null;
    let lineEmail: string | null;
    let lineAccessToken: string | null = null;

    if (liffIdToken) {
      // ────────────────────────────────────────────────────────
      // [A] LIFF モード: フロントから id_token を受け取り直接検証
      // ────────────────────────────────────────────────────────
      const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          id_token: liffIdToken,
          client_id: LINE_CHANNEL_ID,
        }),
      });

      const lineProfile = await verifyRes.json();
      if (lineProfile.error) {
        console.error('LIFF id_token verify error:', lineProfile);
        return errRes(401, 'LINE_VERIFY_ERROR', 'LIFFトークンの検証に失敗しました: ' + (lineProfile.error_description ?? lineProfile.error));
      }

      lineUserId = lineProfile.sub;
      displayName = lineProfile.name ?? '未設定';
      avatarUrl = lineProfile.picture ?? null;
      lineEmail = lineProfile.email ?? null;

    } else if (code) {
      // ────────────────────────────────────────────────────────
      // [B] OAuth コードモード (PC版・既存の処理)
      // ────────────────────────────────────────────────────────
      const redirectUri = redirect_uri ?? '';

      const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: LINE_CHANNEL_ID,
          client_secret: LINE_CHANNEL_SECRET,
        }),
      });

      const lineTokens = await tokenRes.json();
      if (lineTokens.error) {
        console.error('LINE token error:', lineTokens);
        return errRes(401, 'LINE_TOKEN_ERROR', lineTokens.error_description ?? lineTokens.error);
      }

      const { id_token, access_token } = lineTokens as { id_token: string; access_token: string };
      lineAccessToken = access_token;

      const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token, client_id: LINE_CHANNEL_ID }),
      });

      const lineProfile = await verifyRes.json();
      if (lineProfile.error) {
        console.error('LINE verify error:', lineProfile);
        return errRes(401, 'LINE_VERIFY_ERROR', 'LINEトークンの検証に失敗しました');
      }

      // アバター取得（access_token がある場合）
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${lineAccessToken}` },
      });
      const detailedProfile = await profileRes.json().catch(() => ({}));

      lineUserId = lineProfile.sub;
      displayName = lineProfile.name ?? detailedProfile.displayName ?? '未設定';
      avatarUrl = lineProfile.picture ?? detailedProfile.pictureUrl ?? null;
      lineEmail = lineProfile.email ?? null;

    } else {
      return errRes(400, 'MISSING_PARAMS', 'id_token または code が必要です');
    }

    // メールアドレスが取得できない場合は line_user_id から生成
    const userEmail = lineEmail ?? `${lineUserId}@line.user`;

    // ── Supabase クライアント初期化 ───────────────────────────
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── m_users からユーザーを検索 or 新規作成 ────────────────
    const { data: existingDbUser } = await supabaseAdmin
      .from('m_users')
      .select('id, email, name, role, status, line_user_id, avatar_url')
      .eq('line_user_id', lineUserId)
      .single();

    let authUserId: string;
    let dbUser = existingDbUser;

    if (!dbUser) {
      // ── 新規ユーザー ──────────────────────────────────────
      const { data: newAuthData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: userEmail,
        user_metadata: {
          name: displayName,
          role: 'sales',
          line_user_id: lineUserId,
          avatar_url: avatarUrl,
        },
        email_confirm: true,
      });

      if (createError) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const found = listData?.users?.find((u) => u.email === userEmail);
        if (!found) {
          console.error('auth.users create error:', createError);
          return errRes(500, 'AUTH_CREATE_ERROR', createError.message);
        }
        authUserId = found.id;
      } else {
        authUserId = newAuthData.user!.id;
      }

      const { data: upsertedUser, error: upsertError } = await supabaseAdmin
        .from('m_users')
        .upsert(
          {
            id: authUserId,
            line_user_id: lineUserId,
            email: lineEmail,
            name: displayName,
            role: 'sales',
            avatar_url: avatarUrl,
            status: 'active',
          },
          { onConflict: 'id' }
        )
        .select('id, email, name, role, status, line_user_id, avatar_url')
        .single();

      if (upsertError) {
        console.error('m_users upsert error:', upsertError);
        return errRes(500, 'USER_UPSERT_ERROR', upsertError.message);
      }

      dbUser = upsertedUser;
    } else {
      // ── 既存ユーザー ──────────────────────────────────────
      authUserId = dbUser.id;

      if (dbUser.status === 'retired') {
        return errRes(403, 'USER_RETIRED', 'このアカウントは無効化されています。管理者にお問い合わせください。');
      }

      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          name: dbUser.name,
          role: dbUser.role,
          line_user_id: lineUserId,
          avatar_url: avatarUrl,
        },
      });

      if (avatarUrl && avatarUrl !== dbUser.avatar_url) {
        await supabaseAdmin
          .from('m_users')
          .update({ avatar_url: avatarUrl })
          .eq('id', authUserId);
      }
    }

    if (!dbUser) {
      return errRes(500, 'USER_NOT_FOUND', 'ユーザーの作成・取得に失敗しました');
    }

    // ── Supabase セッション生成 ────────────────────────────────
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: {
        data: {
          name: dbUser.name,
          role: dbUser.role,
          line_user_id: lineUserId,
          avatar_url: avatarUrl,
        },
      },
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('generateLink error:', linkError);
      return errRes(500, 'TOKEN_GENERATE_ERROR', linkError?.message ?? 'トークン生成に失敗しました');
    }

    const { data: sessionData, error: sessionError } = await supabaseAnon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    });

    if (sessionError || !sessionData?.session) {
      console.error('verifyOtp error:', sessionError);
      return errRes(500, 'SESSION_ERROR', sessionError?.message ?? 'セッション生成に失敗しました');
    }

    // ── レスポンス ────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_in: sessionData.session.expires_in,
        user: {
          id: dbUser.id,
          email: dbUser.email ?? userEmail,
          name: dbUser.name,
          role: dbUser.role,
          line_user_id: dbUser.line_user_id,
          avatar_url: avatarUrl,
          status: dbUser.status,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('auth-line unexpected error:', err);
    return errRes(500, 'INTERNAL_ERROR', String(err));
  }
});

function errRes(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
