'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';

type InspectionType = '1year' | '3year';
type InspectionStatus = 'scheduled' | 'completed' | 'overdue';

interface InspectionItem {
  project_id: string;
  project_number: string;
  customer_name: string;
  address?: string;
  inspection_type: InspectionType;
  inspection_date: string;
  status: InspectionStatus;
  assigned_to_name?: string;
}

const TYPE_LABELS: Record<InspectionType, string> = {
  '1year': '1年点検',
  '3year': '3年点検',
};

const STATUS_CONFIG: Record<InspectionStatus, { class: string; label: string }> = {
  scheduled: { class: 'badge-blue', label: '予定' },
  completed: { class: 'badge-green', label: '完了' },
  overdue: { class: 'badge-red', label: '期限超過' },
};

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

function calcStatus(inspectionDate: string): InspectionStatus {
  const now = new Date();
  const dt = new Date(inspectionDate);
  const diffDays = Math.floor((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < -30) return 'overdue';
  return 'scheduled';
}

export default function InspectionPage() {
  const [typeFilter, setTypeFilter] = useState<'all' | InspectionType>('all');

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ['inspections'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_projects')
        .select(`
          id, project_number, customer_name, address,
          completion_date, inspection_flag,
          m_users!assigned_to(name)
        `)
        .eq('status', 'completed')
        .not('completion_date', 'is', null)
        .is('deleted_at', null)
        .order('completion_date', { ascending: false });

      if (error) throw error;

      const items: InspectionItem[] = [];
      for (const p of data ?? []) {
        if (!p.completion_date) continue;
        const assignedName = (p.m_users as unknown as { name: string } | null)?.name;

        for (const years of [1, 3] as const) {
          const type: InspectionType = years === 1 ? '1year' : '3year';
          const inspDate = addYears(p.completion_date, years);
          const status = calcStatus(inspDate);
          items.push({
            project_id: p.id,
            project_number: p.project_number,
            customer_name: p.customer_name,
            address: p.address,
            inspection_type: type,
            inspection_date: inspDate,
            status,
            assigned_to_name: assignedName,
          });
        }
      }

      return items.sort(
        (a, b) => new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime()
      );
    },
  });

  const filtered =
    typeFilter === 'all' ? inspections : inspections.filter((i) => i.inspection_type === typeFilter);

  const overdueCount = inspections.filter((i) => i.status === 'overdue').length;
  const upcomingCount = inspections.filter((i) => {
    const days = Math.floor(
      (new Date(i.inspection_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return days >= 0 && days <= 90;
  }).length;

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
        <h2 className="text-xl font-bold">点検スケジュール（{inspections.length}件）</h2>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <span className="text-red-600 font-medium">期限超過: {overdueCount}件</span>
          <span className="text-blue-600 font-medium">90日以内: {upcomingCount}件</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />予定
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />期限超過
          </span>
        </div>
        <div className="flex gap-1 ml-auto">
          {(['all', '1year', '3year'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                typeFilter === f
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? '全て' : TYPE_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.map((item, idx) => (
          <div
            key={`${item.project_id}-${item.inspection_type}`}
            className={`flex items-start gap-4 p-4 ${
              idx > 0 ? 'border-t border-gray-100' : ''
            } ${item.status === 'overdue' ? 'bg-red-50' : 'hover:bg-gray-50'}`}
          >
            <div className="shrink-0 w-28 text-center pt-0.5">
              <span className={`badge ${STATUS_CONFIG[item.status].class}`}>
                {STATUS_CONFIG[item.status].label}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold">{item.customer_name}</span>
                <span className="text-gray-400 text-sm">{item.project_number}</span>
                <span className="badge badge-blue">{TYPE_LABELS[item.inspection_type]}</span>
              </div>
              {item.address && <p className="text-sm text-gray-600">{item.address}</p>}
              {item.assigned_to_name && (
                <p className="text-sm text-gray-500">担当: {item.assigned_to_name}</p>
              )}
            </div>
            <div className="shrink-0 text-sm text-gray-500 text-right">
              <p className="font-medium">{item.inspection_date}</p>
              <p className="text-xs text-gray-400">点検予定日</p>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <span className="material-icons text-5xl mb-2 block" style={{ color: '#d1d5db' }}>
              event_busy
            </span>
            <p>点検予定はありません</p>
          </div>
        )}
      </div>
    </div>
  );
}
