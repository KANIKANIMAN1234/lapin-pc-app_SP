'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';

type TabId = 'employees' | 'company' | 'masters';

interface EmployeeRow {
  id: string;
  name: string;
  email?: string;
  role: string;
  phone?: string;
  line_user_id?: string;
  status: 'active' | 'retired';
  can_register_project: boolean;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  staff: '事務',
  sales: '営業',
};

const MASTER_DEFS = [
  { key: 'work_type_options',       label: '工事種別',     icon: 'construction',  desc: '案件登録で使用する工事の種類' },
  { key: 'acquisition_route_options', label: '集客ルート', icon: 'campaign',      desc: '案件の集客経路' },
  { key: 'project_status_options',  label: '案件ステータス', icon: 'flag',        desc: '案件のステータス一覧（値:ラベル の形式で入力）' },
  { key: 'expense_category_options', label: '経費カテゴリ', icon: 'receipt_long', desc: '経費登録で使用するカテゴリ' },
  { key: 'meeting_type_options',    label: '商談種別',     icon: 'handshake',     desc: '商談記録で使用する種別' },
];

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${type === 'success' ? 'bg-green-600' : 'bg-red-500'}`}>
      {msg}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('employees');

  // Toast
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' }>({ show: false, msg: '', type: 'success' });
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000);
  };

  // ── 従業員タブ ──
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empFilter, setEmpFilter] = useState<'all' | 'active' | 'retired'>('all');
  const [submitting, setSubmitting] = useState(false);

  // モーダル
  const [showRegModal, setShowRegModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRetireModal, setShowRetireModal] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [retireTarget, setRetireTarget] = useState<EmployeeRow | null>(null);

  // 登録フォーム
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState('sales');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');

  // 編集フォーム
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCanRegister, setEditCanRegister] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setEmpLoading(true);
    try {
      // RLSをバイパスしてサービスロールで全ユーザーを取得
      const res = await fetch('/api/admin/users');
      const json = await res.json() as { users?: EmployeeRow[]; error?: string };
      if (json.users) setEmployees(json.users);
    } catch (e) {
      console.error('[fetchEmployees]', e);
    }
    setEmpLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'employees') fetchEmployees();
  }, [activeTab, fetchEmployees]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) return;
    setSubmitting(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: regName.trim(), role: regRole, email: regEmail || null, phone: regPhone || null, status: 'active' }),
    });
    const json = await res.json() as { error?: string };
    setSubmitting(false);
    if (json.error) {
      showToast('登録に失敗しました: ' + json.error, 'error');
    } else {
      showToast(`${regName} さんを登録しました`);
      setShowRegModal(false);
      setRegName(''); setRegRole('sales'); setRegEmail(''); setRegPhone('');
      fetchEmployees();
    }
  };

  const openEdit = (emp: EmployeeRow) => {
    setEditTarget(emp);
    setEditName(emp.name); setEditRole(emp.role);
    setEditEmail(emp.email ?? ''); setEditPhone(emp.phone ?? '');
    setEditCanRegister(emp.can_register_project ?? false);
    setShowEditModal(true);
  };

  // APIルート経由でユーザーを更新（RLSバイパス）
  const patchUser = async (id: string, updates: Record<string, unknown>) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    const json = await res.json() as { error?: string };
    return json.error ?? null;
  };

  // SP新規登録権限のインライントグル
  const handleToggleRegisterProject = async (emp: EmployeeRow) => {
    if (emp.role === 'admin') return;
    const newVal = !emp.can_register_project;
    const err = await patchUser(emp.id, { can_register_project: newVal });
    if (err) showToast('権限の更新に失敗しました', 'error');
    else { showToast(`${emp.name} さんのSP新規登録権限を${newVal ? 'ON' : 'OFF'}にしました`); fetchEmployees(); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSubmitting(true);
    const err = await patchUser(editTarget.id, {
      name: editName, role: editRole,
      email: editEmail || null, phone: editPhone || null,
      can_register_project: editRole === 'admin' ? true : editCanRegister,
    });
    setSubmitting(false);
    if (err) {
      showToast('更新に失敗しました: ' + err, 'error');
    } else {
      showToast(`${editName} さんの情報を更新しました`);
      setShowEditModal(false);
      fetchEmployees();
    }
  };

  const handleRetire = async () => {
    if (!retireTarget) return;
    setSubmitting(true);
    const err = await patchUser(retireTarget.id, { status: 'retired' });
    setSubmitting(false);
    if (err) {
      showToast('退職処理に失敗しました: ' + err, 'error');
    } else {
      showToast(`${retireTarget.name} さんの退職処理が完了しました`);
      setShowRetireModal(false);
      fetchEmployees();
    }
  };

  const handleRestore = async (emp: EmployeeRow) => {
    if (!confirm(`${emp.name} さんを復職させますか？`)) return;
    const err = await patchUser(emp.id, { status: 'active' });
    if (err) showToast('復職処理に失敗しました', 'error');
    else { showToast(`${emp.name} さんを復職させました`); fetchEmployees(); }
  };

  const filteredEmployees = employees.filter((e) => {
    if (empFilter === 'active') return e.status === 'active';
    if (empFilter === 'retired') return e.status === 'retired';
    return true;
  });

  // ── 企業情報タブ ──
  const [companySettings, setCompanySettings] = useState<Record<string, string>>({});
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyLoaded, setCompanyLoaded] = useState(false);

  const fetchCompany = useCallback(async () => {
    setCompanyLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('m_settings').select('key, value');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r) => { map[r.key] = r.value; });
      setCompanySettings(map);
    }
    setCompanyLoaded(true);
    setCompanyLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'company' && !companyLoaded) fetchCompany();
  }, [activeTab, companyLoaded, fetchCompany]);

  const saveSetting = async (key: string, value: string, label: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('m_settings')
      .upsert({ key, value }, { onConflict: 'key' });
    if (error) showToast(`${label}の保存に失敗しました`, 'error');
    else { showToast(`${label}を保存しました`); setCompanySettings((p) => ({ ...p, [key]: value })); }
  };

  // ── マスター管理タブ ──
  const [mastersData, setMastersData] = useState<Record<string, string[]>>({});
  const [mastersLoaded, setMastersLoaded] = useState(false);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [editingMaster, setEditingMaster] = useState<string | null>(null);
  const [editMasterValues, setEditMasterValues] = useState<string[]>([]);
  const [masterSaving, setMasterSaving] = useState(false);

  const fetchMasters = useCallback(async () => {
    setMastersLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('m_settings')
      .select('key, value')
      .in('key', MASTER_DEFS.map((m) => m.key));
    if (data) {
      const map: Record<string, string[]> = {};
      data.forEach((r) => {
        try { map[r.key] = JSON.parse(r.value); } catch { map[r.key] = []; }
      });
      setMastersData(map);
    }
    setMastersLoaded(true);
    setMastersLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'masters' && !mastersLoaded) fetchMasters();
  }, [activeTab, mastersLoaded, fetchMasters]);

  const saveMaster = async (key: string, values: string[], label: string) => {
    setMasterSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('m_settings')
      .upsert({ key, value: JSON.stringify(values) }, { onConflict: 'key' });
    setMasterSaving(false);
    if (error) showToast(`${label}の保存に失敗しました`, 'error');
    else {
      showToast(`${label}を更新しました`);
      setMastersData((p) => ({ ...p, [key]: values }));
      setEditingMaster(null);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <span className="material-icons text-6xl text-gray-300 mb-4">lock</span>
        <p className="text-xl font-semibold text-gray-600">アクセス権限がありません</p>
        <p className="text-sm text-gray-400 mt-2">このページは管理者（admin）専用です。</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">管理</h2>

      {/* タブ */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([
          { id: 'employees', label: '従業員管理', icon: 'badge' },
          { id: 'company',   label: '企業情報',   icon: 'domain' },
          { id: 'masters',   label: 'マスター管理', icon: 'tune' },
        ] as { id: TabId; label: string; icon: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="material-icons" style={{ fontSize: 18 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 従業員管理 ── */}
      {activeTab === 'employees' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="font-bold flex items-center gap-1.5">
                <span className="material-icons text-green-600 text-xl">badge</span>従業員一覧
              </h3>
              <div className="flex gap-1">
                {(['all', 'active', 'retired'] as const).map((f) => (
                  <button key={f} onClick={() => setEmpFilter(f)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${empFilter === f ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {f === 'all' ? '全員' : f === 'active' ? '在籍' : '退職'}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary text-sm" onClick={() => { setRegName(''); setRegRole('sales'); setRegEmail(''); setRegPhone(''); setShowRegModal(true); }}>
              <span className="material-icons text-base">person_add</span>新規登録
            </button>
          </div>

          {empLoading ? (
            <div className="flex items-center justify-center py-12"><div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['氏名', '役職', 'メール', 'LINE連携', 'SP新規登録', '登録日', 'ステータス', '操作'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className={`border-t border-gray-100 hover:bg-gray-50 ${emp.status === 'retired' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-medium">{emp.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                          {ROLE_LABELS[emp.role] ?? emp.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{emp.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        {emp.line_user_id
                          ? <span className="text-green-600 flex items-center gap-1"><span className="material-icons text-base">check_circle</span>済</span>
                          : <span className="text-gray-400 flex items-center gap-1"><span className="material-icons text-base">cancel</span>未</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {emp.role === 'admin' ? (
                          <span className="text-blue-600 flex items-center gap-1 text-xs">
                            <span className="material-icons text-base">smartphone</span>常時ON
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleRegisterProject(emp)}
                            title="SP新規登録権限の切り替え"
                            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${emp.can_register_project ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${emp.can_register_project ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{emp.created_at ? new Date(emp.created_at).toLocaleDateString('ja-JP') : '—'}</td>
                      <td className="px-4 py-3">
                        {emp.status === 'active'
                          ? <span className="text-green-600 flex items-center gap-1"><span className="material-icons text-base">check_circle</span>在籍</span>
                          : <span className="text-red-500 flex items-center gap-1"><span className="material-icons text-base">person_off</span>退職</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {emp.status === 'retired' ? (
                            <button onClick={() => handleRestore(emp)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                              <span className="material-icons text-sm">undo</span>復職
                            </button>
                          ) : (
                            <>
                              <button onClick={() => openEdit(emp)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                                <span className="material-icons text-sm">edit</span>
                              </button>
                              {emp.role !== 'admin' && (
                                <button onClick={() => { setRetireTarget(emp); setShowRetireModal(true); }} className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50">
                                  <span className="material-icons text-sm">person_off</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-10 text-gray-400">該当する従業員がいません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 企業情報 ── */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
            <span className="material-icons text-green-600">domain</span>企業情報
          </h3>
          {companyLoading ? (
            <div className="flex items-center justify-center py-12"><div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p></div>
          ) : (
            <div className="space-y-5">
              {[
                { key: 'company_name',  label: '会社名・屋号',    placeholder: '例: ラパンリフォーム', icon: 'business' },
                { key: 'representative', label: '代表者',          placeholder: '例: 中山隆志',         icon: 'person' },
                { key: 'address',       label: '住所',            placeholder: '例: 埼玉県狭山市...',   icon: 'location_on' },
                { key: 'phone',         label: '電話番号',         placeholder: '例: 04-2907-5022',     icon: 'phone' },
                { key: 'drive_root_folder_id', label: 'Google DriveルートフォルダID', placeholder: '例: 1a2b3c4d5e...', icon: 'folder' },
              ].map(({ key, label, placeholder, icon }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                    <span className="material-icons text-gray-400" style={{ fontSize: 18 }}>{icon}</span>
                    {label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="form-input flex-1"
                      placeholder={placeholder}
                      value={companySettings[key] ?? ''}
                      onChange={(e) => setCompanySettings((p) => ({ ...p, [key]: e.target.value }))}
                    />
                    <button
                      className="btn-primary shrink-0 py-2 px-4 text-sm"
                      onClick={() => saveSetting(key, companySettings[key] ?? '', label)}
                    >
                      <span className="material-icons text-base">save</span>保存
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── マスター管理 ── */}
      {activeTab === 'masters' && (
        <div>
          <p className="text-sm text-gray-500 mb-6">各マスターの選択肢を管理できます。変更は案件登録・経費登録のドロップダウンに即時反映されます。</p>
          {mastersLoading ? (
            <div className="flex items-center justify-center py-12"><div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {MASTER_DEFS.map((master) => {
                const values = mastersData[master.key] ?? [];
                const isEditing = editingMaster === master.key;
                return (
                  <div key={master.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="material-icons text-gray-500">{master.icon}</span>
                        <div>
                          <h4 className="font-bold text-sm">{master.label}</h4>
                          <p className="text-xs text-gray-400">{master.desc}</p>
                        </div>
                      </div>
                      {!isEditing ? (
                        <button
                          onClick={() => { setEditingMaster(master.key); setEditMasterValues([...values]); }}
                          className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1"
                        >
                          <span className="material-icons text-sm">edit</span>編集
                        </button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => setEditingMaster(null)} className="px-3 py-1 text-xs border border-gray-300 rounded-lg">キャンセル</button>
                          <button
                            disabled={masterSaving}
                            onClick={() => saveMaster(master.key, editMasterValues.filter((v) => v.trim()), master.label)}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {masterSaving ? '保存中...' : '保存'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      {isEditing ? (
                        <div className="space-y-2">
                          {editMasterValues.map((val, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}</span>
                              <input
                                className="form-input flex-1 text-sm py-1.5"
                                value={val}
                                onChange={(e) => {
                                  const n = [...editMasterValues]; n[idx] = e.target.value; setEditMasterValues(n);
                                }}
                              />
                              <button onClick={() => setEditMasterValues(editMasterValues.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500">
                                <span className="material-icons text-sm">close</span>
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setEditMasterValues([...editMasterValues, ''])}
                            className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 flex items-center justify-center gap-1"
                          >
                            <span className="material-icons text-sm">add</span>項目を追加
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {values.length > 0 ? values.map((v, i) => (
                            <span key={i} className="px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm">{v}</span>
                          )) : (
                            <p className="text-sm text-gray-400">未設定（編集で追加してください）</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="px-4 pb-3 text-xs text-gray-400">{values.length}件</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 登録モーダル */}
      {showRegModal && (
        <div className="modal-overlay" onClick={() => setShowRegModal(false)}>
          <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-bold text-lg">従業員登録</h3>
              <button onClick={() => setShowRegModal(false)} className="p-1 hover:bg-gray-100 rounded"><span className="material-icons">close</span></button>
            </div>
            <form onSubmit={handleRegister}>
              <div className="modal-body grid grid-cols-2 gap-4">
                <div className="form-group col-span-2">
                  <label>氏名 <span className="required">*</span></label>
                  <input type="text" className="form-input" required placeholder="例: 中山太郎" value={regName} onChange={(e) => setRegName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>役職 <span className="required">*</span></label>
                  <select className="form-input" value={regRole} onChange={(e) => setRegRole(e.target.value)}>
                    <option value="admin">管理者</option>
                    <option value="staff">事務</option>
                    <option value="sales">営業</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>携帯番号</label>
                  <input type="tel" className="form-input" placeholder="090-0000-0000" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} />
                </div>
                <div className="form-group col-span-2">
                  <label>メールアドレス</label>
                  <input type="email" className="form-input" placeholder="tanaka@example.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                </div>
                <div className="col-span-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-start gap-2">
                  <span className="material-icons text-base mt-0.5">info</span>
                  登録後、従業員がLINEログインすると自動的にアカウントが紐付けされます。
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowRegModal(false)}>キャンセル</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  <span className="material-icons text-base">person_add</span>{submitting ? '登録中...' : '登録'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showEditModal && editTarget && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-bold text-lg">従業員情報編集</h3>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-gray-100 rounded"><span className="material-icons">close</span></button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body grid grid-cols-2 gap-4">
                <div className="form-group col-span-2">
                  <label>氏名</label>
                  <input type="text" className="form-input" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>役職</label>
                  <select className="form-input" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                    <option value="admin">管理者</option>
                    <option value="staff">事務</option>
                    <option value="sales">営業</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>携帯番号</label>
                  <input type="tel" className="form-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                </div>
                <div className="form-group col-span-2">
                  <label>メールアドレス</label>
                  <input type="email" className="form-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </div>
                <div className="form-group col-span-2">
                  <label className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="material-icons text-base text-gray-400">smartphone</span>
                      SP新規登録権限
                    </span>
                    {editRole === 'admin' ? (
                      <span className="text-xs text-blue-600 font-medium">管理者は常時ON</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditCanRegister((v) => !v)}
                        className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${editCanRegister ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editCanRegister ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    )}
                  </label>
                  <p className="text-xs text-gray-400 mt-1">ONにするとモバイルアプリに「新規案件登録」タブが表示されます</p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>キャンセル</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  <span className="material-icons text-base">save</span>{submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 退職確認モーダル */}
      {showRetireModal && retireTarget && (
        <div className="modal-overlay" onClick={() => setShowRetireModal(false)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-bold text-lg">退職処理の確認</h3>
              <button onClick={() => setShowRetireModal(false)} className="p-1 hover:bg-gray-100 rounded"><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3 mb-4">
                <span className="material-icons text-yellow-600">warning</span>
                <div className="text-sm">
                  <p className="font-bold">{retireTarget.name} さんを退職処理します。</p>
                  <ul className="mt-2 space-y-1 text-gray-600 list-disc list-inside">
                    <li>LINEログインが不可になります</li>
                    <li>過去の登録データは保持されます</li>
                    <li>復職処理で元に戻せます</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowRetireModal(false)}>キャンセル</button>
              <button className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium flex items-center gap-1" onClick={handleRetire} disabled={submitting}>
                <span className="material-icons text-base">person_off</span>{submitting ? '処理中...' : '退職処理を実行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.show && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
