import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const supabase = createClient(supabaseUrl, serviceKey);

  // まず基本カラムで取得。can_register_project は後で個別に試みる
  const { data, error } = await supabase
    .from('m_users')
    .select('id, name, email, role, phone, line_user_id, status, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // can_register_project カラムが存在するか確認してから追加
  let canRegisterMap: Record<string, boolean> = {};
  try {
    const { data: crData } = await supabase
      .from('m_users')
      .select('id, can_register_project');
    (crData ?? []).forEach((r: { id: string; can_register_project?: boolean }) => {
      canRegisterMap[r.id] = r.can_register_project ?? false;
    });
  } catch {
    // カラムが存在しない場合は全員 false
  }

  const users = (data ?? []).map((u) => ({
    ...u,
    can_register_project: canRegisterMap[u.id] ?? false,
  }));

  return NextResponse.json({ users });
}

export async function PATCH(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = await req.json() as { id: string; [key: string]: unknown };

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase.from('m_users').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = await req.json() as Record<string, unknown>;

  const { error } = await supabase.from('m_users').insert(body);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
