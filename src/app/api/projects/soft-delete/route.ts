import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRouteHandlerUserId } from '@/lib/route-handler-auth';

/**
 * 案件の論理削除（クライアント直叩きだと RLS で 403 になる環境向けに、サーバーで権限検証後に更新）
 */
export async function POST(req: NextRequest) {
  const userId = await getRouteHandlerUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[projects/soft-delete] SUPABASE_SERVICE_ROLE_KEY が未設定です');
    return NextResponse.json({ success: false, error: 'サーバー設定が不正です' }, { status: 500 });
  }

  const admin = createClient(url, serviceKey);

  const { data: profile, error: profileErr } = await admin
    .from('m_users')
    .select('role')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (profileErr || !profile?.role) {
    return NextResponse.json({ success: false, error: 'ユーザー情報を確認できません' }, { status: 403 });
  }

  const role = profile.role as string;
  if (!['admin', 'staff'].includes(role)) {
    return NextResponse.json({ success: false, error: '論理削除の権限がありません' }, { status: 403 });
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

  const { data: updated, error: updateErr } = await admin
    .from('t_projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', projectId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (updateErr) {
    console.error('[projects/soft-delete] update', updateErr);
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
  }

  if (!updated?.id) {
    return NextResponse.json(
      { success: false, error: '案件が見つからないか、既に削除済みです' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
