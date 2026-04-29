import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FOLLOWUP_STATUSES = ['inquiry', 'estimate', 'followup_status'];

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const supabase    = createClient(supabaseUrl, serviceKey);

  // 追客対象案件（assigned_to_name はカラムに存在しないため除外してJOINで取得）
  const { data: pj, error } = await supabase
    .from('t_projects')
    .select(`
      id, project_number, customer_name, address, phone, status,
      work_type, work_description, estimated_amount,
      inquiry_date, contract_date, notes, assigned_to,
      m_users!t_projects_assigned_to_fkey(name)
    `)
    .in('status', FOLLOWUP_STATUSES)
    .is('deleted_at', null)
    .order('inquiry_date', { ascending: false });

  if (error) {
    // JOINが失敗した場合はシンプルなクエリにフォールバック
    const { data: pj2, error: err2 } = await supabase
      .from('t_projects')
      .select('id, project_number, customer_name, address, phone, status, work_type, work_description, estimated_amount, inquiry_date, contract_date, notes, assigned_to')
      .in('status', FOLLOWUP_STATUSES)
      .is('deleted_at', null)
      .order('inquiry_date', { ascending: false });
    if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });

    const pjList2 = pj2 ?? [];
    return NextResponse.json({ projects: pjList2.map((p) => ({ ...p, assigned_to_name: null, latest_meeting_date: null })) });
  }

  const pjList = pj ?? [];
  if (pjList.length === 0) return NextResponse.json({ projects: [] });

  // 担当者名マップ
  const assigneeNameMap: Record<string, string> = {};
  pjList.forEach((p) => {
    const u = (p as unknown as { m_users?: { name: string } | null }).m_users;
    if (u?.name && p.assigned_to) assigneeNameMap[p.assigned_to] = u.name;
  });

  // 最新商談日を一括取得（t_meetingsが存在しない場合は空にフォールバック）
  let meetingMap: Record<string, string> = {};
  try {
    const ids = pjList.map((p) => p.id);
    const { data: meetings } = await supabase
      .from('t_meetings')
      .select('project_id, meeting_date')
      .in('project_id', ids)
      .order('meeting_date', { ascending: false });
    (meetings ?? []).forEach((m: { project_id: string; meeting_date: string }) => {
      if (!meetingMap[m.project_id]) meetingMap[m.project_id] = m.meeting_date;
    });
  } catch {
    // t_meetings が存在しない場合は空のまま
  }

  const result = pjList.map((p) => ({
    id: p.id,
    project_number: p.project_number,
    customer_name: p.customer_name,
    address: p.address,
    phone: p.phone,
    status: p.status,
    work_type: p.work_type,
    work_description: p.work_description,
    estimated_amount: p.estimated_amount,
    inquiry_date: p.inquiry_date,
    contract_date: p.contract_date,
    notes: p.notes,
    assigned_to: p.assigned_to,
    assigned_to_name: assigneeNameMap[p.assigned_to] ?? null,
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
