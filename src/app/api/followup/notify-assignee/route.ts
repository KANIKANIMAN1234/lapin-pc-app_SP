import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function sendLinePushMessages(lineUserId: string, messages: object[]): Promise<boolean> {
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
    body: JSON.stringify({ to: lineUserId, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[followup/notify-assignee] LINE push:', err.slice(0, 300));
  }
  return res.ok;
}

function tryOrigin(raw: string | undefined): string | null {
  const s = raw?.trim() ?? '';
  if (!s) return null;
  try {
    const href = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    return new URL(href).origin;
  } catch {
    return null;
  }
}

function resolveAppBaseUrl(): string | null {
  const fromExplicit =
    tryOrigin(process.env.NEXT_PUBLIC_APP_URL) ?? tryOrigin(process.env.NEXT_PUBLIC_SITE_URL);
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

/** 通知内の「案件詳細」リンク: モバイル用 URL を優先（未設定時は PC と同じオリジン） */
function resolveDetailBaseUrl(): string | null {
  return (
    tryOrigin(process.env.NEXT_PUBLIC_MOBILE_APP_URL) ??
    tryOrigin(process.env.MOBILE_APP_PUBLIC_URL) ??
    resolveAppBaseUrl()
  );
}

function projectDetailUrl(base: string, projectId: string): string {
  const root = base.replace(/\/$/, '');
  return `${root}/projects/${projectId}`;
}

/** スマホのトーク画面向け Flex（タップで開くボタン付き） */
function buildFollowupFlex(options: {
  assigneeName: string;
  customerName: string;
  projectNumber: string;
  daysPhrase: string;
  detailUrl: string | null;
}): Record<string, unknown> {
  const inner: object[] = [
    {
      type: 'text',
      text: `${options.assigneeName} 様`,
      weight: 'bold',
      size: 'md',
      wrap: true,
      color: '#333333',
    },
    { type: 'separator', margin: 'md' },
    {
      type: 'text',
      text: `顧客: ${options.customerName}`,
      size: 'sm',
      wrap: true,
      color: '#333333',
    },
    {
      type: 'text',
      text: `案件番号: ${options.projectNumber}`,
      size: 'xs',
      color: '#888888',
      wrap: true,
    },
    {
      type: 'text',
      text: options.daysPhrase,
      size: 'sm',
      wrap: true,
      margin: 'md',
      color: '#1a1a1a',
    },
    {
      type: 'text',
      text: '追客のフォローをお願いします。',
      size: 'xs',
      color: '#666666',
      wrap: true,
    },
  ];

  if (!options.detailUrl) {
    inner.push({
      type: 'text',
      text: '※詳細を開くボタンは、NEXT_PUBLIC_APP_URL または NEXT_PUBLIC_MOBILE_APP_URL 設定後に表示されます。',
      size: 'xs',
      color: '#b45309',
      wrap: true,
      margin: 'md',
    });
  }

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      backgroundColor: '#06C755',
      contents: [
        {
          type: 'text',
          text: '📋 追客リマインド',
          color: '#ffffff',
          weight: 'bold',
          size: 'sm',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '14px',
      contents: inner,
    },
  };

  if (options.detailUrl) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '10px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#06C755',
          height: 'sm',
          action: {
            type: 'uri',
            label: '案件詳細を開く',
            uri: options.detailUrl,
          },
        },
      ],
    };
  }

  return bubble;
}

/**
 * 追客一覧から担当者へ「問い合わせから〇日経過」の LINE 通知（モバイル向け Flex）
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

  const detailBase = resolveDetailBaseUrl();
  const detailUrl = detailBase ? projectDetailUrl(detailBase, project.id) : null;

  const flexContents = buildFollowupFlex({
    assigneeName: assignee.name,
    customerName: project.customer_name,
    projectNumber: project.project_number,
    daysPhrase,
    detailUrl,
  });

  const altText = `【追客リマインド】${project.customer_name}（${project.project_number}）${daysPhrase}`;

  const ok = await sendLinePushMessages(lineUid, [
    {
      type: 'flex',
      altText,
      contents: flexContents,
    },
  ]);

  if (!ok) {
    return NextResponse.json(
      { success: false, error: 'LINE送信に失敗しました（トークン・友だち追加を確認してください）' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
