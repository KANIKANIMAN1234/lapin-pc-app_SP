import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  customerFolderLabel,
  folderWebUrl,
  getDriveClient,
  isDriveConfigured,
} from '@/lib/google-drive-server';

type Body = {
  /** 指定顧客1件だけルート直下に顧客フォルダを作成し m_customers を更新 */
  customerId?: string;
  /**
   * drive_folder_id が空の顧客を全件処理（deleted_at IS NULL）。
   * admin / staff のみ。
   */
  allMissing?: boolean;
};

type CustomerRow = {
  id: string;
  customer_number: string | null;
  customer_name: string;
  address: string;
  drive_folder_id: string | null;
  created_by: string | null;
};

async function getRequestUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (authHeader?.startsWith('Bearer ') && url && anon) {
    const token = authHeader.slice(7).trim();
    const supabase = createClient(url, anon);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    return user?.id ?? null;
  }
  const server = await createServerSupabaseClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  return user?.id ?? null;
}

async function getUserRole(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from('m_users').select('role').eq('id', userId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase サーバー環境変数が不足しています');
  return createClient(url, key);
}

/** スマホ `setup-project-drive` と同じく、ルート直下に顧客フォルダを1件作成して DB 更新 */
async function ensureCustomerRootFolder(
  admin: SupabaseClient,
  drive: NonNullable<ReturnType<typeof getDriveClient>>,
  rootId: string,
  row: CustomerRow
): Promise<{ skipped: boolean; folderId: string; folderUrl: string }> {
  const existing = row.drive_folder_id?.trim();
  if (existing) {
    return { skipped: true, folderId: existing, folderUrl: folderWebUrl(existing) };
  }

  const folderName = customerFolderLabel(row.customer_number, row.customer_name, row.address);
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  const newId = res.data.id;
  if (!newId) throw new Error('顧客フォルダID取得に失敗しました');

  const curl = folderWebUrl(newId);
  const { error: upErr } = await admin
    .from('m_customers')
    .update({ drive_folder_id: newId, drive_folder_url: curl })
    .eq('id', row.id);
  if (upErr) throw new Error(upErr.message);

  return { skipped: false, folderId: newId, folderUrl: curl };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ success: false, error: 'JSON 本文が不正です' }, { status: 400 });
    }

    const single = body.customerId?.trim();
    const allMissing = body.allMissing === true;

    if ((!single && !allMissing) || (single && allMissing)) {
      return NextResponse.json(
        { success: false, error: 'customerId（1件）または allMissing: true のどちらか一方を指定してください' },
        { status: 400 }
      );
    }

    if (!isDriveConfigured()) {
      return NextResponse.json({
        success: false,
        skipped: true,
        error: 'GOOGLE_SERVICE_ACCOUNT_JSON が未設定のため Drive をスキップしました',
      });
    }

    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json({ success: false, error: 'Google Drive クライアント初期化に失敗しました' }, { status: 500 });
    }

    const admin = createAdmin();
    const role = await getUserRole(admin, userId);

    if (allMissing && role !== 'admin' && role !== 'staff') {
      return NextResponse.json(
        { success: false, error: 'allMissing は admin / staff のみ実行できます' },
        { status: 403 }
      );
    }

    const { data: settingsRows } = await admin
      .from('m_settings')
      .select('key, value')
      .eq('key', 'drive_root_folder_id');
    const rootId = (settingsRows?.[0]?.value as string | undefined)?.trim();
    if (!rootId) {
      return NextResponse.json({
        success: false,
        skipped: true,
        error: 'drive_root_folder_id が m_settings に未設定です',
      });
    }

    const errors: { customerId: string; message: string }[] = [];
    let created = 0;
    let skipped = 0;

    if (single) {
      const { data: row, error: selErr } = await admin
        .from('m_customers')
        .select('id, customer_number, customer_name, address, drive_folder_id, created_by')
        .eq('id', single)
        .is('deleted_at', null)
        .maybeSingle();

      if (selErr || !row) {
        return NextResponse.json({ success: false, error: '顧客が見つかりません' }, { status: 404 });
      }

      const can =
        role === 'admin' || role === 'staff' || row.created_by === userId;
      if (!can) {
        return NextResponse.json({ success: false, error: 'この顧客に対する操作権限がありません' }, { status: 403 });
      }

      try {
        const r = await ensureCustomerRootFolder(admin, drive, rootId, row as CustomerRow);
        if (r.skipped) skipped += 1;
        else created += 1;
        return NextResponse.json({
          success: true,
          created,
          skipped,
          results: [{ customerId: row.id, ...r }],
          errors,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { success: false, error: message, customerId: single },
          { status: 500 }
        );
      }
    }

    const { data: rows, error: listErr } = await admin
      .from('m_customers')
      .select('id, customer_number, customer_name, address, drive_folder_id, created_by')
      .is('deleted_at', null);

    if (listErr) {
      return NextResponse.json({ success: false, error: listErr.message }, { status: 500 });
    }

    const targets = (rows ?? []).filter((r) => !r.drive_folder_id?.trim()) as CustomerRow[];

    const results: { customerId: string; skipped: boolean; folderId: string; folderUrl: string }[] = [];

    for (const row of targets) {
      try {
        const r = await ensureCustomerRootFolder(admin, drive, rootId, row);
        if (r.skipped) skipped += 1;
        else created += 1;
        results.push({ customerId: row.id, ...r });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ customerId: row.id, message });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      created,
      skipped,
      processed: targets.length,
      results,
      errors,
    });
  } catch (e) {
    console.error('[sync-customer-drives]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
