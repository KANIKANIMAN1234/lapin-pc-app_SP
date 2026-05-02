import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { parseEstimateFromPdfText } from '@/lib/estimate-pdf-parse';
import {
  ensureFolderPathFromTemplate,
  getDriveClient,
  isDriveConfigured,
  parseFolderTemplateJson,
  sanitizeDriveSegment,
  uploadFileToDriveFolder,
} from '@/lib/google-drive-server';
import { statusInferredFromAmounts } from '@/lib/projectStatusFromAmounts';
import type { ProjectStatus } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role が未設定です');
  return createClient(url, key);
}

function workTitleForFilename(p: { project_title?: string | null; work_description: string }) {
  const t = (p.project_title ?? '').trim() || (p.work_description ?? '').trim() || '工事';
  return sanitizeDriveSegment(t, 80).replace(/\s+/g, '');
}

function buildEstimatePdfName(ymd: string, projectNumber: string, customerName: string, workTitle: string) {
  const pn = sanitizeDriveSegment(projectNumber || '番号なし', 40).replace(/\s+/g, '');
  const cn = sanitizeDriveSegment(customerName, 80).replace(/\s+/g, '');
  const base = `${ymd}-${pn}-${cn}-${workTitle}`;
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function pickEstimateSubPath(templateValue: string | null): string {
  const paths = parseFolderTemplateJson(templateValue);
  const hit = paths.find((p) => p.includes('見積'));
  return hit ?? '01_見積書';
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUser = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const formData = await req.formData();
    const projectId = String(formData.get('projectId') ?? '').trim();
    const maybeFile = formData.get('file');
    const file = maybeFile instanceof File ? maybeFile : null;

    if (!projectId || !file || file.size === 0) {
      return NextResponse.json({ success: false, error: 'projectId と PDF ファイルが必要です' }, { status: 400 });
    }
    const mime = (file.type || '').toLowerCase();
    if (mime && mime !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'PDF ファイルのみ対応しています' }, { status: 400 });
    }

    const admin = createAdmin();

    const { data: me } = await admin.from('m_users').select('role_level').eq('id', user.id).maybeSingle();
    const roleLevel = (me?.role_level as string) ?? '';

    const { data: row, error: selErr } = await admin
      .from('t_projects')
      .select(
        'id, assigned_to, drive_folder_id, project_number, customer_name, work_description, project_title, status, estimated_amount, estimate_date, contract_amount'
      )
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle();

    if (selErr || !row) {
      return NextResponse.json({ success: false, error: '案件が見つかりません' }, { status: 404 });
    }

    const can = roleLevel === 'admin' || roleLevel === 'staff' || row.assigned_to === user.id;
    if (!can) {
      return NextResponse.json({ success: false, error: 'この案件を編集する権限がありません' }, { status: 403 });
    }

    const parentDriveId = (row.drive_folder_id as string | null)?.trim();
    if (!parentDriveId) {
      return NextResponse.json(
        {
          success: false,
          error: '案件の Google Drive フォルダが未設定です。Drive 連携後に再度お試しください。',
        },
        { status: 400 }
      );
    }

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON が未設定のため Drive に保存できません' },
        { status: 500 }
      );
    }

    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json({ success: false, error: 'Drive クライアントの初期化に失敗しました' }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let pdfText = '';
    const warnings: string[] = [];
    try {
      const parser = new PDFParse({ data: buffer });
      try {
        const textResult = await parser.getText();
        pdfText = textResult.text ?? '';
      } finally {
        await parser.destroy();
      }
    } catch (e) {
      console.warn('[project-estimate-upload] pdf text extract', e);
      warnings.push('PDF からテキストを抽出できませんでした（スキャン画像のみのPDFの可能性があります）');
    }

    const parsed = parseEstimateFromPdfText(pdfText);
    const today = new Date();
    const ymd =
      parsed.createdDate?.replace(/-/g, '') ??
      `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    if (!parsed.createdDate) {
      warnings.push('作成日を自動認識できませんでした（アップロード日をファイル名先頭に使用しました）');
    }
    if (parsed.totalYen == null) {
      warnings.push('見積合計金額を自動認識できませんでした。金額は手入力で修正してください');
    }

    const { data: settingRow } = await admin
      .from('m_settings')
      .select('value')
      .eq('key', 'drive_folder_template')
      .maybeSingle();
    const subPath = pickEstimateSubPath((settingRow?.value as string) ?? null);

    const targetFolderId = await ensureFolderPathFromTemplate(drive, parentDriveId, subPath);

    const workSeg = workTitleForFilename({
      project_title: row.project_title as string | null,
      work_description: String(row.work_description ?? ''),
    });
    const pdfName = buildEstimatePdfName(
      ymd,
      String(row.project_number ?? ''),
      String(row.customer_name ?? ''),
      workSeg
    );

    const uploaded = await uploadFileToDriveFolder(drive, targetFolderId, pdfName, 'application/pdf', buffer);
    const driveFileUrl = uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`;

    const updatePayload: Record<string, unknown> = {};
    if (parsed.createdDate) updatePayload.estimate_date = parsed.createdDate;
    if (parsed.totalYen != null) {
      updatePayload.estimated_amount = parsed.totalYen;
      const inferred = statusInferredFromAmounts(
        row.status as ProjectStatus,
        parsed.totalYen,
        row.contract_amount
      );
      if (inferred) updatePayload.status = inferred;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: upErr } = await admin.from('t_projects').update(updatePayload).eq('id', projectId);
      if (upErr) {
        return NextResponse.json(
          { success: false, error: `Drive へは保存しましたが案件の更新に失敗しました: ${upErr.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      driveFileId: uploaded.id,
      driveUrl: driveFileUrl,
      parsed: {
        estimate_date: parsed.createdDate,
        estimated_amount: parsed.totalYen,
      },
      applied: updatePayload,
      warnings,
    });
  } catch (e) {
    console.error('[project-estimate-upload]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
