import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { geocodeAddressServer } from '@/lib/geocode-server';
import { getRouteHandlerUserId } from '@/lib/route-handler-auth';

type RegistrationKind = 'new' | 'existing';

interface Body {
  registrationKind: RegistrationKind;
  selectedCustomerId?: string | null;
  customerName: string;
  customerNameKana?: string | null;
  postalCode?: string | null;
  address: string;
  phone: string;
  email?: string | null;
  workDescription: string;
  projectTitle?: string | null;
  workTypes: string[];
  estimatedAmount: number;
  acquisitionRoute: string;
  assignedTo?: string | null;
  inquiryDate: string;
  notes?: string | null;
}

function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server env が不足しています');
  return createClient(url, key);
}

async function getLatestAssignedForCustomer(
  admin: SupabaseClient,
  customerId: string
): Promise<string | null> {
  const { data } = await admin
    .from('t_projects')
    .select('assigned_to')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('inquiry_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.assigned_to as string) ?? null;
}

type RegisterPermOpts = { registrationKind: RegistrationKind; customerId: string };

async function assertCanRegisterProject(
  admin: SupabaseClient,
  userId: string,
  assignedTo: string,
  opts?: RegisterPermOpts
): Promise<{ ok: false; message: string } | { ok: true; role: string }> {
  const { data: profile, error } = await admin
    .from('m_users')
    .select('role, role_level')
    .eq('id', userId)
    .maybeSingle();
  if (error || !profile) {
    return { ok: false, message: 'ユーザー情報が取得できません' };
  }
  const roleId = profile.role as string;
  const level = profile.role_level as string;
  if (level === 'admin' || level === 'staff') return { ok: true, role: roleId };
  if (level === 'sales') {
    if (assignedTo === userId) return { ok: true, role: roleId };
    if (opts?.registrationKind === 'existing') {
      const last = await getLatestAssignedForCustomer(admin, opts.customerId);
      if (last && last === assignedTo) return { ok: true, role: roleId };
    }
    return {
      ok: false,
      message:
        '営業はご自身を担当とする案件のみ登録できます（既存顧客は一覧で選んだ前回担当への引き継ぎのみ可）',
    };
  }
  return { ok: false, message: '案件登録権限がありません' };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getRouteHandlerUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    if (!body || (body.registrationKind !== 'new' && body.registrationKind !== 'existing')) {
      return NextResponse.json({ success: false, error: 'registrationKind が不正です' }, { status: 400 });
    }
    if (!body.customerName?.trim() || !body.address?.trim() || !body.phone?.trim()) {
      return NextResponse.json({ success: false, error: '顧客名・住所・電話は必須です' }, { status: 400 });
    }
    if (!Array.isArray(body.workTypes) || body.workTypes.length === 0) {
      return NextResponse.json({ success: false, error: '工事種別を選択してください' }, { status: 400 });
    }

    const assignedTo = (body.assignedTo?.trim() || userId) as string;
    const admin = createAdmin();

    let customerId: string;

    if (body.registrationKind === 'existing') {
      const sid = body.selectedCustomerId?.trim();
      if (!sid) {
        return NextResponse.json({ success: false, error: '既存顧客が選択されていません' }, { status: 400 });
      }
      const { data: existing, error: exErr } = await admin
        .from('m_customers')
        .select('id')
        .eq('id', sid)
        .is('deleted_at', null)
        .maybeSingle();
      if (exErr || !existing?.id) {
        return NextResponse.json({ success: false, error: '選択した顧客が見つかりません' }, { status: 400 });
      }
      customerId = existing.id as string;

      const perm = await assertCanRegisterProject(admin, userId, assignedTo, {
        registrationKind: 'existing',
        customerId,
      });
      if (!perm.ok) {
        return NextResponse.json({ success: false, error: perm.message }, { status: 403 });
      }
    } else {
      const perm = await assertCanRegisterProject(admin, userId, assignedTo);
      if (!perm.ok) {
        return NextResponse.json({ success: false, error: perm.message }, { status: 403 });
      }

      const { data: cust, error: cErr } = await admin
        .from('m_customers')
        .insert({
          customer_name: body.customerName.trim(),
          customer_name_kana: body.customerNameKana?.trim() || null,
          postal_code: body.postalCode?.trim() || null,
          address: body.address.trim(),
          phone: body.phone.trim(),
          email: body.email?.trim() || null,
          created_by: userId,
        })
        .select('id')
        .single();
      if (cErr || !cust?.id) {
        console.error('[register-project] m_customers insert', cErr);
        return NextResponse.json(
          { success: false, error: cErr?.message ?? '顧客マスタの作成に失敗しました' },
          { status: 500 }
        );
      }
      customerId = cust.id as string;
    }

    const workDesc =
      body.workDescription?.trim() ||
      (body.workTypes.length ? body.workTypes.join(',') : '');

    const prospect = Number(body.estimatedAmount) || 0;

    const { data: proj, error: pErr } = await admin
      .from('t_projects')
      .insert({
        customer_id: customerId,
        customer_name: body.customerName.trim(),
        customer_name_kana: body.customerNameKana?.trim() || null,
        postal_code: body.postalCode?.trim() || null,
        address: body.address.trim(),
        phone: body.phone.trim(),
        email: body.email?.trim() || null,
        work_description: workDesc,
        project_title: body.projectTitle?.trim() || null,
        work_type: body.workTypes,
        prospect_amount: prospect,
        estimated_amount: 0,
        acquisition_route: body.acquisitionRoute ?? '',
        assigned_to: assignedTo,
        notes: body.notes?.trim() || null,
        status: 'inquiry',
        inquiry_date: body.inquiryDate,
        created_by: userId,
      })
      .select('id, customer_id')
      .single();

    if (pErr || !proj?.id) {
      console.error('[register-project] t_projects insert', pErr);
      return NextResponse.json(
        { success: false, error: pErr?.message ?? '案件の登録に失敗しました' },
        { status: 500 }
      );
    }

    if (!proj.customer_id) {
      console.error('[register-project] customer_id が保存されていない', proj);
      return NextResponse.json(
        {
          success: false,
          error: '案件登録後に顧客IDが紐づきませんでした。DB の t_projects.customer_id を確認してください',
        },
        { status: 500 }
      );
    }

    let geocoded = false;
    const addrForGeo = [body.postalCode?.trim(), body.address.trim()].filter(Boolean).join(' ');
    if (addrForGeo) {
      const coords = await geocodeAddressServer(addrForGeo);
      if (coords) {
        const { error: geoErr } = await admin
          .from('t_projects')
          .update({ lat: coords.lat, lng: coords.lng })
          .eq('id', proj.id);
        if (geoErr) {
          console.error('[register-project] geocode lat/lng save', geoErr);
        } else {
          geocoded = true;
        }
      }
    }

    return NextResponse.json({
      success: true,
      projectId: proj.id,
      customerId: proj.customer_id,
      geocoded,
    });
  } catch (e) {
    console.error('[register-project]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
