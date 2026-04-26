'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import type { ProjectStatus } from '@/types';

const WORK_TYPES = ['外壁塗装', '屋根塗装', '防水工事', '内装工事', 'リフォーム', 'その他'];
const ACQUISITION_ROUTES = ['チラシ', '紹介', 'Web', 'LINE', '訪問', 'その他'];

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { mutateAsync: createProject, isPending } = useCreateProject();

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
      const data = await createProject({
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
      });
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
                placeholder="例: 田中太郎"
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
            <label>工事種別 <span className="required">*</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {WORK_TYPES.map((wt) => (
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
                {ACQUISITION_ROUTES.map((r) => (
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
                <option value="inquiry">問い合わせ</option>
                <option value="estimate">見積もり</option>
                <option value="followup_status">追客中</option>
                <option value="contract">契約</option>
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
