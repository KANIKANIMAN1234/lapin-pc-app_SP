'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProject, useUpdateProject } from '@/hooks/useProjects';
import { usePhotos, useUploadPhoto, useDeletePhoto } from '@/hooks/usePhotos';
import type { Photo, ProjectStatus } from '@/types';

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
  inspection: '点検',
  undercoat: '下塗り',
  completed: '完成',
};

function formatYen(v: number | undefined | null) {
  if (v == null) return '-';
  if (v >= 10000) return `${Math.floor(v / 10000).toLocaleString()}万円`;
  return `${v.toLocaleString()}円`;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { data: project, isLoading } = useProject(projectId);
  const { data: photos } = usePhotos(projectId);
  const { mutateAsync: updateProject, isPending: isUpdating } = useUpdateProject();
  const { mutateAsync: uploadPhoto, isPending: isUploading } = useUploadPhoto();
  const { mutateAsync: deletePhoto } = useDeletePhoto();

  const [activeTab, setActiveTab] = useState<'info' | 'photos' | 'budget' | 'meetings'>('info');
  const [editingStatus, setEditingStatus] = useState(false);
  const [selectedPhotoType, setSelectedPhotoType] = useState<Photo['type']>('before');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleStatusChange = async (status: ProjectStatus) => {
    await updateProject({ id: projectId, status });
    setEditingStatus(false);
    showToast('ステータスを更新しました');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        await uploadPhoto({ projectId, type: selectedPhotoType, imageBase64: base64 });
        showToast('写真をアップロードしました');
      } catch {
        showToast('アップロードに失敗しました');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('この写真を削除しますか？')) return;
    await deletePhoto({ photoId, projectId });
    showToast('写真を削除しました');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
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

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-secondary p-2">
            <span className="material-icons" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{project.customer_name}</h2>
              <span className="font-mono text-xs text-gray-400">{project.project_number}</span>
            </div>
            <p className="text-sm text-gray-500">{project.address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            <button
              onClick={() => setEditingStatus(true)}
              className={`badge ${project.status} cursor-pointer`}
            >
              {STATUS_LABELS[project.status as ProjectStatus]} ▾
            </button>
          )}
          {project.drive_folder_url && (
            <a
              href={project.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              <span className="material-icons" style={{ fontSize: 16 }}>folder</span>
              Drive
            </a>
          )}
        </div>
      </div>

      {/* タブ */}
      <div className="tabs">
        {(['info', 'photos', 'budget', 'meetings'] as const).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {{ info: '基本情報', photos: '写真', budget: '予算・実績', meetings: '商談記録' }[tab]}
          </button>
        ))}
      </div>

      {/* 基本情報タブ */}
      {activeTab === 'info' && (
        <div className="detail-grid">
          <div className="detail-section">
            <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>person</span> 顧客情報</h3>
            {[
              { label: '顧客名', value: `${project.customer_name}（${project.customer_name_kana || '-'}）` },
              { label: '電話番号', value: project.phone },
              { label: 'メール', value: project.email || '-' },
              { label: '住所', value: project.address },
            ].map(({ label, value }) => (
              <div key={label} className="detail-item">
                <label>{label}</label>
                <div>{value}</div>
              </div>
            ))}
          </div>

          <div className="detail-section">
            <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>construction</span> 工事情報</h3>
            {[
              { label: '工事種別', value: project.work_type?.join('・') || '-' },
              { label: '工事内容', value: project.work_description || '-' },
              { label: '集客ルート', value: project.acquisition_route || '-' },
              { label: '問い合わせ日', value: project.inquiry_date || '-' },
              { label: '契約日', value: project.contract_date || '-' },
              { label: '完工日', value: project.completion_date || '-' },
            ].map(({ label, value }) => (
              <div key={label} className="detail-item">
                <label>{label}</label>
                <div>{value}</div>
              </div>
            ))}
          </div>

          <div className="detail-section">
            <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>payments</span> 金額情報</h3>
            {[
              { label: '見積もり金額', value: formatYen(project.estimated_amount) },
              { label: '契約金額', value: formatYen(project.contract_amount) },
              { label: '実行原価', value: formatYen(project.actual_cost) },
              { label: '粗利益', value: formatYen(project.gross_profit) },
              { label: '粗利率', value: project.gross_profit_rate != null ? `${project.gross_profit_rate}%` : '-' },
            ].map(({ label, value }) => (
              <div key={label} className="detail-item">
                <label>{label}</label>
                <div className="font-medium">{value}</div>
              </div>
            ))}
          </div>

          {project.notes && (
            <div className="detail-section">
              <h3><span className="material-icons text-green-600" style={{ fontSize: 18 }}>notes</span> メモ</h3>
              <p className="text-sm whitespace-pre-wrap text-gray-700">{project.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* 写真タブ */}
      {activeTab === 'photos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">種別:</span>
              {Object.entries(PHOTO_TYPE_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => setSelectedPhotoType(type as Photo['type'])}
                  className={`px-3 py-1 text-xs rounded-lg border transition ${
                    selectedPhotoType === type
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="btn-primary cursor-pointer">
              <span className="material-icons" style={{ fontSize: 18 }}>add_photo_alternate</span>
              {isUploading ? 'アップロード中...' : '写真を追加'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploading} />
            </label>
          </div>

          {(photos?.length ?? 0) === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <span className="material-icons text-gray-200" style={{ fontSize: 48 }}>photo_library</span>
              <p className="text-gray-400 mt-3">写真がありません</p>
            </div>
          ) : (
            <div className="photo-gallery">
              {photos?.map((photo) => (
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
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="opacity-0 group-hover:opacity-100 transition"
                    >
                      <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ライトボックス */}
          {lightboxUrl && (
            <div className="modal-overlay" onClick={() => setLightboxUrl(null)}>
              <div className="relative max-w-4xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <img src={lightboxUrl} alt="写真" className="w-full h-auto rounded-xl" />
                <button
                  onClick={() => setLightboxUrl(null)}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                >
                  <span className="material-icons">close</span>
                </button>
                <a
                  href={lightboxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 right-2 bg-black/50 text-white text-xs rounded px-2 py-1"
                >
                  Drive で開く
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 予算・実績タブ */}
      {activeTab === 'budget' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="material-icons text-gray-200" style={{ fontSize: 48 }}>calculate</span>
          <p className="text-gray-400 mt-3">予算・実績機能は実装中です</p>
          <p className="text-xs text-gray-300 mt-1">budgets テーブルのデータを表示します</p>
        </div>
      )}

      {/* 商談記録タブ */}
      {activeTab === 'meetings' && (
        <div>
          {project.meetings?.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <span className="material-icons text-gray-200" style={{ fontSize: 48 }}>forum</span>
              <p className="text-gray-400 mt-3">商談記録がありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {project.meetings?.map((meeting: { id: string; meeting_date: string; meeting_type: string; summary: string }) => (
                <div key={meeting.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">{meeting.meeting_date}</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded">{meeting.meeting_type}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{meeting.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="toast show success" style={{ bottom: '1.5rem', right: '1.5rem' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
