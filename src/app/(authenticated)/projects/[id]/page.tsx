'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { useProject, useUpdateProject } from '@/hooks/useProjects';
import { usePhotos, useDeletePhoto } from '@/hooks/usePhotos';
import { useAuthStore } from '@/stores/authStore';
import type { Photo, ProjectStatus } from '@/types';

// ─── 定数 ───────────────────────────────────────────────────────
const STATUS_LABELS: Record<ProjectStatus, string> = {
  inquiry: '問い合わせ',
  estimate: '見積もり',
  followup_status: '追客中',
  contract: '契約',
  in_progress: '施工中',
  completed: '完成',
  lost: '失注',
};

const PHOTO_TYPE_LABELS: Record<Photo['type'], string> = {
  before: '施工前',
  inspection: '現調',
  undercoat: '下塗り',
  completed: '完成',
};

const MEETING_TYPES = ['初回商談', '現地調査', '見積提出', '契約', '工事確認', '完工確認', 'その他'];

const BUDGET_CATEGORIES = ['材料費', '労務費', '外注費', '経費', 'その他'] as const;

// ─── ヘルパー ────────────────────────────────────────────────────
function fmt(v: number | null | undefined) {
  if (v == null) return '-';
  return v >= 10000 ? `${Math.floor(v / 10000).toLocaleString()}万円` : `${v.toLocaleString()}円`;
}
function fmtDate(d: string | null | undefined) {
  return d ? String(d).substring(0, 10) : '-';
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

  // 編集状態
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingBasic, setEditingBasic] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string | number>>({});

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
      customer_name: project.customer_name ?? '',
      phone: project.phone ?? '',
      address: project.address ?? '',
      work_description: project.work_description ?? '',
      estimated_amount: project.estimated_amount ?? 0,
      contract_amount: project.contract_amount ?? 0,
      planned_budget: project.planned_budget ?? 0,
      actual_cost: project.actual_cost ?? 0,
      notes: project.notes ?? '',
    });
    setEditingBasic(true);
  };

  const saveEdit = async () => {
    await updateProject({ id: projectId, ...editForm });
    setEditingBasic(false);
    showToast('基本情報を更新しました');
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
    enabled: activeTab === 'budget',
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
      setBudgetModal(false);
      setBudgetForm({ item: '', item_category: '材料費', planned_vendor: '', planned_amount: '', actual_amount: '' });
      showToast('原価明細を追加しました');
    },
    onError: (e) => showToast('追加に失敗しました: ' + String(e), 'error'),
  });

  const totalPlanned = budgets.reduce((s, b) => s + Number(b.planned_amount ?? 0), 0);
  const totalActual = budgets.reduce((s, b) => s + Number(b.actual_amount ?? 0), 0);

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
              {Object.entries(STATUS_LABELS).map(([s, l]) => (
                <option key={s} value={s}>{l}</option>
              ))}
            </select>
          ) : (
            <button onClick={() => setEditingStatus(true)} className={`badge ${project.status} cursor-pointer`}>
              {STATUS_LABELS[project.status as ProjectStatus]} ▾
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
          <div className="flex justify-end mb-4">
            {editingBasic ? (
              <div className="flex gap-2">
                <button onClick={() => setEditingBasic(false)} className="btn-secondary text-sm">キャンセル</button>
                <button onClick={saveEdit} className="btn-primary text-sm" disabled={isUpdating}>
                  {isUpdating ? '保存中...' : '保存'}
                </button>
              </div>
            ) : (
              <button onClick={startEdit} className="btn-secondary text-sm">
                <span className="material-icons text-base">edit</span>編集
              </button>
            )}
          </div>

          <div className="detail-grid">
            {/* 顧客情報 */}
            <div className="detail-section">
              <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>person</span> 顧客情報</h3>
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
                  : project.address}
              </InfoRow>
            </div>

            {/* 工事情報 */}
            <div className="detail-section">
              <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>construction</span> 工事情報</h3>
              <InfoRow label="工事種別">
                <div className="flex gap-1.5 flex-wrap">
                  {(project.work_type ?? []).map((w) => (
                    <span key={w} className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded">{w}</span>
                  ))}
                </div>
              </InfoRow>
              <InfoRow label="工事内容">
                {editingBasic
                  ? <input className="form-input w-full" value={String(editForm.work_description ?? '')} onChange={(e) => setEditForm({ ...editForm, work_description: e.target.value })} />
                  : project.work_description || '-'}
              </InfoRow>
              <InfoRow label="集客ルート">
                {project.acquisition_route
                  ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">{project.acquisition_route}</span>
                  : '-'}
              </InfoRow>
              <InfoRow label="問い合わせ日">{fmtDate(project.inquiry_date)}</InfoRow>
              <InfoRow label="契約日">{fmtDate(project.contract_date)}</InfoRow>
              <InfoRow label="着工日">{fmtDate(project.start_date)}</InfoRow>
              <InfoRow label="完工日">{fmtDate(project.completion_date)}</InfoRow>
            </div>

            {/* 金額情報 */}
            <div className="detail-section">
              <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>payments</span> 金額情報</h3>
              <InfoRow label="見積もり金額">
                {editingBasic
                  ? <input type="number" className="form-input w-full" value={editForm.estimated_amount ?? 0} onChange={(e) => setEditForm({ ...editForm, estimated_amount: Number(e.target.value) })} />
                  : fmt(project.estimated_amount)}
              </InfoRow>
              <InfoRow label="契約金額">
                {editingBasic
                  ? <input type="number" className="form-input w-full" value={editForm.contract_amount ?? 0} onChange={(e) => setEditForm({ ...editForm, contract_amount: Number(e.target.value) })} />
                  : fmt(project.contract_amount)}
              </InfoRow>
              <InfoRow label="実行原価">
                <span className="font-medium">{fmt(project.actual_cost)}</span>
                <span className="text-xs text-gray-400 ml-1">（原価タブから自動集計）</span>
              </InfoRow>
              <InfoRow label="粗利益">
                <span className={`font-medium ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(grossProfit)}
                </span>
              </InfoRow>
              <InfoRow label="粗利率">
                <span className={`font-medium ${grossProfitRate >= 20 ? 'text-green-600' : 'text-red-600'}`}>
                  {grossProfitRate != null ? `${grossProfitRate}%` : '-'}
                </span>
              </InfoRow>
            </div>

            {/* メモ */}
            <div className="detail-section">
              <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>notes</span> メモ・備考</h3>
              {editingBasic ? (
                <textarea
                  className="form-input w-full"
                  rows={5}
                  value={String(editForm.notes ?? '')}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="自由記述..."
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap text-gray-700">{project.notes || '（なし）'}</p>
              )}
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
              {filteredPhotos.map((photo) => (
                <div key={photo.id} className="photo-item group relative">
                  <img
                    src={photo.thumbnail_url}
                    alt={photo.file_name ?? '写真'}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setLightboxUrl(photo.drive_url)}
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 flex justify-between items-center">
                    <span>{PHOTO_TYPE_LABELS[photo.type]}</span>
                    <button onClick={() => handleDeletePhoto(photo.id)} className="opacity-0 group-hover:opacity-100 transition">
                      <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                </div>
              ))}
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
              value={fmt(totalActual)}
              color={totalActual > contractAmount && contractAmount > 0 ? 'red' : undefined}
            />
            <SummaryCard
              label="粗利（見込）"
              value={contractAmount > 0 ? fmt(contractAmount - (totalActual || totalPlanned)) : '-'}
              color={(contractAmount - (totalActual || totalPlanned)) >= 0 ? 'green' : 'red'}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-sm">原価明細</h3>
              <button onClick={() => setBudgetModal(true)} className="btn-primary text-xs py-1.5 px-3">
                <span className="material-icons text-sm">add</span>明細を追加
              </button>
            </div>

            {budgets.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-icons text-5xl mb-3 block" style={{ color: '#d1d5db' }}>receipt_long</span>
                <p className="text-gray-500 text-sm">原価明細はまだ登録されていません</p>
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
                      <td colSpan={3} className="px-4 py-3 text-right text-sm">合計</td>
                      <td className="px-4 py-3">{fmt(totalPlanned)}</td>
                      <td className="px-4 py-3">{totalActual > 0 ? fmt(totalActual) : '—'}</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
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
