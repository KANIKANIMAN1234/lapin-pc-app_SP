'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { statusInferredFromAmounts } from '@/lib/projectStatusFromAmounts';
import { useProject, useUpdateProject } from '@/hooks/useProjects';
import { usePhotos, useDeletePhoto } from '@/hooks/usePhotos';
import { useAuthStore } from '@/stores/authStore';
import type { Photo, ProjectStatus } from '@/types';
import { EstimateRegisterButton } from '@/components/projects/EstimateRegisterButton';

// ─── 定数 ───────────────────────────────────────────────────────
const DEFAULT_STATUS_LIST: { value: ProjectStatus; label: string }[] = [
  { value: 'inquiry',        label: '問い合わせ' },
  { value: 'estimate',       label: '見積もり' },
  { value: 'followup_status', label: '追客中' },
  { value: 'contract',       label: '契約' },
  { value: 'in_progress',    label: '施工中' },
  { value: 'completed',      label: '完成' },
  { value: 'lost',           label: '失注' },
];

const STATUS_CSS: Record<string, string> = {
  inquiry:        'status-inquiry',
  estimate:       'status-estimate',
  followup_status:'status-followup_status',
  contract:       'status-contract',
  in_progress:    'status-in_progress',
  completed:      'status-completed',
  lost:           'status-lost',
};

const PHOTO_TYPE_LABELS: Record<Photo['type'], string> = {
  before: '施工前',
  inspection: '現調',
  undercoat: '下塗り',
  completed: '完成',
};

const MEETING_TYPES = ['初回商談', '現地調査', '見積提出', '契約', '工事確認', '完工確認', 'その他'];

const BUDGET_CATEGORIES = ['材料費', '労務費', '外注費', '経費', 'その他'] as const;

const EXPENSE_STATUS_LABEL: Record<string, string> = {
  pending: '未処理',
  approved: '取込済',
  rejected: '却下',
};

// ─── ヘルパー ────────────────────────────────────────────────────
function fmt(v: number | null | undefined) {
  if (v == null) return '-';
  return v >= 10000 ? `${Math.floor(v / 10000).toLocaleString()}万円` : `${v.toLocaleString()}円`;
}
/** 基本情報・金額情報用: 円を万円単位で小数第1位、「万」のみ */
function fmtMan(v: number | null | undefined) {
  if (v == null) return '-';
  const man = Number(v) / 10000;
  return `${man.toFixed(1)}万`;
}
function fmtDate(d: string | null | undefined) {
  return d ? String(d).substring(0, 10) : '-';
}
/** 月初日保存の DATE を YYYY年MM月 で表示 */
function fmtYearMonth(d: string | null | undefined) {
  if (!d) return '-';
  const s = String(d).substring(0, 7);
  if (s.length < 7) return '-';
  return `${s.slice(0, 4)}年${s.slice(5, 7)}月`;
}
function meetingBadge(type: string) {
  const map: Record<string, string> = {
    '初回商談': 'bg-blue-50 text-blue-700',
    '現地調査': 'bg-cyan-50 text-cyan-700',
    '見積提出': 'bg-yellow-50 text-yellow-700',
    '契約': 'bg-green-50 text-green-700',
    '工事確認': 'bg-purple-50 text-purple-700',
    '完工確認': 'bg-emerald-50 text-emerald-700',
  };
  return map[type] ?? 'bg-gray-100 text-gray-700';
}

// ─── サブコンポーネント ──────────────────────────────────────────
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-item">
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

// ─── メインページ ────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const projectId = params.id as string;

  const { data: project, isLoading } = useProject(projectId);
  const { data: photos } = usePhotos(projectId);
  const { mutateAsync: updateProject, isPending: isUpdating } = useUpdateProject();
  const { mutateAsync: deletePhoto } = useDeletePhoto();

  const [activeTab, setActiveTab] = useState<'info' | 'photos' | 'budget' | 'meetings' | 'reports'>('info');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // m_settings からステータス一覧を動的取得
  const [statusList, setStatusList] = useState(DEFAULT_STATUS_LIST);
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('m_settings')
      .select('value')
      .eq('key', 'project_status_options')
      .single()
      .then(({ data }) => {
        if (!data?.value) return;
        try {
          const parsed: string[] = JSON.parse(data.value);
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const list = parsed.map((item) => {
            const idx = item.indexOf(':');
            if (idx === -1) return { value: item as ProjectStatus, label: item };
            return { value: item.slice(0, idx) as ProjectStatus, label: item.slice(idx + 1) };
          });
          setStatusList(list);
        } catch { /* パース失敗時はデフォルト値を維持 */ }
      });
  }, []);
  const statusLabelMap = Object.fromEntries(statusList.map((s) => [s.value, s.label]));

  // 編集状態
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingBasic, setEditingBasic] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string | number>>({});
  const [editWorkType, setEditWorkType] = useState<string[]>([]);

  // 担当者・工事種別・集客ルートの選択肢
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [workTypeOptions, setWorkTypeOptions] = useState<string[]>(['外壁塗装', '屋根塗装', '水回り', '内装', '外構', 'その他']);
  const [acqRouteOptions, setAcqRouteOptions] = useState<string[]>(['紹介', 'チラシ', '看板', 'インターネット', 'その他']);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('m_settings').select('value').eq('key', 'work_type_options').single()
      .then(({ data }) => {
        if (data?.value) { try { const p = JSON.parse(data.value); if (Array.isArray(p) && p.length) setWorkTypeOptions(p); } catch {} }
      });
    supabase.from('m_settings').select('value').eq('key', 'acquisition_route_options').single()
      .then(({ data }) => {
        if (data?.value) { try { const p = JSON.parse(data.value); if (Array.isArray(p) && p.length) setAcqRouteOptions(p); } catch {} }
      });
    supabase.from('m_users').select('id, name').eq('status', 'active')
      .then(({ data, error }) => { if (data) setUsers(data); else console.error('m_users fetch error:', error); });
  }, []);

  // 写真
  const [selectedPhotoType, setSelectedPhotoType] = useState<Photo['type']>('before');
  const [isUploading, setIsUploading] = useState(false);

  // 商談モーダル
  const [meetingModal, setMeetingModal] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    meeting_date: new Date().toISOString().substring(0, 10),
    meeting_type: '初回商談',
    summary: '',
    next_actions: '',
  });

  // 原価モーダル
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    item: '',
    item_category: '材料費' as (typeof BUDGET_CATEGORIES)[number],
    planned_vendor: '',
    planned_amount: '',
    actual_amount: '',
  });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 2500);
  };

  // ── ステータス変更 ──
  const handleStatusChange = async (status: ProjectStatus) => {
    await updateProject({ id: projectId, status });
    setEditingStatus(false);
    showToast('ステータスを更新しました');
  };

  // ── 基本情報編集 ──
  const startEdit = () => {
    if (!project) return;
    setEditForm({
      customer_name:   project.customer_name ?? '',
      phone:           project.phone ?? '',
      address:         project.address ?? '',
      work_description: project.work_description ?? '',
      acquisition_route: project.acquisition_route ?? '',
      inquiry_date:    project.inquiry_date  ? String(project.inquiry_date).substring(0, 10)  : '',
      estimate_date:   project.estimate_date ? String(project.estimate_date).substring(0, 10) : '',
      contract_date:   project.contract_date ? String(project.contract_date).substring(0, 10) : '',
      start_date:      project.start_date    ? String(project.start_date).substring(0, 10)    : '',
      completion_date: project.completion_date ? String(project.completion_date).substring(0, 10) : '',
      estimated_amount: project.estimated_amount ?? 0,
      prospect_amount: project.prospect_amount ?? 0,
      contract_amount:  project.contract_amount ?? 0,
      notes:           project.notes ?? '',
      assigned_to:     project.assigned_to ?? '',
      implementation_period: project.implementation_period ?? '',
      expected_order_month: project.expected_order_month
        ? String(project.expected_order_month).substring(0, 7)
        : '',
      expected_revenue_month: project.expected_revenue_month
        ? String(project.expected_revenue_month).substring(0, 7)
        : '',
    });
    setEditWorkType(project.work_type ?? []);
    setEditingBasic(true);
  };

  const saveEdit = async () => {
    if (!project) return;
    try {
      const updates = {
        ...editForm,
        work_type: editWorkType,
        inquiry_date:    String(editForm.inquiry_date    || ''),
        estimate_date:   editForm.estimate_date ? String(editForm.estimate_date) : null,
        contract_date:   editForm.contract_date   ? String(editForm.contract_date)   : undefined,
        start_date:      editForm.start_date      ? String(editForm.start_date)      : undefined,
        completion_date: editForm.completion_date ? String(editForm.completion_date) : undefined,
        estimated_amount: Number(editForm.estimated_amount) || 0,
        prospect_amount: Number(editForm.prospect_amount) || 0,
        contract_amount:  editForm.contract_amount !== '' && editForm.contract_amount != null
          ? Number(editForm.contract_amount)
          : undefined,
        implementation_period: String(editForm.implementation_period ?? '').trim() || null,
        expected_order_month: editForm.expected_order_month
          ? `${String(editForm.expected_order_month)}-01`
          : null,
        expected_revenue_month: editForm.expected_revenue_month
          ? `${String(editForm.expected_revenue_month)}-01`
          : null,
      };
      const inferred = statusInferredFromAmounts(
        project.status,
        editForm.estimated_amount,
        editForm.contract_amount
      );
      await updateProject({
        id: projectId,
        ...updates,
        ...(inferred ? { status: inferred } : {}),
      });
      setEditingBasic(false);
      showToast('基本情報を更新しました');
    } catch (e) {
      showToast('保存に失敗しました: ' + String(e), 'error');
    }
  };

  // ── 写真アップロード ──
  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setIsUploading(true);
    try {
      const supabase = createClient();
      const reader = new FileReader();
      reader.onloadend = async () => {
        // file_id / drive_url は将来の Drive 連携で上書き予定
        // 現時点では仮のプレースホルダーで登録
        const fakeFileId = `local_${Date.now()}`;
        const { error } = await supabase.from('t_photos').insert({
          project_id: projectId,
          type: selectedPhotoType,
          file_id: fakeFileId,
          drive_url: reader.result as string,
          thumbnail_url: reader.result as string,
          file_name: file.name,
          file_size: file.size,
          uploaded_by: user.id,
        });
        if (error) showToast('アップロードに失敗しました', 'error');
        else {
          showToast('写真を追加しました');
          queryClient.invalidateQueries({ queryKey: ['photos', projectId] });
        }
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      showToast('アップロードに失敗しました', 'error');
      setIsUploading(false);
    }
    e.target.value = '';
  }, [projectId, selectedPhotoType, user?.id, queryClient]);

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('この写真を削除しますか？')) return;
    await deletePhoto({ photoId, projectId });
    showToast('写真を削除しました');
  };

  // ── 商談記録 ──
  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings', projectId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_meetings')
        .select(`id, meeting_date, meeting_type, summary, next_actions, m_users!recorded_by(name)`)
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('meeting_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: activeTab === 'meetings',
  });

  const createMeeting = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('未ログイン');
      const supabase = createClient();
      const { error } = await supabase.from('t_meetings').insert({
        project_id: projectId,
        meeting_date: meetingForm.meeting_date,
        meeting_type: meetingForm.meeting_type,
        summary: meetingForm.summary,
        next_actions: meetingForm.next_actions ? [meetingForm.next_actions] : [],
        recorded_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', projectId] });
      setMeetingModal(false);
      setMeetingForm({ meeting_date: new Date().toISOString().substring(0, 10), meeting_type: '初回商談', summary: '', next_actions: '' });
      showToast('商談記録を保存しました');
    },
    onError: (e) => showToast('保存に失敗しました: ' + String(e), 'error'),
  });

  // ── 原価（budgets）──
  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', projectId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_budgets')
        .select('id, item, item_category, planned_amount, planned_vendor, actual_amount, actual_vendor, notes')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });

  const { data: projectExpenses = [] } = useQuery({
    queryKey: ['project-expenses', projectId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_expenses')
        .select(
          'id, expense_date, category, amount, memo, status, m_users!t_expenses_user_id_fkey(name)'
        )
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false });
      if (error) throw error;
      type JoinUser = { name: string } | { name: string }[] | null | undefined;
      return (data ?? []).map((row) => {
        const r = row as {
          id: string;
          expense_date: string;
          category: string;
          amount: number;
          memo: string | null;
          status: string;
          m_users: JoinUser;
        };
        const u = r.m_users;
        const m_users: { name: string } | null = Array.isArray(u) ? u[0] ?? null : u ?? null;
        return { ...r, m_users };
      });
    },
    enabled: !!projectId,
  });

  const createBudget = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase.from('t_budgets').insert({
        project_id: projectId,
        item: budgetForm.item,
        item_category: budgetForm.item_category,
        planned_vendor: budgetForm.planned_vendor || null,
        planned_amount: Number(budgetForm.planned_amount) || 0,
        actual_amount: budgetForm.actual_amount ? Number(budgetForm.actual_amount) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setBudgetModal(false);
      setBudgetForm({ item: '', item_category: '材料費', planned_vendor: '', planned_amount: '', actual_amount: '' });
      showToast('原価明細を追加しました');
    },
    onError: (e) => showToast('追加に失敗しました: ' + String(e), 'error'),
  });

  const totalPlanned = budgets.reduce((s, b) => s + Number(b.planned_amount ?? 0), 0);
  const totalActualBudgets = budgets.reduce((s, b) => s + Number(b.actual_amount ?? 0), 0);
  const expenseSumForActual = projectExpenses
    .filter((e) => e.status === 'pending' || e.status === 'approved')
    .reduce((s, e) => s + Number(e.amount ?? 0), 0);
  /** 予算の実績合計＋経費（DBトリガと同じ定義。画面上の実際原価合計の主表示） */
  const totalActualDisplayed = totalActualBudgets + expenseSumForActual;

  // ── 日報 ──
  const { data: reports = [] } = useQuery({
    queryKey: ['reports', projectId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_reports')
        .select(`id, report_date, title, content, achievements, issues, next_actions, submitted_at, m_users!user_id(name)`)
        .is('deleted_at', null)
        .order('report_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: activeTab === 'reports',
  });

  const [reportDetail, setReportDetail] = useState<(typeof reports)[0] | null>(null);

  // ── ローディング・エラー ──
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p></div>;
  }
  if (!project) {
    return (
      <div className="text-center py-16 text-gray-400">
        <span className="material-icons text-5xl mb-2">error_outline</span>
        <p>案件が見つかりません</p>
        <button onClick={() => router.push('/projects')} className="btn-secondary mt-4">一覧に戻る</button>
      </div>
    );
  }

  const contractAmount = Number(project.contract_amount ?? 0);
  const grossFromActual =
    contractAmount > 0 ? contractAmount - totalActualDisplayed : null;
  const grossProfit = Number(project.gross_profit ?? 0);
  const grossProfitRate = Number(project.gross_profit_rate ?? 0);
  const filteredPhotos = photos?.filter((p) => p.type === selectedPhotoType) ?? [];

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-secondary p-2">
            <span className="material-icons" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{project.customer_name}</h2>
              <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{project.project_number}</span>
            </div>
            <p className="text-sm text-gray-500">{project.address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editingStatus ? (
            <select
              className="form-input text-sm"
              defaultValue={project.status}
              onChange={(e) => handleStatusChange(e.target.value as ProjectStatus)}
              onBlur={() => setEditingStatus(false)}
              autoFocus
              disabled={isUpdating}
            >
              {statusList.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          ) : (
            <button onClick={() => setEditingStatus(true)} className={`badge ${STATUS_CSS[project.status] ?? 'status-inquiry'} cursor-pointer`}>
              {statusLabelMap[project.status] ?? project.status} ▾
            </button>
          )}
          {project.drive_folder_url && (
            <a href={project.drive_folder_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 px-3">
              <span className="material-icons" style={{ fontSize: 16 }}>folder</span>Drive
            </a>
          )}
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {([
          { id: 'info', label: '基本情報', icon: 'info' },
          { id: 'photos', label: `写真 (${photos?.length ?? 0})`, icon: 'photo_library' },
          { id: 'budget', label: '原価', icon: 'receipt_long' },
          { id: 'meetings', label: `商談 (${meetings.length})`, icon: 'forum' },
          { id: 'reports', label: '日報', icon: 'description' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="material-icons" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════ 基本情報 ══════════ */}
      {activeTab === 'info' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <EstimateRegisterButton
              project={{
                id: project.id,
                project_number: project.project_number,
                customer_name: project.customer_name,
                work_description: project.work_description,
                project_title: project.project_title ?? null,
                drive_folder_id: project.drive_folder_id ?? null,
              }}
              onToast={showToast}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['project', projectId] });
              }}
            />
            <div className="flex gap-2">
              {editingBasic ? (
                <>
                  <button onClick={() => setEditingBasic(false)} className="btn-secondary text-sm">キャンセル</button>
                  <button onClick={saveEdit} className="btn-primary text-sm" disabled={isUpdating}>
                    {isUpdating ? '保存中...' : '保存'}
                  </button>
                </>
              ) : (
                <button onClick={startEdit} className="btn-secondary text-sm">
                  <span className="material-icons text-base">edit</span>編集
                </button>
              )}
            </div>
          </div>

          {/* 3列レイアウト */}
          <div className="grid grid-cols-3 gap-3">

            {/* ── 列1: 顧客情報 + 担当者 ── */}
            <div className="detail-section" style={{ padding: '1rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>
                <span className="material-icons text-green-600" style={{ fontSize: 16 }}>person</span> 顧客情報
              </h3>
              <InfoRow label="管理番号">{project.project_number}</InfoRow>
              <InfoRow label="顧客名">
                {editingBasic
                  ? <input className="form-input w-full" value={String(editForm.customer_name ?? '')} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })} />
                  : `${project.customer_name}（${project.customer_name_kana || '-'}）`}
              </InfoRow>
              <InfoRow label="電話番号">
                {editingBasic
                  ? <input className="form-input w-full" value={String(editForm.phone ?? '')} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                  : project.phone ? <a href={`tel:${project.phone}`} className="text-green-600 hover:underline">{project.phone}</a> : '-'}
              </InfoRow>
              <InfoRow label="住所">
                {editingBasic
                  ? <input className="form-input w-full" value={String(editForm.address ?? '')} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                  : project.address || '-'}
              </InfoRow>
              <InfoRow label="担当者">
                {editingBasic
                  ? (
                    <select className="form-input w-full" value={String(editForm.assigned_to ?? '')} onChange={(e) => setEditForm({ ...editForm, assigned_to: e.target.value })}>
                      <option value="">未設定</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  )
                  : (() => {
                      const assignee = users.find((u) => u.id === project.assigned_to);
                      return assignee
                        ? <span className="inline-flex items-center gap-1"><span className="material-icons text-gray-400" style={{ fontSize: 14 }}>person</span>{assignee.name}</span>
                        : <span className="text-gray-400 text-xs">未設定</span>;
                    })()}
              </InfoRow>
              {/* メモ（下部に配置） */}
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem' }}>
                <div className="flex items-center gap-1 mb-1">
                  <span className="material-icons text-green-600" style={{ fontSize: 14 }}>notes</span>
                  <span className="text-xs font-bold text-gray-700">メモ・備考</span>
                </div>
                {editingBasic ? (
                  <textarea
                    className="form-input w-full text-sm"
                    rows={4}
                    value={String(editForm.notes ?? '')}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="自由記述..."
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap text-gray-700">{project.notes || '（なし）'}</p>
                )}
              </div>
            </div>

            {/* ── 列2: 工事情報 ── */}
            <div className="detail-section" style={{ padding: '1rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>
                <span className="material-icons text-green-600" style={{ fontSize: 16 }}>construction</span> 工事情報
              </h3>
              <InfoRow label="工事種別">
                {editingBasic ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {workTypeOptions.map((wt) => (
                      <label key={wt} className="flex items-center gap-0.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editWorkType.includes(wt)}
                          onChange={(e) =>
                            setEditWorkType(e.target.checked
                              ? [...editWorkType, wt]
                              : editWorkType.filter((w) => w !== wt))
                          }
                          style={{ accentColor: '#16a34a' }}
                        />
                        {wt}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-1 flex-wrap">
                    {(project.work_type ?? []).length > 0
                      ? (project.work_type ?? []).map((w: string) => (
                          <span key={w} className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded">{w}</span>
                        ))
                      : <span className="text-gray-400 text-xs">未設定</span>}
                  </div>
                )}
              </InfoRow>
              <InfoRow label="工事内容">
                {editingBasic
                  ? <input className="form-input w-full" value={String(editForm.work_description ?? '')} onChange={(e) => setEditForm({ ...editForm, work_description: e.target.value })} />
                  : project.work_description || '-'}
              </InfoRow>
              <InfoRow label="集客ルート">
                {editingBasic ? (
                  <select className="form-input w-full" value={String(editForm.acquisition_route ?? '')} onChange={(e) => setEditForm({ ...editForm, acquisition_route: e.target.value })}>
                    <option value="">未設定</option>
                    {acqRouteOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  project.acquisition_route
                    ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">{project.acquisition_route}</span>
                    : '-'
                )}
              </InfoRow>
              <InfoRow label="問い合わせ日">
                {editingBasic
                  ? <input type="date" className="form-input w-full" value={String(editForm.inquiry_date ?? '')} onChange={(e) => setEditForm({ ...editForm, inquiry_date: e.target.value })} />
                  : fmtDate(project.inquiry_date)}
              </InfoRow>
              <InfoRow label="契約日">
                {editingBasic
                  ? <input type="date" className="form-input w-full" value={String(editForm.contract_date ?? '')} onChange={(e) => setEditForm({ ...editForm, contract_date: e.target.value })} />
                  : fmtDate(project.contract_date)}
              </InfoRow>
              <InfoRow label="着工日">
                {editingBasic
                  ? <input type="date" className="form-input w-full" value={String(editForm.start_date ?? '')} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
                  : fmtDate(project.start_date)}
              </InfoRow>
              <InfoRow label="完工日">
                {editingBasic
                  ? <input type="date" className="form-input w-full" value={String(editForm.completion_date ?? '')} onChange={(e) => setEditForm({ ...editForm, completion_date: e.target.value })} />
                  : fmtDate(project.completion_date)}
              </InfoRow>
            </div>

            {/* ── 列3: 金額情報 ── */}
            <div className="detail-section" style={{ padding: '1rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>
                <span className="material-icons text-green-600" style={{ fontSize: 16 }}>payments</span> 金額情報
              </h3>
              <p className="text-xs text-gray-500 mb-3 leading-relaxed border-l-2 border-emerald-200 pl-2.5">
                原価合計は<strong className="text-gray-600">自動</strong>です（予算タブの実績＋登録経費）。
                契約金額は契約が決まったら入力。見積PDF登録は<strong className="text-gray-600">見積金額だけ</strong>埋まります。
              </p>
              <InfoRow label="見込み金額（概算）">
                {editingBasic
                  ? <input type="number" className="form-input w-full" value={editForm.prospect_amount ?? 0} onChange={(e) => setEditForm({ ...editForm, prospect_amount: Number(e.target.value) })} />
                  : fmtMan(project.prospect_amount)}
              </InfoRow>
              <InfoRow label="見積提示日">
                {editingBasic
                  ? <input type="date" className="form-input w-full" value={String(editForm.estimate_date ?? '')} onChange={(e) => setEditForm({ ...editForm, estimate_date: e.target.value })} />
                  : fmtDate(project.estimate_date)}
              </InfoRow>
              <InfoRow label="見積金額（提示後）">
                {editingBasic
                  ? <input type="number" className="form-input w-full" value={editForm.estimated_amount ?? 0} onChange={(e) => setEditForm({ ...editForm, estimated_amount: Number(e.target.value) })} />
                  : fmtMan(project.estimated_amount)}
              </InfoRow>
              <InfoRow label="実施時期（予定）">
                {editingBasic
                  ? (
                    <input
                      type="text"
                      className="form-input w-full"
                      placeholder="例: 2026年春〜夏、3月着工予定 など"
                      value={String(editForm.implementation_period ?? '')}
                      onChange={(e) => setEditForm({ ...editForm, implementation_period: e.target.value })}
                    />
                  )
                  : (project.implementation_period?.trim() ? project.implementation_period : '-')}
              </InfoRow>
              <InfoRow label="受注予定月">
                {editingBasic
                  ? <input type="month" className="form-input w-full" value={String(editForm.expected_order_month ?? '')} onChange={(e) => setEditForm({ ...editForm, expected_order_month: e.target.value })} />
                  : fmtYearMonth(project.expected_order_month)}
              </InfoRow>
              <InfoRow label="売上（完工）予定月">
                {editingBasic
                  ? <input type="month" className="form-input w-full" value={String(editForm.expected_revenue_month ?? '')} onChange={(e) => setEditForm({ ...editForm, expected_revenue_month: e.target.value })} />
                  : fmtYearMonth(project.expected_revenue_month)}
              </InfoRow>
              <InfoRow label="契約金額">
                {editingBasic ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        className="form-input flex-1 min-w-[8rem]"
                        value={editForm.contract_amount ?? 0}
                        onChange={(e) => setEditForm({ ...editForm, contract_amount: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="text-xs px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                        title="税抜など同一のときの入力省略用"
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            contract_amount: Number(editForm.estimated_amount) || 0,
                          })
                        }
                      >
                        見積金額をコピー
                      </button>
                    </div>
                  </div>
                ) : (
                  fmtMan(project.contract_amount)
                )}
              </InfoRow>
              <InfoRow label="実行原価">
                <span className="font-medium">{fmtMan(totalActualDisplayed)}</span>
                <span className="text-xs text-gray-400 ml-1">（予算実績＋登録経費）</span>
              </InfoRow>
              <InfoRow label="粗利益">
                <span className={`font-medium ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmtMan(grossProfit)}
                </span>
              </InfoRow>
              <InfoRow label="粗利率">
                <span className={`font-medium ${grossProfitRate >= 20 ? 'text-green-600' : 'text-red-600'}`}>
                  {grossProfitRate != null && !Number.isNaN(grossProfitRate) ? `${Number(grossProfitRate).toFixed(1)}%` : '-'}
                </span>
              </InfoRow>
            </div>

          </div>
        </div>
      )}

      {/* ══════════ 写真 ══════════ */}
      {activeTab === 'photos' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(PHOTO_TYPE_LABELS).map(([type, label]) => {
                const count = photos?.filter((p) => p.type === type).length ?? 0;
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedPhotoType(type as Photo['type'])}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      selectedPhotoType === type ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label} {count > 0 && <span className="opacity-75">({count})</span>}
                  </button>
                );
              })}
            </div>
            <label className="btn-primary cursor-pointer text-sm">
              <span className="material-icons" style={{ fontSize: 18 }}>add_photo_alternate</span>
              {isUploading ? 'アップロード中...' : '写真を追加'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploading} />
            </label>
          </div>

          {filteredPhotos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <span className="material-icons text-gray-200" style={{ fontSize: 48 }}>photo_library</span>
              <p className="text-gray-400 mt-3">{PHOTO_TYPE_LABELS[selectedPhotoType]}の写真がありません</p>
            </div>
          ) : (
            <div className="photo-gallery">
              {filteredPhotos.map((photo) => {
                const isMapThumbnail = project.map_thumbnail_url === photo.thumbnail_url;
                return (
                  <div key={photo.id} className="photo-item group relative">
                    {isMapThumbnail && (
                      <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-0.5 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow">
                        <span className="material-icons" style={{ fontSize: 10 }}>map</span>
                        地図用
                      </div>
                    )}
                    <img
                      src={photo.thumbnail_url}
                      alt={photo.file_name ?? '写真'}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setLightboxUrl(photo.drive_url)}
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 flex justify-between items-center gap-1">
                      <span>{PHOTO_TYPE_LABELS[photo.type]}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          title="地図サムネイルに設定"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (isMapThumbnail) {
                              await updateProject({ id: projectId, map_thumbnail_url: null });
                              showToast('地図サムネイルを解除しました');
                            } else {
                              await updateProject({ id: projectId, map_thumbnail_url: photo.thumbnail_url });
                              showToast('地図サムネイルに設定しました');
                            }
                          }}
                          className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold transition ${
                            isMapThumbnail ? 'bg-green-400 text-white' : 'bg-white/90 text-gray-700 hover:bg-green-400 hover:text-white'
                          }`}
                        >
                          <span className="material-icons" style={{ fontSize: 11 }}>map</span>
                          {isMapThumbnail ? '解除' : '地図用に設定'}
                        </button>
                        <button onClick={() => handleDeletePhoto(photo.id)}>
                          <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {lightboxUrl && (
            <div className="modal-overlay" onClick={() => setLightboxUrl(null)}>
              <div className="relative max-w-4xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <img src={lightboxUrl} alt="写真" className="w-full h-auto rounded-xl" />
                <button onClick={() => setLightboxUrl(null)} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1">
                  <span className="material-icons">close</span>
                </button>
                <a href={lightboxUrl} target="_blank" rel="noopener noreferrer"
                  className="absolute bottom-2 right-2 bg-black/50 text-white text-xs rounded px-2 py-1">
                  Drive で開く
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ 原価 ══════════ */}
      {activeTab === 'budget' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="契約金額" value={fmt(contractAmount)} />
            <SummaryCard label="計画原価合計" value={fmt(totalPlanned)} />
            <SummaryCard
              label="実際原価合計"
              value={fmt(totalActualDisplayed)}
              color={totalActualDisplayed > contractAmount && contractAmount > 0 ? 'red' : undefined}
            />
            <SummaryCard
              label="粗利（見込）"
              value={grossFromActual != null ? fmt(grossFromActual) : '-'}
              color={grossFromActual != null ? (grossFromActual >= 0 ? 'green' : 'red') : undefined}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-sm">原価明細（予算・実行）</h3>
              <button onClick={() => setBudgetModal(true)} className="btn-primary text-xs py-1.5 px-3">
                <span className="material-icons text-sm">add</span>明細を追加
              </button>
            </div>

            {budgets.length === 0 ? (
              <div className="text-center py-8 px-4">
                <span className="material-icons text-5xl mb-3 block" style={{ color: '#d1d5db' }}>receipt_long</span>
                <p className="text-gray-500 text-sm">予算ベースの明細はまだありません</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['項目名', 'カテゴリ', '業者', '計画金額', '実際金額', '差額'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.map((b) => {
                      const diff = b.actual_amount != null ? Number(b.actual_amount) - Number(b.planned_amount) : null;
                      return (
                        <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{b.item}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">{b.item_category}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{b.planned_vendor || '-'}</td>
                          <td className="px-4 py-3">{fmt(Number(b.planned_amount))}</td>
                          <td className="px-4 py-3">{b.actual_amount != null ? fmt(Number(b.actual_amount)) : '—'}</td>
                          <td className={`px-4 py-3 font-medium ${diff == null ? 'text-gray-300' : diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {diff == null ? '—' : `${diff > 0 ? '+' : ''}${fmt(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                      <td colSpan={3} className="px-4 py-3 text-right text-sm">合計（予算表のみ）</td>
                      <td className="px-4 py-3">{fmt(totalPlanned)}</td>
                      <td className="px-4 py-3">{totalActualBudgets > 0 ? fmt(totalActualBudgets) : '—'}</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-gray-100 p-4">
              <h4 className="font-bold text-sm mb-3 flex items-center gap-1.5">
                <span className="material-icons text-gray-500" style={{ fontSize: 18 }}>payments</span>
                登録経費
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                PC・スマホの経費登録でこの案件を選択したものが表示されます（未処理・取込済が原価合計に含まれます）。
              </p>
              {projectExpenses.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">案件に紐づく経費はまだありません</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['日付', 'カテゴリ', '金額', 'ステータス', '登録者', 'メモ'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projectExpenses.map((ex) => {
                        const muted = ex.status === 'rejected';
                        return (
                          <tr key={ex.id} className={`border-t border-gray-100 ${muted ? 'opacity-60' : ''}`}>
                            <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(ex.expense_date)}</td>
                            <td className="px-3 py-2.5">
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 text-xs rounded">{ex.category}</span>
                            </td>
                            <td className="px-3 py-2.5 font-medium">{fmt(Number(ex.amount))}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs text-gray-600">{EXPENSE_STATUS_LABEL[ex.status] ?? ex.status}</span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">{ex.m_users?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-gray-500 max-w-[200px] truncate" title={ex.memo ?? ''}>
                              {ex.memo || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 商談記録 ══════════ */}
      {activeTab === 'meetings' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">商談記録（{meetings.length}件）</h3>
            <button onClick={() => setMeetingModal(true)} className="btn-primary text-sm">
              <span className="material-icons text-base">add</span>商談記録を追加
            </button>
          </div>

          {meetings.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-12">
              <span className="material-icons text-5xl mb-3 block" style={{ color: '#d1d5db' }}>forum</span>
              <p className="text-gray-500 text-sm">商談記録はまだありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map((m) => {
                const recordedBy = (m as unknown as { m_users?: { name: string } }).m_users?.name;
                const nextActions = Array.isArray(m.next_actions) ? m.next_actions : [];
                return (
                  <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold">{fmtDate(m.meeting_date)}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${meetingBadge(m.meeting_type)}`}>
                          {m.meeting_type}
                        </span>
                      </div>
                      {recordedBy && <span className="text-xs text-gray-400">{recordedBy}</span>}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{m.summary}</p>
                    {nextActions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-start gap-2">
                          <span className="material-icons text-sm text-orange-500 mt-0.5">flag</span>
                          <div>
                            <span className="text-xs font-medium text-orange-600">次のアクション</span>
                            {nextActions.map((a, i) => (
                              <p key={i} className="text-sm text-gray-700 mt-0.5">{String(a)}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ 日報 ══════════ */}
      {activeTab === 'reports' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-bold">日報一覧</h3>
            <p className="text-xs text-gray-400 mt-0.5">スマホアプリから登録された日報が表示されます</p>
          </div>
          {reports.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <span className="material-icons text-4xl mb-2 block" style={{ color: '#d1d5db' }}>description</span>
              <p className="text-sm">日報がありません</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reports.map((r) => {
                const reportedBy = (r as unknown as { m_users?: { name: string } }).m_users?.name;
                return (
                  <div key={r.id} className="p-4 hover:bg-gray-50 cursor-pointer flex items-start gap-4" onClick={() => setReportDetail(r)}>
                    <div className="shrink-0 w-16 h-16 bg-green-50 rounded-lg flex flex-col items-center justify-center">
                      <span className="text-xs text-green-600 font-medium">{fmtDate(r.report_date).substring(5, 7)}月</span>
                      <span className="text-lg font-bold text-green-700">{fmtDate(r.report_date).substring(8, 10)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold truncate">{r.title || `${fmtDate(r.report_date)} 日報`}</h4>
                        {reportedBy && <span className="shrink-0 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{reportedBy}</span>}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{r.content}</p>
                    </div>
                    <span className="material-icons text-gray-300 shrink-0 mt-2">chevron_right</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ 商談記録モーダル ══════════ */}
      {meetingModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setMeetingModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-lg">商談記録を追加</h3>
              <button onClick={() => setMeetingModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日付 <span className="text-red-500">*</span></label>
                  <input type="date" className="form-input w-full" value={meetingForm.meeting_date}
                    onChange={(e) => setMeetingForm({ ...meetingForm, meeting_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">種別 <span className="text-red-500">*</span></label>
                  <select className="form-input w-full" value={meetingForm.meeting_type}
                    onChange={(e) => setMeetingForm({ ...meetingForm, meeting_type: e.target.value })}>
                    {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">内容 <span className="text-red-500">*</span></label>
                <textarea className="form-input w-full" rows={7} placeholder="商談の内容を記録してください"
                  value={meetingForm.summary} onChange={(e) => setMeetingForm({ ...meetingForm, summary: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">次のアクション</label>
                <input className="form-input w-full" placeholder="例: 1週間以内に見積書を送付"
                  value={meetingForm.next_actions} onChange={(e) => setMeetingForm({ ...meetingForm, next_actions: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button onClick={() => setMeetingModal(false)} className="btn-secondary">キャンセル</button>
              <button onClick={() => createMeeting.mutate()} disabled={createMeeting.isPending || !meetingForm.summary.trim()} className="btn-primary">
                {createMeeting.isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 原価追加モーダル ══════════ */}
      {budgetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setBudgetModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-lg">原価明細を追加</h3>
              <button onClick={() => setBudgetModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">項目名 <span className="text-red-500">*</span></label>
                <input className="form-input w-full" placeholder="例: 外壁塗装 材料一式"
                  value={budgetForm.item} onChange={(e) => setBudgetForm({ ...budgetForm, item: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                  <select className="form-input w-full" value={budgetForm.item_category}
                    onChange={(e) => setBudgetForm({ ...budgetForm, item_category: e.target.value as (typeof BUDGET_CATEGORIES)[number] })}>
                    {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">業者名</label>
                  <input className="form-input w-full" placeholder="例: ○○塗装"
                    value={budgetForm.planned_vendor} onChange={(e) => setBudgetForm({ ...budgetForm, planned_vendor: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">計画金額（円） <span className="text-red-500">*</span></label>
                  <input type="number" className="form-input w-full" placeholder="0"
                    value={budgetForm.planned_amount} onChange={(e) => setBudgetForm({ ...budgetForm, planned_amount: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">実際金額（円）</label>
                  <input type="number" className="form-input w-full" placeholder="未確定の場合は空白"
                    value={budgetForm.actual_amount} onChange={(e) => setBudgetForm({ ...budgetForm, actual_amount: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button onClick={() => setBudgetModal(false)} className="btn-secondary">キャンセル</button>
              <button onClick={() => createBudget.mutate()} disabled={createBudget.isPending || !budgetForm.item.trim() || !budgetForm.planned_amount} className="btn-primary">
                {createBudget.isPending ? '保存中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 日報詳細モーダル ══════════ */}
      {reportDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReportDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-bold">{reportDetail.title || `${fmtDate(reportDetail.report_date)} 日報`}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(reportDetail.report_date)}</p>
              </div>
              <button onClick={() => setReportDetail(null)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="text-xs font-bold text-gray-500 mb-2">報告内容</h4>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{reportDetail.content || '（内容なし）'}</p>
              </div>
              {Array.isArray(reportDetail.achievements) && reportDetail.achievements.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-bold text-gray-500 mb-1">成果</h4>
                  <ul className="text-sm text-gray-700 list-disc list-inside space-y-0.5">
                    {reportDetail.achievements.map((a, i) => <li key={i}>{String(a)}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(reportDetail.next_actions) && reportDetail.next_actions.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-bold text-gray-500 mb-1">次のアクション</h4>
                  <ul className="text-sm text-gray-700 list-disc list-inside space-y-0.5">
                    {reportDetail.next_actions.map((a, i) => <li key={i}>{String(a)}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end shrink-0">
              <button onClick={() => setReportDetail(null)} className="btn-secondary">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toastType === 'success' ? 'bg-green-600' : 'bg-red-500'}`}>
          {toast}
        </div>
      )}
    </div>
  );
}
