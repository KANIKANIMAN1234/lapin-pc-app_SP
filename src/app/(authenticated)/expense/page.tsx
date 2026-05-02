'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  parseExpenseCategoryOptions,
  pickDefaultExpenseCategory,
} from '@/lib/expenseCategoryOptions';

interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  memo: string | null;
  status: string;
  receipt_image_url: string | null;
  project_id: string | null;
  project_number?: string;
  customer_name?: string;
}

interface ProjectOption {
  value: string;
  label: string;
}

export default function ExpensePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    project_id: '',
    amount: '',
    date: new Date().toISOString().substring(0, 10),
    category: pickDefaultExpenseCategory(parseExpenseCategoryOptions(null)),
    memo: '',
  });
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 案件リスト取得
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('t_projects')
      .select('id, project_number, customer_name')
      .is('deleted_at', null)
      .order('project_number', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setProjectOptions(
            data.map((p) => ({
              value: p.id,
              label: `${p.project_number} ${p.customer_name}`,
            }))
          );
        }
      });
  }, []);

  const { data: expenseCategories = parseExpenseCategoryOptions(null) } = useQuery({
    queryKey: ['m_settings', 'expense_category_options'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('m_settings')
        .select('value')
        .eq('key', 'expense_category_options')
        .maybeSingle();
      return parseExpenseCategoryOptions(data?.value ?? null);
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!expenseCategories.length) return;
    setForm((f) =>
      expenseCategories.includes(f.category)
        ? f
        : { ...f, category: pickDefaultExpenseCategory(expenseCategories) }
    );
  }, [expenseCategories]);

  // 経費一覧（案件情報JOIN）
  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses', user?.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_expenses')
        .select('*, t_projects(project_number, customer_name)')
        .eq('user_id', user?.id ?? '')
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id as string,
        expense_date: e.expense_date as string,
        category: e.category as string,
        amount: e.amount as number,
        memo: e.memo as string | null,
        status: (e.status as string) ?? 'pending',
        receipt_image_url: e.receipt_image_url as string | null,
        project_id: e.project_id as string | null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        project_number: (e as any).t_projects?.project_number as string | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customer_name: (e as any).t_projects?.customer_name as string | undefined,
      })) as ExpenseRow[];
    },
    enabled: !!user?.id,
  });

  // レシート選択
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setReceiptPreview(URL.createObjectURL(file));
    setReceiptFile(file);
    e.target.value = '';
  };

  // 経費登録
  const { mutateAsync: createExpense, isPending } = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const linkedProjectId = form.project_id || null;
      let receiptUrl: string | null = null;

      // レシートをStorageにアップロード
      if (receiptFile) {
        const ext = receiptFile.name.split('.').pop() ?? 'jpg';
        const path = `${user?.id}/${Date.now()}.${ext}`;
        const { data: uploadData } = await supabase.storage
          .from('expense-receipts')
          .upload(path, receiptFile, { upsert: true });
        if (uploadData) {
          const { data: urlData } = supabase.storage
            .from('expense-receipts')
            .getPublicUrl(path);
          receiptUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase.from('t_expenses').insert({
        user_id: user?.id ?? '',
        project_id: linkedProjectId,
        expense_date: form.date,
        category: form.category,
        memo: form.memo || null,
        amount: Number(form.amount),
        receipt_image_url: receiptUrl,
        status: 'pending',
      });
      if (error) throw error;
      return linkedProjectId;
    },
    onSuccess: (linkedProjectId) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
      if (linkedProjectId) {
        queryClient.invalidateQueries({ queryKey: ['project', linkedProjectId] });
        queryClient.invalidateQueries({ queryKey: ['project-expenses', linkedProjectId] });
      }
      setForm({
        project_id: '',
        amount: '',
        date: new Date().toISOString().substring(0, 10),
        category: 'その他',
        memo: '',
      });
      setReceiptPreview(null);
      setReceiptFile(null);
      showToast('経費を登録しました');
    },
    onError: () => showToast('登録に失敗しました', 'error'),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount) return;
    await createExpense();
  };

  // 会計取込トグル
  const handleToggleAccounting = async (expId: string, currentStatus: string, projectId: string | null) => {
    setTogglingId(expId);
    const newStatus = currentStatus === 'approved' ? 'pending' : 'approved';
    const supabase = createClient();
    const { error } = await supabase
      .from('t_expenses')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', expId);
    if (error) {
      showToast('更新に失敗しました', 'error');
    } else {
      queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        queryClient.invalidateQueries({ queryKey: ['project-expenses', projectId] });
      }
    }
    setTogglingId(null);
  };

  const now = new Date();
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyExpenses = (expenses ?? []).filter((e) => e.expense_date?.startsWith(thisMonthStr));
  const unprocessedCount = monthlyExpenses.filter((e) => e.status !== 'approved').length;
  const totalMonthly = monthlyExpenses.length;

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">経費登録</h2>
      <div className="expense-layout">

        {/* ── 登録フォーム ── */}
        <div className="expense-form-card">
          <h3 className="font-bold mb-5 text-base">新規経費登録</h3>
          <form onSubmit={handleSubmit}>

            {/* レシートアップロード＋プレビュー */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-green-500 hover:bg-green-50/30 transition-colors min-h-[120px]"
              >
                <span className="material-icons text-3xl text-green-500 mb-1">cloud_upload</span>
                <p className="text-sm font-medium text-green-600">レシート・領収書を</p>
                <p className="text-sm font-medium text-green-600">アップロード</p>
                <p className="text-xs text-gray-400 mt-1">クリックして添付</p>
              </div>
              <div className="border border-gray-200 rounded-lg bg-gray-50 flex flex-col items-center justify-center min-h-[120px] overflow-hidden">
                {receiptPreview ? (
                  <img src={receiptPreview} alt="レシート" className="max-h-full max-w-full object-contain" />
                ) : (
                  <>
                    <span className="material-icons text-3xl text-gray-300 mb-1">image</span>
                    <p className="text-xs text-gray-400 text-center px-2">
                      アップロードした写真が<br />ここに表示されます
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className="space-y-4">
              {/* 案件選択 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">顧客番号 / 案件</label>
                <select
                  value={form.project_id}
                  onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                  className="form-input"
                >
                  <option value="">案件を選択（共通経費の場合は未選択）</option>
                  {projectOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* 金額・日付 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">金額</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="form-input"
                    placeholder="0"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
              </div>

              {/* カテゴリ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="form-input"
                >
                  {expenseCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                <input
                  type="text"
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  className="form-input"
                  placeholder="品目や用途を入力"
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-6 w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={isPending}
            >
              <span className="material-icons">cloud_upload</span>
              {isPending ? '登録中...' : '経費を登録'}
            </button>
          </form>
        </div>

        {/* ── 経費処理管理 ── */}
        <div className="expense-history-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <span className="material-icons">receipt_long</span>経費処理管理
            </h3>
            <div className="flex items-center gap-3">
              {unprocessedCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                  <span className="material-icons" style={{ fontSize: 14 }}>warning</span>
                  未処理 {unprocessedCount}件
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                  <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span>
                  処理完了
                </span>
              )}
              <span className="text-xs text-gray-400">今月 {totalMonthly}件</span>
            </div>
          </div>

          {/* プログレスバー */}
          <div className="mb-3 p-2.5 rounded-lg bg-blue-50 border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs">
                <div className="text-blue-600">
                  <span className="font-bold text-lg">{unprocessedCount}</span> / {totalMonthly}
                  <span className="ml-1 text-blue-500">未取込</span>
                </div>
                <div
                  className="flex-1 h-2 bg-blue-200 rounded-full overflow-hidden"
                  style={{ minWidth: 80 }}
                >
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width:
                        totalMonthly > 0
                          ? `${((totalMonthly - unprocessedCount) / totalMonthly) * 100}%`
                          : '0%',
                    }}
                  />
                </div>
              </div>
              <span className="text-xs text-blue-500 font-medium">
                {totalMonthly > 0
                  ? Math.round(((totalMonthly - unprocessedCount) / totalMonthly) * 100)
                  : 0}
                % 完了
              </span>
            </div>
          </div>

          {/* 経費リスト */}
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="spinner" />
            </div>
          ) : (
            <div
              className="space-y-2"
              style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}
            >
              {(expenses ?? []).map((item) => {
                const isImported = item.status === 'approved';
                const isToggling = togglingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border-l-4 ${
                      isImported
                        ? 'border-gray-300 bg-gray-50/60'
                        : 'border-orange-400 bg-orange-50/40'
                    } hover:bg-gray-100 transition-colors`}
                  >
                    <div className="flex items-start gap-2">
                      <label
                        className="flex items-center mt-0.5 cursor-pointer shrink-0"
                        title="会計ソフト取込済み"
                      >
                        <input
                          type="checkbox"
                          checked={isImported}
                          onChange={() => handleToggleAccounting(item.id, item.status, item.project_id ?? null)}
                          disabled={isToggling}
                          className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                        />
                      </label>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-gray-500">{item.expense_date}</span>
                            <span
                              className="badge badge-green"
                              style={{ fontSize: 10, padding: '1px 5px' }}
                            >
                              {item.category}
                            </span>
                            {isImported && (
                              <span
                                className="badge badge-blue"
                                style={{ fontSize: 9, padding: '0px 4px' }}
                              >
                                取込済
                              </span>
                            )}
                          </div>
                          <span
                            className={`font-bold whitespace-nowrap ${
                              isImported ? 'text-gray-400' : 'text-gray-800'
                            }`}
                          >
                            ¥{item.amount.toLocaleString()}
                          </span>
                        </div>

                        {item.memo && (
                          <p
                            className={`text-sm mt-1 font-medium ${
                              isImported ? 'text-gray-400' : 'text-gray-800'
                            }`}
                          >
                            {item.memo}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          {(item.project_number || item.customer_name) && (
                            <span className="inline-flex items-center gap-0.5">
                              <span className="material-icons" style={{ fontSize: 12 }}>
                                folder
                              </span>
                              {item.project_number}
                              {item.customer_name ? ` ${item.customer_name}` : ''}
                            </span>
                          )}
                          {item.receipt_image_url && (
                            <a
                              href={item.receipt_image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-blue-500 hover:underline"
                            >
                              <span className="material-icons" style={{ fontSize: 12 }}>
                                receipt
                              </span>
                              レシート
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(expenses?.length ?? 0) === 0 && (
                <p className="text-center text-gray-500 py-4">経費データがありません</p>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && <div className={`toast show ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
