'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';

interface FollowupItem {
  id: string;
  project_number: string;
  customer_name: string;
  status: string;
  estimate_date?: string | null;
  days_since_estimate?: number;
  is_overdue?: boolean;
  assigned_to_name?: string;
  followup_flag: boolean;
}

function daysSince(dateStr?: string | null): number | undefined {
  if (!dateStr) return undefined;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function StatusBadge({ isOverdue, days }: { isOverdue?: boolean; days?: number }) {
  if (isOverdue) return <span className="badge badge-red">期限超過</span>;
  if (days !== undefined && days > 3) return <span className="badge badge-yellow">注意</span>;
  return <span className="badge badge-green">余裕</span>;
}

export default function FollowupPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'overdue' | 'attention'>('all');

  const { data: followups = [], isLoading } = useQuery({
    queryKey: ['followups'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_projects')
        .select(`
          id, project_number, customer_name, status,
          estimate_date, followup_flag,
          m_users!assigned_to(name)
        `)
        .eq('followup_flag', true)
        .not('status', 'in', '(completed,lost)')
        .is('deleted_at', null)
        .order('estimate_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      return (data ?? []).map((p) => {
        const days = daysSince(p.estimate_date);
        const isOverdue = days !== undefined && days > 7;
        return {
          ...p,
          assigned_to_name: (p.m_users as unknown as { name: string } | null)?.name,
          days_since_estimate: days,
          is_overdue: isOverdue,
        } as FollowupItem;
      });
    },
  });

  const doneMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'done' | 'skip' }) => {
      const supabase = createClient();
      const updates =
        action === 'done'
          ? { followup_flag: false, status: 'contract' }
          : { followup_flag: false };
      const { error } = await supabase.from('t_projects').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups'] });
    },
  });

  const filtered = followups.filter((f) => {
    if (filter === 'overdue') return f.is_overdue;
    if (filter === 'attention') return !f.is_overdue && (f.days_since_estimate ?? 0) > 3;
    return true;
  });

  const overdueCount = followups.filter((f) => f.is_overdue).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" />
        <p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold">追客管理（{followups.length}件）</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-gray-600 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            期限超過: <strong className="text-red-600">{overdueCount}件</strong>
          </span>
          <div className="flex gap-1">
            {(['all', 'overdue', 'attention'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  filter === f
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? '全て' : f === 'overdue' ? '期限超過' : '要注意'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`bg-white rounded-xl border p-4 shadow-sm ${
              item.is_overdue ? 'border-red-200 bg-red-50' : 'border-gray-100'
            }`}
          >
            <div className="flex flex-wrap justify-between gap-4 items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-gray-800">
                    {item.customer_name} / {item.project_number}
                  </span>
                  <StatusBadge isOverdue={item.is_overdue} days={item.days_since_estimate} />
                  {item.days_since_estimate !== undefined && (
                    <span className="text-sm text-gray-500">
                      {item.is_overdue
                        ? `${item.days_since_estimate}日超過`
                        : `${item.days_since_estimate}日経過`}
                    </span>
                  )}
                </div>
                {item.estimate_date && (
                  <p className="text-sm text-gray-500">
                    見積もり日: {item.estimate_date.substring(0, 10)}
                  </p>
                )}
                {item.assigned_to_name && (
                  <p className="text-sm text-gray-500">担当: {item.assigned_to_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="btn-primary text-sm py-1.5 px-4"
                  disabled={doneMutation.isPending}
                  onClick={() => doneMutation.mutate({ id: item.id, action: 'done' })}
                >
                  対応済み
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5 px-4"
                  disabled={doneMutation.isPending}
                  onClick={() => doneMutation.mutate({ id: item.id, action: 'skip' })}
                >
                  スキップ
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl shadow-sm">
          <span className="material-icons text-5xl mb-2 block" style={{ color: '#d1d5db' }}>
            check_circle
          </span>
          <p>対応が必要な追客はありません</p>
        </div>
      )}
    </div>
  );
}
