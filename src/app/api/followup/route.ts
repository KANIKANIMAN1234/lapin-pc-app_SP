import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FOLLOWUP_STATUSES = ['inquiry', 'estimate', 'followup_status'];

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const supabase    = createClient(supabaseUrl, serviceKey);

  // 追客対象案件
  const { data: pj, error } = await supabase
    .from('t_projects')
    .select(`
      id, project_number, customer_name, address, phone, status,
      work_type, work_description, estimated_amount,
      inquiry_date, contract_date, notes,
      assigned_to, assigned_to_name
    `)
    .in('status', FOLLOWUP_STATUSES)
    .is('deleted_at', null)
    .order('inquiry_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pjList = pj ?? [];
  if (pjList.length === 0) return NextResponse.json({ projects: [] });

  // 最新商談日を一括取得
  const ids = pjList.map((p) => p.id);
  const { data: meetings } = await supabase
    .from('t_meetings')
    .select('project_id, meeting_date')
    .in('project_id', ids)
    .is('deleted_at', null)
    .order('meeting_date', { ascending: false });

  const meetingMap: Record<string, string> = {};
  (meetings ?? []).forEach((m) => {
    if (!meetingMap[m.project_id]) meetingMap[m.project_id] = m.meeting_date;
  });

  const result = pjList.map((p) => ({
    ...p,
    latest_meeting_date: meetingMap[p.id] ?? null,
  }));

  return NextResponse.json({ projects: result });
}

export async function PATCH(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const supabase    = createClient(supabaseUrl, serviceKey);

  const body = await req.json() as { id: string; status: string };
  const { id, status } = body;
  if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });

  const { error } = await supabase.from('t_projects').update({ status }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
