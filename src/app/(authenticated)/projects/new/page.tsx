'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { useVoiceInput } from '@/hooks/useVoiceInput';

const WORK_TYPES_FALLBACK = ['外壁塗装', '屋根塗装', 'キッチン', '浴室', 'トイレ', '内装', '外構', 'その他'];
const ROUTES_FALLBACK = [
  'チラシ',
  'Web自然流入',
  'Web広告',
  '新聞',
  '紹介',
  'イベント',
  'OB施策',
  'OB顧客',
  'LINE',
];
const ROUTE_FOR_EXISTING_REPEAT = 'OB顧客';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function repeatRouteForExisting(routes: string[]): string {
  if (routes.includes(ROUTE_FOR_EXISTING_REPEAT)) return ROUTE_FOR_EXISTING_REPEAT;
  return routes[0] ?? '';
}

async function callFormatText(text: string, promptKey: string): Promise<string> {
  const res = await fetch('/api/format-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_text: text, prompt_key: promptKey }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'AI整形に失敗しました');
  return json.data?.formatted_text ?? text;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  line_user_id?: string | null;
}

interface CustomerHit {
  id: string;
  customer_number: string | null;
  customer_name: string;
  customer_name_kana: string | null;
  postal_code: string | null;
  address: string;
  phone: string;
  email: string | null;
}

interface FormState {
  customerName: string;
  customerNameKana: string;
  zip: string;
  address: string;
  phone: string;
  email: string;
  projectTitle: string;
  workDesc: string;
  workTypes: string[];
  amount: string;
  inquiryDate: string;
  route: string;
  assigned: string;
  memo: string;
}

interface ModalData extends FormState {
  assignedName: string;
  registrationKind: 'new' | 'existing';
  selectedCustomerId: string | null;
}

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const [workTypesMaster, setWorkTypesMaster] = useState<string[]>(WORK_TYPES_FALLBACK);
  const [acquisitionRoutes, setAcquisitionRoutes] = useState<string[]>(ROUTES_FALLBACK);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('m_settings')
      .select('key, value')
      .in('key', ['work_type_options', 'acquisition_route_options'])
      .then(({ data }) => {
        if (!data) return;
        data.forEach((row) => {
          try {
            const values: string[] = JSON.parse(row.value);
            if (!Array.isArray(values) || values.length === 0) return;
            if (row.key === 'work_type_options') setWorkTypesMaster(values);
            if (row.key === 'acquisition_route_options') setAcquisitionRoutes(values);
          } catch {
            /* デフォルト維持 */
          }
        });
      });
  }, []);

  const [form, setForm] = useState<FormState>({
    customerName: '',
    customerNameKana: '',
    zip: '',
    address: '',
    phone: '',
    email: '',
    projectTitle: '',
    workDesc: '',
    workTypes: [],
    amount: '',
    inquiryDate: todayStr(),
    route: '',
    assigned: '',
    memo: '',
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const employeesRef = useRef<Employee[]>([]);
  employeesRef.current = employees;

  const [registrationKind, setRegistrationKind] = useState<'new' | 'existing'>('new');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    isRecording: isRecordingDesc,
    voiceStatus,
    toggleVoice: handleVoiceToggle,
    transcribing: voiceTranscribing,
  } = useVoiceInput({
    currentText: form.workDesc,
    onTextUpdate: (text) => setForm((prev) => ({ ...prev, workDesc: text })),
    onError: (msg) => showToast(msg, 'error'),
  });

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('m_users')
          .select('id, name, role, line_user_id')
          .eq('status', 'active')
          .order('name');
        if (error) {
          console.error('[new-project] fetchEmployees', error);
          setEmployees([]);
          return;
        }
        setEmployees((data ?? []) as Employee[]);
      } catch (e) {
        console.error('[new-project] fetchEmployees', e);
        setEmployees([]);
      }
    }
    void fetchEmployees();
  }, []);

  useEffect(() => {
    if (registrationKind !== 'existing') {
      setCustomerHits([]);
      setCustomerSearchLoading(false);
      return;
    }
    const q = form.customerName.trim();
    if (q.length < 1) {
      setCustomerHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setCustomerSearchLoading(true);
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('m_customers')
            .select(
              'id, customer_number, customer_name, customer_name_kana, postal_code, address, phone, email'
            )
            .is('deleted_at', null)
            .ilike('customer_name', `%${q}%`)
            .order('customer_number', { ascending: false })
            .limit(25);
          if (error) throw error;
          setCustomerHits((data ?? []) as CustomerHit[]);
        } catch (e) {
          console.error('[new-project] customer search', e);
          setCustomerHits([]);
        } finally {
          setCustomerSearchLoading(false);
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [registrationKind, form.customerName]);

  const applyCustomerPick = (customerId: string) => {
    const c = customerHits.find((h) => h.id === customerId);
    if (!c) return;
    setSelectedCustomerId(customerId);
    setForm((prev) => ({
      ...prev,
      customerName: c.customer_name,
      customerNameKana: c.customer_name_kana ?? '',
      zip: c.postal_code ?? '',
      address: c.address,
      phone: c.phone,
      email: c.email ?? '',
      assigned: '',
      route: repeatRouteForExisting(acquisitionRoutes),
    }));
    void (async () => {
      try {
        const res = await fetch(
          `/api/customer-default-assigned?customerId=${encodeURIComponent(customerId)}`,
          { credentials: 'same-origin' }
        );
        if (!res.ok) return;
        const json = (await res.json()) as { assignedTo?: string | null };
        const aid = json.assignedTo?.trim();
        if (!aid) return;
        for (let i = 0; i < 25; i++) {
          if (employeesRef.current.some((e) => e.id === aid)) {
            setForm((prev) => ({ ...prev, assigned: aid! }));
            return;
          }
          await new Promise((r) => setTimeout(r, 120));
        }
      } catch (e) {
        console.error('[new-project] customer-default-assigned', e);
      }
    })();
  };

  const update = (field: keyof FormState, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleWorkType = (type: string) => {
    setForm((prev) => ({
      ...prev,
      workTypes: prev.workTypes.includes(type)
        ? prev.workTypes.filter((t) => t !== type)
        : [...prev.workTypes, type],
    }));
  };

  const validate = (): boolean => {
    if (registrationKind === 'existing') {
      if (!selectedCustomerId) {
        showToast('既存顧客をプルダウンから選択してください', 'error');
        return false;
      }
    } else if (!form.customerName) {
      showToast('顧客名を入力してください', 'error');
      return false;
    }
    if (!form.address) {
      showToast('住所を入力してください', 'error');
      return false;
    }
    if (!form.phone) {
      showToast('電話番号を入力してください', 'error');
      return false;
    }
    if (form.workTypes.length === 0) {
      showToast('工事種別を選択してください', 'error');
      return false;
    }
    if (!form.amount) {
      showToast('見込み金額を入力してください', 'error');
      return false;
    }
    if (!form.route) {
      showToast('取得経路を選択してください', 'error');
      return false;
    }
    return true;
  };

  const handleRegister = () => {
    if (!validate()) return;
    const assignedEmployee = employees.find((e) => e.id === form.assigned);
    setModalData({
      ...form,
      assignedName: assignedEmployee?.name ?? '',
      registrationKind,
      selectedCustomerId: registrationKind === 'existing' ? selectedCustomerId : null,
    });
    setShowModal(true);
  };

  const handleConfirmSend = async () => {
    if (!modalData) return;
    if (!user?.id) {
      showToast('ログイン情報が取得できません。再度ログインしてください。', 'error');
      return;
    }
    setSubmitting(true);
    setLoading(true);

    const resetAfterSuccess = () => {
      setShowModal(false);
      setRegistrationKind('new');
      setSelectedCustomerId(null);
      setCustomerHits([]);
      setForm({
        customerName: '',
        customerNameKana: '',
        zip: '',
        address: '',
        phone: '',
        email: '',
        projectTitle: '',
        workDesc: '',
        workTypes: [],
        amount: '',
        inquiryDate: todayStr(),
        route: '',
        assigned: '',
        memo: '',
      });
    };

    try {
      const regRes = await fetch('/api/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          registrationKind: modalData.registrationKind,
          selectedCustomerId: modalData.selectedCustomerId,
          customerName: modalData.customerName,
          customerNameKana: modalData.customerNameKana || null,
          postalCode: modalData.zip || null,
          address: modalData.address,
          phone: modalData.phone,
          email: modalData.email || null,
          projectTitle: modalData.projectTitle?.trim() || null,
          workDescription: modalData.workDesc || modalData.workTypes.join(','),
          workTypes: modalData.workTypes,
          estimatedAmount: Number(modalData.amount),
          acquisitionRoute: modalData.route,
          assignedTo: modalData.assigned || null,
          inquiryDate: modalData.inquiryDate,
          notes: modalData.memo || null,
        }),
      });
      const regJson = (await regRes.json()) as {
        success?: boolean;
        projectId?: string;
        customerId?: string;
        error?: string;
      };
      if (!regRes.ok || !regJson.success || !regJson.projectId) {
        showToast(regJson.error ?? `案件の登録に失敗しました (${regRes.status})`, 'error');
        return;
      }
      const projectId = regJson.projectId;

      const assignedEmployee = employees.find((e) => e.id === modalData.assigned);
      const amt = Number(modalData.amount);

      let lineOk = true;
      try {
        const notifyRes = await fetch('/api/line-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            customerName: modalData.customerName,
            address: modalData.address,
            projectTitle: modalData.projectTitle.trim() || undefined,
            workDescription: modalData.workDesc || undefined,
            workType: modalData.workTypes,
            prospectAmount: amt,
            estimatedAmount: amt,
            acquisitionRoute: modalData.route,
            inquiryDate: modalData.inquiryDate,
            assignedUserName: assignedEmployee?.name ?? undefined,
            assignedLineUserId: assignedEmployee?.line_user_id ?? undefined,
          }),
        });
        const notifyJson = (await notifyRes.json()) as { success?: boolean; error?: string };
        lineOk = notifyRes.ok && !!notifyJson.success;
        if (!lineOk) {
          console.warn('[new-project] line-notify', notifyJson.error ?? notifyRes.status);
        }
      } catch (notifyErr) {
        lineOk = false;
        console.error('[new-project] line-notify fetch error:', notifyErr);
      }

      let driveOk = true;
      let driveSkipped = false;
      try {
        const driveRes = await fetch('/api/setup-project-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            projectId,
            mode: modalData.registrationKind,
          }),
        });
        const driveJson = (await driveRes.json()) as {
          success?: boolean;
          skipped?: boolean;
          error?: string;
        };
        driveSkipped = !!driveJson.skipped;
        driveOk = !!(driveSkipped || (driveRes.ok && driveJson.success));
        if (!driveOk) {
          console.warn('[new-project] setup-project-drive', driveJson.error ?? driveRes.status);
        }
      } catch (driveErr) {
        driveOk = false;
        console.error('[new-project] setup-project-drive', driveErr);
      }

      const issues: string[] = [];
      if (!lineOk) issues.push('LINE通知');
      if (!driveOk && !driveSkipped) issues.push('Google Drive');

      if (issues.length === 0) {
        if (driveSkipped) {
          showToast('案件を登録・通知しました（Drive は未設定のためスキップ）', 'success');
        } else {
          showToast('案件を登録し、LINE 通知・フォルダ作成が完了しました', 'success');
        }
      } else {
        showToast(`案件を登録しました（${issues.join('・')}に失敗の可能性があります）`, 'error');
      }

      resetAfterSuccess();
    } catch (err) {
      console.error('[new-project] insert error:', err);
      showToast('案件の登録に失敗しました', 'error');
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  const roleLabel = (role: string) =>
    role === 'admin' ? '管理者' : role === 'sales' ? '営業' : role === 'staff' ? 'スタッフ' : role;

  return (
    <div className="max-w-3xl relative">
      {loading && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40"
          aria-busy="true"
        >
          <div className="bg-white rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
            <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
            <span className="text-sm font-medium text-gray-800">案件を登録中...</span>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[2100] px-4 py-3 rounded-xl shadow-lg text-sm text-white flex items-center gap-2 max-w-[90vw] ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          <span className="material-icons text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => router.back()} className="btn-secondary p-2">
          <span className="material-icons" style={{ fontSize: 20 }}>
            arrow_back
          </span>
        </button>
        <h2 className="text-xl font-bold">新規案件登録</h2>
      </div>

      {showModal && modalData && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full shadow-2xl overflow-hidden max-w-md max-h-[85vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="line-preview-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="material-icons text-green-600">chat</span>
                <p id="line-preview-title" className="font-bold text-gray-800">
                  LINE通知プレビュー
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-gray-100">
                <span className="material-icons text-gray-400">close</span>
              </button>
            </div>

            <div className="p-4">
              <p className="text-xs text-gray-500 mb-3">
                以下の内容が{modalData.assignedName ? '担当者と' : ''}管理者のLINEに送信されます。
              </p>

              <div className="flex gap-2 mb-4 flex-wrap">
                {modalData.assignedName && (
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-800">
                    <span className="material-icons text-xs">person</span>
                    {modalData.assignedName}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-900">
                  <span className="material-icons text-xs">shield</span>
                  管理者
                </span>
              </div>

              <div className="relative rounded-2xl p-4 text-sm leading-7 bg-green-50 border border-green-100">
                <p>
                  📋 <strong>新規案件登録</strong>
                </p>
                <p>
                  顧客名: {modalData.customerName}
                  {modalData.customerNameKana ? `（${modalData.customerNameKana}）` : ''}
                </p>
                <p>住所: {modalData.address}</p>
                <p>電話: {modalData.phone}</p>
                {modalData.projectTitle.trim() && <p>案件名: {modalData.projectTitle}</p>}
                {modalData.workDesc && <p>工事内容: {modalData.workDesc}</p>}
                <p>工事種別: {modalData.workTypes.join('・')}</p>
                <p>見込み金額: ¥{Number(modalData.amount).toLocaleString()}</p>
                <p>取得経路: {modalData.route}</p>
                <p>問い合わせ日: {modalData.inquiryDate}</p>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  className="flex-1 py-3 rounded-xl font-bold border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
                  onClick={() => setShowModal(false)}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="flex-1 btn-primary py-3 rounded-xl font-bold text-sm justify-center flex items-center gap-2"
                  onClick={handleConfirmSend}
                  disabled={submitting}
                >
                  <span className="material-icons text-base">send</span>
                  {submitting ? '登録中...' : '送信する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="detail-section mb-4">
        <h3>
          <span className="material-icons text-green-600" style={{ fontSize: 18 }}>
            person
          </span>{' '}
          顧客情報
        </h3>

        <div className="form-group">
          <label>登録区分</label>
          <select
            value={registrationKind}
            onChange={(e) => {
              const v = e.target.value as 'new' | 'existing';
              setRegistrationKind(v);
              if (v === 'new') {
                setSelectedCustomerId(null);
                setForm((prev) => ({ ...prev, assigned: '', route: '' }));
              } else {
                setForm((prev) => ({ ...prev, route: repeatRouteForExisting(acquisitionRoutes) }));
              }
            }}
            className="form-input"
          >
            <option value="new">新規顧客</option>
            <option value="existing">既存リピート</option>
          </select>
        </div>

        {registrationKind === 'existing' && (
          <div className="form-group">
            <label>顧客の選択（候補）</label>
            <select
              value={selectedCustomerId ?? ''}
              onChange={(e) => applyCustomerPick(e.target.value)}
              className="form-input"
              disabled={customerHits.length === 0 && !customerSearchLoading}
            >
              <option value="">
                {customerSearchLoading
                  ? '検索中…'
                  : customerHits.length === 0
                    ? '氏名を入力すると候補が表示されます'
                    : '候補から選択してください'}
              </option>
              {customerHits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_number ?? ''} {c.customer_name} — {c.address.slice(0, 28)}
                  {c.address.length > 28 ? '…' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">選択すると住所・電話などが自動入力されます。</p>
          </div>
        )}

        <div className="form-group">
          <label>
            顧客名 <span className="required">*</span>
          </label>
          <input
            type="text"
            value={form.customerName}
            onChange={(e) => update('customerName', e.target.value)}
            className="form-input"
            placeholder="氏名または会社名"
          />
        </div>

        <div className="form-group">
          <label>顧客名（カナ）</label>
          <input
            type="text"
            value={form.customerNameKana}
            onChange={(e) => update('customerNameKana', e.target.value)}
            className="form-input"
            placeholder="カナ（任意）"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="form-group">
            <label>郵便番号</label>
            <input
              type="text"
              value={form.zip}
              onChange={(e) => update('zip', e.target.value)}
              className="form-input"
              placeholder="530-0001"
            />
          </div>
          <div className="form-group sm:col-span-2">
            <label>
              住所 <span className="required">*</span>
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              className="form-input"
              placeholder="大阪府大阪市北区..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group">
            <label>
              電話番号 <span className="required">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="form-input"
              placeholder="06-1234-5678"
            />
          </div>
          <div className="form-group">
            <label>メール</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="form-input"
              placeholder="sample@mail.com"
            />
          </div>
        </div>
      </div>

      <div className="detail-section mb-4">
        <h3>
          <span className="material-icons text-green-600" style={{ fontSize: 18 }}>
            assignment
          </span>{' '}
          案件情報
        </h3>

        <div className="form-group">
          <label>案件名</label>
          <input
            type="text"
            value={form.projectTitle}
            onChange={(e) => update('projectTitle', e.target.value)}
            className="form-input"
            placeholder="例：山田様邸 外壁・屋根塗装"
          />
          <p className="text-xs text-gray-500 mt-1">
            未入力の場合は、工事種別・工事内容から Google Drive のフォルダ名が自動で付きます。
          </p>
        </div>

        <div className="form-group">
          <label>
            工事種別 <span className="required">*</span>（複数選択可）
          </label>
          <div className="flex flex-wrap gap-2 mt-1">
            {workTypesMaster.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleWorkType(type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  form.workTypes.includes(type)
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>工事内容</label>
          <div className="relative">
            <textarea
              rows={3}
              value={form.workDesc}
              onChange={(e) => update('workDesc', e.target.value)}
              className="form-input"
              placeholder="工事の概要を入力（音声入力可）"
              style={{ paddingRight: 48 }}
            />
            <button
              type="button"
              className={`absolute top-2 right-2 flex items-center justify-center rounded-full ${
                isRecordingDesc
                  ? 'bg-red-500 animate-pulse'
                  : voiceTranscribing
                    ? 'bg-blue-400'
                    : 'bg-gray-500'
              }`}
              style={{ width: 36, height: 36 }}
              onClick={handleVoiceToggle}
              disabled={voiceTranscribing}
              aria-label="音声入力"
            >
              {voiceTranscribing ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-icons text-white text-lg">
                  {isRecordingDesc ? 'stop' : 'mic'}
                </span>
              )}
            </button>
          </div>
          {voiceStatus && (
            <p
              className={`text-xs mt-1 ${
                isRecordingDesc
                  ? 'text-red-600 font-semibold'
                  : voiceTranscribing
                    ? 'text-blue-600 font-semibold'
                    : 'text-gray-500'
              }`}
            >
              {voiceStatus}
            </p>
          )}
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-purple-200 text-purple-700 text-sm font-medium hover:bg-purple-50 disabled:opacity-50"
            onClick={async () => {
              if (!form.workDesc.trim()) {
                showToast('整形する文章がありません', 'error');
                return;
              }
              setFormatting(true);
              try {
                const result = await callFormatText(form.workDesc, 'admin_project_desc');
                update('workDesc', result);
                showToast('AI整形しました', 'success');
              } catch {
                showToast('AI整形に失敗しました', 'error');
              }
              setFormatting(false);
            }}
            disabled={formatting}
          >
            <span className="material-icons text-base text-purple-600">auto_fix_high</span>
            {formatting ? 'AI整形中...' : 'AI整形'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group">
            <label>
              見込み金額（円）<span className="required">*</span>
            </label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              className="form-input"
              placeholder="1500000"
              inputMode="numeric"
              min={0}
            />
          </div>
          <div className="form-group">
            <label>
              問い合わせ日 <span className="required">*</span>
            </label>
            <input
              type="date"
              value={form.inquiryDate}
              onChange={(e) => update('inquiryDate', e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-group">
          <label>
            取得経路 <span className="required">*</span>
          </label>
          <select
            value={form.route}
            onChange={(e) => update('route', e.target.value)}
            className="form-input"
          >
            <option value="">選択してください</option>
            {acquisitionRoutes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="detail-section mb-4" style={{ background: '#eff6ff' }}>
        <h3 style={{ color: '#2563eb', borderBottomColor: '#bfdbfe' }}>
          <span className="material-icons" style={{ color: '#2563eb', fontSize: 18 }}>
            person_add
          </span>{' '}
          担当者割り当て
        </h3>

        <div className="form-group">
          <select
            value={form.assigned}
            onChange={(e) => update('assigned', e.target.value)}
            className="form-input"
          >
            <option value="">自分が担当</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}（{roleLabel(emp.role)}）
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-blue-700">※ 登録すると担当者にLINE通知が送信されます</p>
        {registrationKind === 'existing' && (
          <p className="text-xs mt-2 text-gray-600 leading-relaxed">
            既存顧客では、直近の案件の担当者を自動で選びます（プルダウンで変更できます）。
          </p>
        )}
      </div>

      <div className="detail-section mb-6">
        <div className="form-group mb-0">
          <label>備考</label>
          <textarea
            rows={2}
            value={form.memo}
            onChange={(e) => update('memo', e.target.value)}
            className="form-input"
            placeholder="その他メモ"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-8">
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleRegister}
          disabled={submitting}
          className="btn-primary inline-flex items-center gap-2"
        >
          <span className="material-icons text-lg">send</span>
          案件を登録して通知する
        </button>
      </div>
    </div>
  );
}
