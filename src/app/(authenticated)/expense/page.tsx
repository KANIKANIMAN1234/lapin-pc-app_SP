'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { TablesInsert } from '@/types/supabase';

const EXPENSE_CATEGORIES = ['交通費', '駐車場', '材料費', '外注費', '接待費', '消耗品費', 'その他'];

function formatYen(v: number) {
  return `${v.toLocaleString()}円`;
}

function useExpenses() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['expenses', user?.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_expenses')
        .select('*')
        .eq('user_id', user?.id ?? '')
        .order('expense_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

export default function ExpensePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: expenses, isLoading } = useExpenses();
  const [form, setForm] = useState({ amount: '', date: new Date().toISOString().substring(0, 10), category: '', memo: '' });
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const { mutateAsync: createExpense, isPending } = useMutation({
    mutationFn: async (expense: TablesInsert<'t_expenses'>) => {
      const supabase = createClient();
      const { error } = await supabase.from('t_expenses').insert(expense);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
      setForm({ amount: '', date: new Date().toISOString().substring(0, 10), category: '', memo: '' });
      showToast('経費を登録しました');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.category) return;
    await createExpense({
      amount: Number(form.amount),
      expense_date: form.date,
      category: form.category,
      memo: form.memo || null,
      user_id: user?.id ?? '',
    });
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">経費登録</h2>
      <div className="expense-layout">
        {/* 登録フォーム */}
        <div className="expense-form-card">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <span className="material-icons text-green-600" style={{ fontSize: 18 }}>add_circle</span>
            新規経費登録
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label>金額（円） <span className="required">*</span></label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="form-input" placeholder="例: 1500" min={1} required />
            </div>
            <div className="form-group">
              <label>日付</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="form-input" />
            </div>
            <div className="form-group">
              <label>カテゴリ <span className="required">*</span></label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="form-input" required>
                <option value="">選択してください</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>メモ</label>
              <input type="text" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} className="form-input" placeholder="内容・用途など" />
            </div>
            <button type="submit" disabled={isPending} className="btn-primary w-full">
              {isPending ? '登録中...' : '経費を登録'}
            </button>
          </form>
        </div>

        {/* 履歴 */}
        <div className="expense-history-card">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <span className="material-icons text-green-600" style={{ fontSize: 18 }}>history</span>
            経費履歴（直近50件）
          </h3>
          {isLoading ? (
            <div className="flex items-center justify-center p-8"><div className="spinner" /></div>
          ) : (expenses?.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">経費がありません</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>日付</th><th>カテゴリ</th><th>金額</th><th>メモ</th></tr></thead>
              <tbody>
                {expenses?.map((e) => (
                  <tr key={e.id}>
                    <td className="text-xs">{e.expense_date}</td>
                    <td><span className="badge badge-blue">{e.category}</span></td>
                    <td className="text-right font-medium">{formatYen(e.amount)}</td>
                    <td className="text-gray-500 text-xs">{e.memo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {toast && <div className="toast show success">{toast}</div>}
    </div>
  );
}
