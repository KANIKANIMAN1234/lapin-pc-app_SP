const LINE_LOGIN_CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID || '';
const LINE_LOGIN_CALLBACK_URL = process.env.NEXT_PUBLIC_LINE_LOGIN_CALLBACK_URL || '';

/**
 * LINE ログイン URL を生成する
 */
export function getLineLoginUrl(): string {
  const state = generateRandomState();
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('line_login_state', state);
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_LOGIN_CHANNEL_ID,
    redirect_uri: LINE_LOGIN_CALLBACK_URL,
    state,
    scope: 'profile openid',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

function generateRandomState(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * LINE 認可コード → LINEアクセストークン → Supabase JWT 交換
 * Edge Function `auth-line` を呼び出す
 */
export async function exchangeLineCodeForSupabaseSession(
  code: string,
  supabaseEdgeFunctionUrl: string
): Promise<{
  access_token: string | null;
  refresh_token: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    line_user_id: string;
  } | null;
  error?: string;
}> {
  try {
    const res = await fetch(`${supabaseEdgeFunctionUrl}/auth-line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        redirect_uri: LINE_LOGIN_CALLBACK_URL,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { access_token: null, refresh_token: null, user: null, error: `Edge Function エラー (${res.status}): ${text}` };
    }

    const data = await res.json();
    if (data.error) {
      return { access_token: null, refresh_token: null, user: null, error: data.error };
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    };
  } catch (err) {
    return { access_token: null, refresh_token: null, user: null, error: `ネットワークエラー: ${String(err)}` };
  }
}

export function clearLineState(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('line_login_state');
  }
}
