import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FOLLOWUP_STATUSES = ['inquiry', 'estimate', 'followup_status'];

interface PjRow {
  id: string;
  project_number: string;
  customer_name: string;
  address: string | null;
  phone: string | null;
  status: string;
  work_type: string[] | null;
  work_description: string | null;
  estimated_amount: number | null;
  inquiry_date: string | null;
  contract_date: string | null;
  notes: string | null;
  assigned_to: string | null;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();

  // ① 追客対象案件（JOINなし・最小カラム）
  const { data: pjRaw, error: pjErr } = await supabase
    .from('t_projects')
    .select(
      'id, project_number, customer_name, address, phone, status, ' +
      'work_type, work_description, estimated_amount, ' +
      'inquiry_date, contract_date, notes, assigned_to'
    )
    .in('status', FOLLOWUP_STATUSES)
    .is('deleted_at', null)
    .order('inquiry_date', { ascending: false });

  if (pjErr) {
    console.error('[followup GET] t_projects error:', pjErr.message);
    return NextResponse.json({ error: pjErr.message }, { status: 500 });
  }

  const pjList = (pjRaw ?? []) as PjRow[];
  if (pjList.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  // ② 担当者名を m_users から取得
  const assignedIds = [...new Set(pjList.map((p) => p.assigned_to).filter((v): v is string => !!v))];
  let userNameMap: Record<string, string> = {};
  if (assignedIds.length > 0) {
    const { data: users } = await supabase
      .from('m_users')
      .select('id, name')
      .in('id', assignedIds);
    (users ?? []).forEach((u: { id: string; name: string }) => {
      userNameMap[u.id] = u.name;
    });
  }

  // ③ 最新商談日を t_meetings から取得
  let meetingMap: Record<string, string> = {};
  const projectIds = pjList.map((p) => p.id);
  const { data: meetings, error: meetErr } = await supabase
    .from('t_meetings')
    .select('project_id, meeting_date')
    .in('project_id', projectIds)
    .order('meeting_date', { ascending: false });

  if (meetErr) {
    console.error('[followup GET] t_meetings error:', meetErr.message);
    // t_meetings エラーは無視して続行
  } else {
    (meetings ?? []).forEach((m: { project_id: string; meeting_date: string }) => {
      if (!meetingMap[m.project_id]) meetingMap[m.project_id] = m.meeting_date;
    });
  }

  // ④ 結合
  const result = pjList.map((p) => ({
    id:                  p.id,
    project_number:      p.project_number,
    customer_name:       p.customer_name,
    address:             p.address ?? null,
    phone:               p.phone ?? null,
    status:              p.status,
    work_type:           p.work_type ?? [],
    work_description:    p.work_description ?? null,
    estimated_amount:    p.estimated_amount ?? null,
    inquiry_date:        p.inquiry_date ?? null,
    contract_date:       p.contract_date ?? null,
    notes:               p.notes ?? null,
    assigned_to:         p.assigned_to ?? null,
    assigned_to_name:    p.assigned_to ? (userNameMap[p.assigned_to] ?? null) : null,
    latest_meeting_date: meetingMap[p.id] ?? null,
  }));

  return NextResponse.json({ projects: result });
}

export async function PATCH(req: Request) {
  const supabase = getSupabase();

  let body: { id?: string; status?: string };
  try {
    body = await req.json() as { id?: string; status?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { id, status } = body;
  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
  }

  const { error } = await supabase.from('t_projects').update({ status }).eq('id', id);
  if (error) {
    console.error('[followup PATCH] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
