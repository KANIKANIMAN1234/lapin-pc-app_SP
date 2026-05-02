import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function sendLinePush(lineUserId: string, text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('[followup/notify-assignee] LINE_CHANNEL_ACCESS_TOKEN 未設定');
    return false;
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[followup/notify-assignee] LINE push:', err.slice(0, 300));
  }
  return res.ok;
}

function resolveAppBaseUrl(): string | null {
  const tryOrigin = (raw: string): string | null => {
    const s = raw.trim();
    if (!s) return null;
    try {
      const href = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      return new URL(href).origin;
    } catch {
      return null;
    }
  };

  const fromExplicit =
    tryOrigin(process.env.NEXT_PUBLIC_APP_URL ?? '') ??
    tryOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? '');
  if (fromExplicit) return fromExplicit;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const o = tryOrigin(vercel);
    if (o) return o;
  }

  const cb = process.env.NEXT_PUBLIC_LINE_LOGIN_CALLBACK_URL?.trim();
  if (cb) {
    try {
      return new URL(cb).origin;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * 追客一覧から担当者へ「問い合わせから〇日経過」の LINE 通知
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ success: false, error: 'サーバー設定が不正です' }, { status: 500 });
  }

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'リクエストが不正です' }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ success: false, error: 'projectId が必要です' }, { status: 400 });
  }

  const supabase = createClient(url, key);

  const { data: project, error: pErr } = await supabase
    .from('t_projects')
    .select('id, project_number, customer_name, inquiry_date, assigned_to')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();

  if (pErr || !project) {
    return NextResponse.json({ success: false, error: '案件が見つかりません' }, { status: 404 });
  }

  if (!project.assigned_to) {
    return NextResponse.json({ success: false, error: '担当者が設定されていません' }, { status: 400 });
  }

  const { data: assignee, error: uErr } = await supabase
    .from('m_users')
    .select('name, line_user_id')
    .eq('id', project.assigned_to)
    .maybeSingle();

  if (uErr || !assignee) {
    return NextResponse.json({ success: false, error: '担当者情報を取得できません' }, { status: 400 });
  }

  const lineUid = assignee.line_user_id?.trim();
  if (!lineUid) {
    return NextResponse.json(
      {
        success: false,
        error: `${assignee.name}さんのLINE連携が未登録です（設定で LINE を紐づけてください）`,
      },
      { status: 400 }
    );
  }

  let daysPhrase = '日数を算出できませんでした';
  if (project.inquiry_date) {
    const days = Math.floor(
      (Date.now() - new Date(project.inquiry_date).getTime()) / 86400000
    );
    if (!Number.isNaN(days) && days >= 0) {
      daysPhrase = `問い合わせから${days}日が経過しています`;
    }
  }

  const base = resolveAppBaseUrl();
  const detailLine = base
    ? `\n\n案件詳細: ${base}/projects/${project.id}`
    : '\n\n※案件詳細のリンクを付けるには、Vercel に NEXT_PUBLIC_APP_URL（例: https://xxx.vercel.app）を設定してください。';

  const text =
    `【追客リマインド】\n` +
    `${assignee.name} 様\n\n` +
    `「${project.customer_name}」（${project.project_number}）は、` +
    `${daysPhrase}。\n` +
    `追客管理のフォローをお願いします。` +
    detailLine;

  const ok = await sendLinePush(lineUid, text);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: 'LINE送信に失敗しました（トークン・友だち追加を確認してください）' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
