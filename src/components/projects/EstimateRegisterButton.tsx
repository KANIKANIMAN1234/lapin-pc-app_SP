'use client';

import { useState, useRef } from 'react';
import type { Project } from '@/types';

type Props = {
  project: Pick<
    Project,
    'id' | 'project_number' | 'customer_name' | 'work_description' | 'project_title' | 'drive_folder_id'
  >;
  onToast: (msg: string, type: 'success' | 'error') => void;
  onSaved: () => void;
};

export function EstimateRegisterButton({ project, onToast, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    estimate_date: string | null;
    estimated_amount: number | null;
    warnings: string[];
    driveUrl?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasFolder = !!(project.drive_folder_id && String(project.drive_folder_id).trim());

  const submit = async (file: File) => {
    setBusy(true);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append('projectId', project.id);
      fd.append('file', file);
      const res = await fetch('/api/project-estimate-upload', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        warnings?: string[];
        parsed?: { estimate_date: string | null; estimated_amount: number | null };
        driveUrl?: string;
      };
      if (!res.ok || !json.success) {
        onToast(json.error || '見積の登録に失敗しました', 'error');
        return;
      }
      setPreview({
        estimate_date: json.parsed?.estimate_date ?? null,
        estimated_amount: json.parsed?.estimated_amount ?? null,
        warnings: json.warnings ?? [],
        driveUrl: json.driveUrl,
      });
      onToast('見積PDFを保存し、読み取り結果を反映しました', 'success');
      onSaved();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '通信に失敗しました', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn-secondary text-sm inline-flex items-center gap-1"
        disabled={!hasFolder}
        title={!hasFolder ? '案件の Drive フォルダが未設定のため利用できません' : undefined}
        onClick={() => {
          setOpen(true);
          setPreview(null);
        }}
      >
        <span className="material-icons text-base">description</span>
        見積登録
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal
          aria-labelledby="estimate-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onMouseDown={(e) => e.stopPropagation()}>
            <h3 id="estimate-modal-title" className="font-bold text-lg mb-2 flex items-center gap-2">
              <span className="material-icons text-green-600">upload_file</span>
              見積書 PDF の登録
            </h3>
            <p className="text-xs text-gray-600 mb-3 leading-relaxed">
              Google Drive の見積フォルダへ保存し、テキスト入り PDF から作成日・税込合計に近い金額を読み取って反映します。スキャン画像のみの PDF
              は自動認識できないことがあります。
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void submit(f);
              }}
            />

            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={busy || !hasFolder}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? '処理中...' : 'PDF を選択'}
              </button>
              <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>

            {preview && (
              <div className="text-xs border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-1">
                <div>
                  <span className="text-gray-500">読取 作成日: </span>
                  <span className="font-medium">{preview.estimate_date ?? '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">読取 見積金額: </span>
                  <span className="font-medium">
                    {preview.estimated_amount != null
                      ? `${preview.estimated_amount.toLocaleString()}円`
                      : '—'}
                  </span>
                </div>
                {preview.warnings.length > 0 && (
                  <ul className="text-amber-800 list-disc pl-4 mt-2">
                    {preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                {preview.driveUrl && (
                  <a
                    href={preview.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-2"
                  >
                    <span className="material-icons text-sm">open_in_new</span>
                    Drive のファイルを開く
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
