'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { geocodeJapaneseAddress } from '@/lib/nominatimGeocode';
import { statusInferredFromAmounts } from '@/lib/projectStatusFromAmounts';
import type { ProjectStatus } from '@/types';

const DEFAULT_WORK_TYPES = ['外壁塗装', '屋根塗装', '防水工事', '内装工事', 'リフォーム', 'その他'];
const DEFAULT_ACQUISITION_ROUTES = ['チラシ', '紹介', 'Web', 'LINE', '訪問', 'その他'];
const DEFAULT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'inquiry',        label: '問い合わせ' },
  { value: 'estimate',       label: '見積もり' },
  { value: 'followup_status', label: '追客中' },
  { value: 'contract',       label: '契約' },
  { value: 'in_progress',    label: '施工中' },
  { value: 'completed',      label: '完成' },
  { value: 'lost',           label: '失注' },
];

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { mutateAsync: createProject, isPending } = useCreateProject();

  const [workTypes, setWorkTypes] = useState<string[]>(DEFAULT_WORK_TYPES);
  const [acquisitionRoutes, setAcquisitionRoutes] = useState<string[]>(DEFAULT_ACQUISITION_ROUTES);
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS);

  // m_settings からマスターデータを取得
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('m_settings')
      .select('key, value')
      .in('key', ['work_type_options', 'acquisition_route_options', 'project_status_options'])
      .then(({ data }) => {
        if (!data) return;
        data.forEach((row) => {
          try {
            const values: string[] = JSON.parse(row.value);
            if (!Array.isArray(values) || values.length === 0) return;
            if (row.key === 'work_type_options') setWorkTypes(values);
            if (row.key === 'acquisition_route_options') setAcquisitionRoutes(values);
            if (row.key === 'project_status_options') {
              // 形式: ["inquiry:問い合わせ", "estimate:見積もり", ...]
              const list = values.map((item) => {
                const idx = item.indexOf(':');
                if (idx === -1) return { value: item as ProjectStatus, label: item };
                return { value: item.slice(0, idx) as ProjectStatus, label: item.slice(idx + 1) };
              });
              setStatusOptions(list);
            }
          } catch { /* JSON パース失敗時はデフォルト値を維持 */ }
        });
      });
  }, []);

  const [form, setForm] = useState({
    customer_name: '',
    customer_name_kana: '',
    project_title: '',
    postal_code: '',
    address: '',
    phone: '',
    email: '',
    work_description: '',
    work_type: [] as string[],
    prospect_amount: '',
    estimated_amount: '',
    acquisition_route: '',
    inquiry_date: new Date().toISOString().substring(0, 10),
    notes: '',
    status: 'inquiry' as ProjectStatus,
  });

  const [error, setError] = useState('');

  const toggleWorkType = (wt: string) => {
    setForm((f) => ({
      ...f,
      work_type: f.work_type.includes(wt) ? f.work_type.filter((x) => x !== wt) : [...f.work_type, wt],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.customer_name || !form.address || !form.phone || form.work_type.length === 0) {
      setError('必須項目（顧客名・住所・電話番号・工事種別）を入力してください');
      return;
    }

    try {
      const supabase = createClient();
      if (!user?.id) {
        setError('ログイン情報が取得できません。再度ログインしてください。');
        return;
      }

      const { data: cust, error: custErr } = await supabase
        .from('m_customers')
        .insert({
          customer_name: form.customer_name,
          customer_name_kana: form.customer_name_kana || null,
          postal_code: form.postal_code || null,
          address: form.address,
          phone: form.phone,
          email: form.email || null,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (custErr) throw custErr;
      if (!cust?.id) throw new Error('顧客マスタの作成に失敗しました');

      try {
        const syncRes = await fetch('/api/sync-customer-drives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ customerId: cust.id }),
        });
        const syncJson = (await syncRes.json().catch(() => ({}))) as {
          success?: boolean;
          skipped?: boolean;
          error?: string;
        };
        if (!syncRes.ok) {
          console.warn('[new-project] sync-customer-drives HTTP', syncRes.status, syncJson);
        } else if (syncJson.success === false && !syncJson.skipped) {
          console.warn('[new-project] sync-customer-drives', syncJson.error ?? syncJson);
        }
      } catch (e) {
        console.error('[new-project] sync-customer-drives', e);
      }

      const addressQuery = [form.postal_code, form.address].filter(Boolean).join(' ').trim();
      const coords = await geocodeJapaneseAddress(addressQuery || form.address);

      const prospect = Number(form.prospect_amount) || 0;
      const est = Number(form.estimated_amount) || 0;
      const resolvedStatus =
        statusInferredFromAmounts(form.status, est, null) ?? form.status;

      const data = await createProject({
        customer_id: cust.id as string,
        customer_name: form.customer_name,
        customer_name_kana: form.customer_name_kana || undefined,
        project_title: form.project_title.trim() || undefined,
        postal_code: form.postal_code || undefined,
        address: form.address,
        phone: form.phone,
        email: form.email || undefined,
        work_description: form.work_description,
        work_type: form.work_type,
        prospect_amount: prospect,
        estimated_amount: est,
        acquisition_route: form.acquisition_route,
        assigned_to: user.id,
        inquiry_date: form.inquiry_date,
        notes: form.notes || undefined,
        status: resolvedStatus,
        thankyou_flag: false,
        followup_flag: false,
        inspection_flag: false,
        ...(coords ? { lat: coords[0], lng: coords[1] } : {}),
      });

      // ── LINE通知（fire-and-forget）──────────────────────────
      fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customer_name,
          address: form.address,
          workDescription: form.work_description || undefined,
          workType: form.work_type,
          prospectAmount: Number(form.prospect_amount) || 0,
          estimatedAmount: Number(form.estimated_amount) || 0,
          acquisitionRoute: form.acquisition_route,
          inquiryDate: form.inquiry_date,
          assignedUserName: user?.name ?? undefined,
          assignedLineUserId: user?.line_user_id ?? undefined,
        }),
      }).catch((e) => console.error('[new-project] line-notify error:', e));

      router.push(`/projects/${data.id}`);
    } catch (err) {
      setError('案件の登録に失敗しました: ' + String(err));
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="btn-secondary p-2">
          <span className="material-icons" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <h2 className="text-xl font-bold">新規案件登録</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 flex gap-2">
            <span className="material-icons text-red-400" style={{ fontSize: 18 }}>error</span>
            {error}
          </div>
        )}

        {/* 顧客情報 */}
        <div className="detail-section">
          <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>person</span> 顧客情報</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label>顧客名 <span className="required">*</span></label>
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                className="form-input"
                placeholder="氏名または会社名"
                required
              />
            </div>
            <div className="form-group">
              <label>顧客名（ふりがな）</label>
              <input
                type="text"
                value={form.customer_name_kana}
                onChange={(e) => setForm((f) => ({ ...f, customer_name_kana: e.target.value }))}
                className="form-input"
                placeholder="例: たなかたろう"
              />
            </div>
            <div className="form-group">
              <label>電話番号 <span className="required">*</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="form-input"
                placeholder="例: 06-1234-5678"
                required
              />
            </div>
            <div className="form-group">
              <label>メールアドレス</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="form-input"
                placeholder="例: tanaka@example.com"
              />
            </div>
            <div className="form-group">
              <label>郵便番号</label>
              <input
                type="text"
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                className="form-input"
                placeholder="例: 550-0001"
              />
            </div>
          </div>
          <div className="form-group">
            <label>住所 <span className="required">*</span></label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="form-input"
              placeholder="例: 大阪府大阪市西区..."
              required
            />
          </div>
        </div>

        {/* 工事情報 */}
        <div className="detail-section">
          <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>construction</span> 工事情報</h3>
          <div className="form-group">
            <label>案件名</label>
            <input
              type="text"
              value={form.project_title}
              onChange={(e) => setForm((f) => ({ ...f, project_title: e.target.value }))}
              className="form-input"
              placeholder="例：山田様邸 外壁・屋根塗装（Drive フォルダ名の優先ラベル）"
            />
          </div>
          <div className="form-group">
            <label>工事種別 <span className="required">*</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {workTypes.map((wt) => (
                <label key={wt} className="wt-chip">
                  <input
                    type="checkbox"
                    checked={form.work_type.includes(wt)}
                    onChange={() => toggleWorkType(wt)}
                  />
                  <span>{wt}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>工事内容</label>
            <textarea
              value={form.work_description}
              onChange={(e) => setForm((f) => ({ ...f, work_description: e.target.value }))}
              className="form-input"
              rows={3}
              placeholder="工事の詳細内容..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label>見込み金額（円）</label>
              <input
                type="number"
                value={form.prospect_amount}
                onChange={(e) => setForm((f) => ({ ...f, prospect_amount: e.target.value }))}
                className="form-input"
                placeholder="登録時のおおよその金額 例: 500000"
                min={0}
              />
              <p className="text-xs text-gray-500 mt-1">問い合わせ時点の概算です（万単位表示は一覧と同じ基準：円で入力）</p>
            </div>
            <div className="form-group">
              <label>見積金額（円）</label>
              <input
                type="number"
                value={form.estimated_amount}
                onChange={(e) => setForm((f) => ({ ...f, estimated_amount: e.target.value }))}
                className="form-input"
                placeholder="見積提示後に入力 未提示のままなら空欄"
                min={0}
              />
              <p className="text-xs text-gray-500 mt-1">正式な見積書を提示した金額。未入力のままでも登録できます</p>
            </div>
            <div className="form-group">
              <label>集客ルート</label>
              <select
                value={form.acquisition_route}
                onChange={(e) => setForm((f) => ({ ...f, acquisition_route: e.target.value }))}
                className="form-input"
              >
                <option value="">選択してください</option>
                {acquisitionRoutes.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>問い合わせ日</label>
              <input
                type="date"
                value={form.inquiry_date}
                onChange={(e) => setForm((f) => ({ ...f, inquiry_date: e.target.value }))}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>ステータス</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
                className="form-input"
              >
                {statusOptions.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>メモ・備考</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="form-input"
              rows={2}
              placeholder="特記事項など..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            キャンセル
          </button>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? (
              <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> 登録中...</>
            ) : (
              <><span className="material-icons" style={{ fontSize: 18 }}>save</span> 案件を登録</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
