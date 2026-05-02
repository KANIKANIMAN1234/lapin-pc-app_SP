import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseRoleDefinitions } from '@/lib/rolesAndNav';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from('m_users')
    .select('id, name, email, role, role_level, phone, line_user_id, status, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let canRegisterMap: Record<string, boolean> = {};
  try {
    const { data: crData } = await supabase
      .from('m_users')
      .select('id, can_register_project');
    (crData ?? []).forEach((r: { id: string; can_register_project?: boolean }) => {
      canRegisterMap[r.id] = r.can_register_project ?? false;
    });
  } catch {
    // ignore
  }

  const users = (data ?? []).map((u) => ({
    ...u,
    can_register_project: canRegisterMap[u.id] ?? false,
  }));

  return NextResponse.json({ users });
}

async function resolveRoleLevel(
  supabase: SupabaseClient,
  roleId: string
): Promise<'admin' | 'staff' | 'sales'> {
  const { data } = await supabase
    .from('m_settings')
    .select('value')
    .eq('key', 'role_definitions')
    .maybeSingle();
  const row = data as { value: string } | null;
  const defs = parseRoleDefinitions(row?.value ?? null);
  const found = defs.find((d) => d.id === roleId);
  if (!found) throw new Error(`未定義の役割IDです: ${roleId}`);
  return found.level;
}

export async function PATCH(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = await req.json() as { id: string; role?: string; [key: string]: unknown };

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch = { ...updates } as Record<string, unknown>;
  if (typeof patch.role === 'string') {
    try {
      patch.role_level = await resolveRoleLevel(supabase, patch.role);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '役割の解決に失敗しました';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const { error } = await supabase.from('m_users').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = await req.json() as Record<string, unknown>;
  const roleId = typeof body.role === 'string' ? body.role : 'sales';

  let role_level: 'admin' | 'staff' | 'sales';
  try {
    role_level = await resolveRoleLevel(supabase, roleId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '役割の解決に失敗しました';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { error } = await supabase.from('m_users').insert({ ...body, role: roleId, role_level });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
