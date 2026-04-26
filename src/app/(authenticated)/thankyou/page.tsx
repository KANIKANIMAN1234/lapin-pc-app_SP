'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Project } from '@/types';

type TemplateType = 'thankyou' | 'seasonal' | 'campaign';

const TEMPLATES = [
  {
    id: 'thankyou' as TemplateType,
    label: 'お礼状',
    icon: 'favorite',
    iconColor: '#ef4444',
    title: 'ラパンリフォーム',
    body: 'この度はリフォーム工事にご依頼いただき誠にありがとうございました。\n今後もお住まいのことでお気軽にご相談ください。\n今後ともどうぞよろしくお願いいたします。',
  },
  {
    id: 'seasonal' as TemplateType,
    label: '季節DM',
    icon: 'pets',
    iconColor: '#374151',
    title: 'ラパンリフォーム',
    body: '春の訪れと共に、ご挨拶申し上げます。\n季節の変わり目は外壁や屋根の点検に最適な時期です。\n無料点検も承っておりますので、お気軽にお問い合わせください。',
  },
  {
    id: 'campaign' as TemplateType,
    label: 'キャンペーン',
    icon: 'auto_awesome',
    iconColor: '#374151',
    title: 'ラパンリフォーム',
    body: '春のリフォームキャンペーン実施中です。\n期間中のご契約で工事費用を最大10%割引いたします。\nこの機会にぜひご検討ください。',
  },
];

export default function ThankYouPage() {
  const queryClient = useQueryClient();
  const [activeTemplate, setActiveTemplate] = useState<TemplateType>('thankyou');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['thankyou-projects'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_projects')
        .select('id, project_number, customer_name, address, work_description, completion_date, thankyou_flag')
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('completion_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as (Pick<Project, 'id' | 'project_number' | 'customer_name' | 'address' | 'work_description' | 'completion_date'> & { thankyou_flag: boolean })[];
    },
  });

  const markSentMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('t_projects')
        .update({ thankyou_flag: true })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thankyou-projects'] });
      setSelectedIds(new Set());
    },
  });

  const template = TEMPLATES.find((t) => t.id === activeTemplate)!;

  const filtered = projects.filter((p) => {
    if (!keyword) return true;
    return (
      p.customer_name.includes(keyword) ||
      p.project_number.includes(keyword) ||
      (p.address ?? '').includes(keyword)
    );
  });

  const unsentCount = projects.filter((p) => !p.thankyou_flag).length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleMarkSent = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}件を送付済みにしますか？`)) return;
    markSentMutation.mutate(Array.from(selectedIds));
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <span className="material-icons text-green-600">mail</span>
        お礼状・DM管理
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: テンプレート選択 + プレビュー */}
        <div>
          {/* テンプレートタブ */}
          <div className="flex gap-2 mb-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTemplate(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border transition-colors ${
                  activeTemplate === t.id
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="material-icons text-base">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* プレビュー */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
              <span>プレビュー</span>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
              >
                <span className="material-icons text-sm">print</span>印刷
              </button>
            </div>
            <div className="p-8 min-h-[320px]" id="print-area">
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="material-icons text-3xl" style={{ color: template.iconColor }}>{template.icon}</span>
                  <h3 className="text-xl font-bold">{template.title}</h3>
                </div>
                <div className="h-0.5 w-24 bg-green-600 mx-auto" />
              </div>

              {selectedIds.size > 0 ? (
                Array.from(selectedIds).slice(0, 1).map((id) => {
                  const p = projects.find((pr) => pr.id === id);
                  if (!p) return null;
                  return (
                    <div key={id} className="mb-4">
                      <p className="text-sm text-gray-500 mb-1">送付先:</p>
                      <p className="font-bold text-lg">{p.customer_name} 様</p>
                      {p.address && <p className="text-sm text-gray-500">{p.address}</p>}
                    </div>
                  );
                })
              ) : (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-400 text-center">
                  右の一覧から顧客を選択するとここに表示されます
                </div>
              )}

              <div className="whitespace-pre-line text-sm text-gray-700 leading-relaxed mb-6">
                {template.body}
              </div>

              <div className="text-right text-sm text-gray-600">
                <p className="font-bold">{template.title}</p>
                <p>〒350-1305 埼玉県狭山市南入曽580-1</p>
                <p>TEL: 04-2907-5022</p>
              </div>
            </div>
          </div>
        </div>

        {/* 右: 顧客リスト */}
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">
                  完工案件一覧
                  <span className="ml-2 text-sm font-normal text-orange-500">未送付: {unsentCount}件</span>
                </h3>
                <div className="flex gap-2">
                  {selectedIds.size > 0 && (
                    <button
                      onClick={handleMarkSent}
                      disabled={markSentMutation.isPending}
                      className="btn-primary text-sm py-1.5 px-3"
                    >
                      <span className="material-icons text-base">mark_email_read</span>
                      送付済み({selectedIds.size})
                    </button>
                  )}
                </div>
              </div>
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
                <input
                  type="text"
                  className="form-input pl-10 w-full"
                  placeholder="顧客名・案件番号で検索"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12"><div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p></div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
                {filtered.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded accent-green-600"
                    />
                    <span className="text-xs text-gray-500">全選択 ({filtered.length}件)</span>
                  </div>
                )}
                {filtered.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${selectedIds.has(p.id) ? 'bg-green-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="rounded accent-green-600 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.customer_name}</span>
                        <span className="text-xs text-gray-400">{p.project_number}</span>
                        {p.thankyou_flag && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">送付済</span>
                        )}
                      </div>
                      {p.address && <p className="text-xs text-gray-400 truncate">{p.address}</p>}
                      {p.completion_date && (
                        <p className="text-xs text-gray-400">完工: {p.completion_date}</p>
                      )}
                    </div>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <div className="text-center py-10 text-gray-400">
                    <span className="material-icons text-4xl mb-2 block" style={{ color: '#d1d5db' }}>search_off</span>
                    <p className="text-sm">該当する案件がありません</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
