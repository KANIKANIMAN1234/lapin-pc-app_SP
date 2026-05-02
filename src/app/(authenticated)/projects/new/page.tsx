'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import type { ProjectStatus } from '@/types';

type CustomerPickRow = {
  id: string;
  customer_number: string | null;
  customer_name: string;
  customer_name_kana: string | null;
  postal_code: string | null;
  address: string;
  phone: string;
  email: string | null;
};

type ProjectHistoryRow = {
  id: string;
  project_number: string | null;
  status: string;
  inquiry_date: string;
  work_description: string;
};

const PROJECT_STATUS_LABEL: Record<string, string> = {
  inquiry: '問い合わせ',
  estimate: '見積',
  followup_status: 'フォロー中',
  contract: '契約',
  in_progress: '施工中',
  completed: '完工',
  lost: '失注',
};

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
    postal_code: '',
    address: '',
    phone: '',
    email: '',
    work_description: '',
    work_type: [] as string[],
    estimated_amount: '',
    acquisition_route: '',
    inquiry_date: new Date().toISOString().substring(0, 10),
    notes: '',
    status: 'inquiry' as ProjectStatus,
  });

  const [customerMode, setCustomerMode] = useState<'new' | 'existing'>('new');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerNumber, setSelectedCustomerNumber] = useState<string | null>(null);
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerPickRow[]>([]);
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryRow[]>([]);

  const [error, setError] = useState('');

  const fetchProjectHistory = useCallback(async (customerId: string) => {
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from('t_projects')
      .select('id, project_number, status, inquiry_date, work_description')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('inquiry_date', { ascending: false })
      .limit(30);
    if (qErr) {
      console.error('[PC new-project] history', qErr);
      setProjectHistory([]);
      return;
    }
    setProjectHistory((data ?? []) as ProjectHistoryRow[]);
  }, []);

  useEffect(() => {
    if (customerMode !== 'existing') {
      setCustomerSuggestions([]);
      return;
    }
    const q = form.customer_name.trim();
    if (q.length < 1) {
      setCustomerSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data, error: sErr } = await supabase
        .from('m_customers')
        .select(
          'id, customer_number, customer_name, customer_name_kana, postal_code, address, phone, email',
        )
        .is('deleted_at', null)
        .or(`customer_name.ilike.%${q}%,customer_name_kana.ilike.%${q}%,customer_number.ilike.%${q}%`)
        .order('customer_name')
        .limit(20);
      if (sErr) {
        console.error('[PC new-project] customer search', sErr);
        setCustomerSuggestions([]);
        return;
      }
      setCustomerSuggestions((data ?? []) as CustomerPickRow[]);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [form.customer_name, customerMode]);

  const clearCustomerLink = () => {
    setSelectedCustomerId(null);
    setSelectedCustomerNumber(null);
    setProjectHistory([]);
  };

  const applyCustomerRow = (row: CustomerPickRow) => {
    setSelectedCustomerId(row.id);
    setSelectedCustomerNumber(row.customer_number);
    setForm((f) => ({
      ...f,
      customer_name: row.customer_name,
      customer_name_kana: row.customer_name_kana ?? '',
      postal_code: row.postal_code ?? '',
      address: row.address,
      phone: row.phone,
      email: row.email ?? '',
    }));
    void fetchProjectHistory(row.id);
  };

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
    if (customerMode === 'existing' && !selectedCustomerId) {
      setError('既存顧客の場合は、名前を入力して候補から顧客を選択してください');
      return;
    }

    try {
      const supabase = createClient();
      let customerIdToUse: string;

      if (customerMode === 'new') {
        const { data: newCust, error: cErr } = await supabase
          .from('m_customers')
          .insert({
            customer_name: form.customer_name,
            customer_name_kana: form.customer_name_kana || null,
            postal_code: form.postal_code || null,
            address: form.address,
            phone: form.phone,
            email: form.email || null,
            created_by: user?.id ?? null,
          })
          .select('id')
          .single();
        if (cErr) throw cErr;
        customerIdToUse = (newCust as { id: string }).id;
      } else {
        customerIdToUse = selectedCustomerId as string;
        const { error: uErr } = await supabase
          .from('m_customers')
          .update({
            customer_name: form.customer_name,
            customer_name_kana: form.customer_name_kana || null,
            postal_code: form.postal_code || null,
            address: form.address,
            phone: form.phone,
            email: form.email || null,
          })
          .eq('id', customerIdToUse);
        if (uErr) throw uErr;
      }

      const data = await createProject({
        customer_id: customerIdToUse,
        customer_name: form.customer_name,
        customer_name_kana: form.customer_name_kana || undefined,
        postal_code: form.postal_code || undefined,
        address: form.address,
        phone: form.phone,
        email: form.email || undefined,
        work_description: form.work_description,
        work_type: form.work_type,
        estimated_amount: Number(form.estimated_amount) || 0,
        acquisition_route: form.acquisition_route,
        assigned_to: user?.id ?? '',
        inquiry_date: form.inquiry_date,
        notes: form.notes || undefined,
        status: form.status,
        thankyou_flag: false,
        followup_flag: false,
        inspection_flag: false,
        created_by: user?.id ?? null,
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

          <div className="form-group mb-4">
            <label>登録区分</label>
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pcCustMode"
                  checked={customerMode === 'new'}
                  onChange={() => {
                    setCustomerMode('new');
                    clearCustomerLink();
                  }}
                />
                新規顧客（初回のご依頼）
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pcCustMode"
                  checked={customerMode === 'existing'}
                  onChange={() => {
                    setCustomerMode('existing');
                    clearCustomerLink();
                  }}
                />
                既存顧客（リピート・追加工事）…名前を入力し候補から選択
              </label>
            </div>
          </div>

          {customerMode === 'existing' && selectedCustomerNumber && (
            <p className="text-sm text-blue-700 font-medium mb-3">
              選択中の顧客管理番号: <span className="font-mono">{selectedCustomerNumber}</span>
              <button type="button" className="ml-3 text-xs text-gray-500 underline" onClick={clearCustomerLink}>
                選択を解除
              </button>
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group col-span-2">
              <label>顧客名 <span className="required">*</span></label>
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, customer_name: v }));
                  if (customerMode === 'existing' && selectedCustomerId) clearCustomerLink();
                }}
                className="form-input"
                placeholder="氏名または会社名"
                required
              />
              {customerMode === 'existing' && customerSuggestions.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
                  <p className="text-xs text-gray-500 px-3 py-2 border-b border-gray-100">候補（クリックで選択）</p>
                  <ul className="divide-y divide-gray-100">
                    {customerSuggestions.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
                          onClick={() => applyCustomerRow(row)}
                        >
                          <span className="font-medium">{row.customer_name}</span>
                          {row.customer_number && (
                            <span className="ml-2 text-xs font-mono text-blue-600">{row.customer_number}</span>
                          )}
                          <span className="block text-xs text-gray-500 truncate">{row.address}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {customerMode === 'existing' && selectedCustomerId && projectHistory.length > 0 && (
                <div className="mt-3 border border-amber-100 rounded-lg bg-amber-50/50 p-3">
                  <p className="text-xs font-bold text-amber-900 mb-2">同一顧客の工事履歴</p>
                  <ul className="space-y-1.5 text-xs max-h-40 overflow-y-auto">
                    {projectHistory.map((h) => (
                      <li key={h.id} className="text-gray-700 border-b border-amber-100/80 pb-1.5 last:border-0">
                        <span className="font-mono font-semibold">{h.project_number ?? '—'}</span>
                        <span className="mx-1">·</span>
                        {PROJECT_STATUS_LABEL[h.status] ?? h.status}
                        <span className="mx-1">·</span>
                        {h.inquiry_date}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
              <label>見積もり金額（円）</label>
              <input
                type="number"
                value={form.estimated_amount}
                onChange={(e) => setForm((f) => ({ ...f, estimated_amount: e.target.value }))}
                className="form-input"
                placeholder="例: 2500000"
                min={0}
              />
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
