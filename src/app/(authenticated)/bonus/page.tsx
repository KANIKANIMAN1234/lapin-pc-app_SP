'use client';

import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';

function formatYen(v: number) {
  if (v === 0) return '¥0';
  const neg = v < 0;
  const abs = Math.abs(v);
  const str = abs >= 10000
    ? `¥${(abs / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })}万`
    : `¥${abs.toLocaleString()}`;
  return neg ? `-${str}` : str;
}

interface BonusPeriodRow {
  id: string;
  period_label: string;
  months_label: string;
  period_start: string;
  period_end: string;
  fixed_cost: number;
  distribution_rate: number;
  target_amount: number;
}

interface UserSummary {
  user_id: string;
  name: string;
  role: string;
  contract_count: number;
  contract_amount: number;
  gross_profit: number;
  fixed_cost: number;
  surplus: number;
  bonus_estimate: number;
  achievement_rate: number;
}

export default function BonusPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['bonus-overview'],
    queryFn: async () => {
      const supabase = createClient();

      // 現在の期間を取得（今日が含まれる期間）
      const today = new Date().toISOString().split('T')[0];
      const { data: periods, error: pe } = await supabase
        .from('m_bonus_periods')
        .select('*')
        .lte('period_start', today)
        .gte('period_end', today)
        .limit(1);

      if (pe) throw pe;

      const period: BonusPeriodRow | null = periods?.[0] ?? null;

      if (!period) return { period: null, employees: [], summary: null };

      // 期間内の契約案件を集計
      const { data: projects, error: prjErr } = await supabase
        .from('t_projects')
        .select('assigned_to, contract_amount, gross_profit')
        .eq('status', 'contract')
        .gte('contract_date', period.period_start)
        .lte('contract_date', period.period_end)
        .is('deleted_at', null);

      if (prjErr) throw prjErr;

      // 全ユーザー（sales）取得
      const { data: users, error: ue } = await supabase
        .from('m_users')
        .select('id, name, role, role_level')
        .eq('status', 'active')
        .in('role_level', ['admin', 'staff', 'sales']);

      if (ue) throw ue;

      // ユーザーごとに集計
      const perUser: Record<string, { contract_count: number; contract_amount: number; gross_profit: number }> = {};
      for (const p of projects ?? []) {
        if (!perUser[p.assigned_to]) {
          perUser[p.assigned_to] = { contract_count: 0, contract_amount: 0, gross_profit: 0 };
        }
        perUser[p.assigned_to].contract_count += 1;
        perUser[p.assigned_to].contract_amount += Number(p.contract_amount ?? 0);
        perUser[p.assigned_to].gross_profit += Number(p.gross_profit ?? 0);
      }

      const fixedCostPerPerson = period.fixed_cost / Math.max(1, (users ?? []).filter((u) => (u as { role_level?: string }).role_level === 'sales').length);

      const employees: UserSummary[] = (users ?? [])
        .filter((u) => (u as { role_level?: string }).role_level === 'sales')
        .map((u) => {
          const agg = perUser[u.id] ?? { contract_count: 0, contract_amount: 0, gross_profit: 0 };
          const surplus = agg.gross_profit - fixedCostPerPerson;
          const bonus_estimate = surplus > 0 ? Math.floor(surplus * (period.distribution_rate / 100)) : 0;
          const achievement_rate = period.target_amount > 0
            ? Math.round((agg.gross_profit / period.target_amount) * 100)
            : 0;
          return {
            user_id: u.id,
            name: u.name,
            role: u.role,
            ...agg,
            fixed_cost: fixedCostPerPerson,
            surplus,
            bonus_estimate,
            achievement_rate,
          };
        })
        .sort((a, b) => b.gross_profit - a.gross_profit);

      const summary = {
        total_employees: employees.length,
        total_contract_count: employees.reduce((s, e) => s + e.contract_count, 0),
        total_gross_profit: employees.reduce((s, e) => s + e.gross_profit, 0),
        total_bonus: employees.reduce((s, e) => s + e.bonus_estimate, 0),
      };

      return { period, employees, summary };
    },
    enabled: user?.roleLevel === 'admin',
  });

  if (user?.roleLevel !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <span className="material-icons text-6xl text-red-300 mb-4">lock</span>
        <h2 className="text-xl font-bold text-gray-700 mb-2">アクセスできません</h2>
        <p className="text-gray-500">このページは管理者（admin）専用です。</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const { period, employees, summary } = data ?? { period: null, employees: [], summary: null };

  if (!period) {
    return (
      <div>
        <h2 className="text-xl font-bold mb-6">ボーナス計算（管理者専用）</h2>
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100">
          <span className="material-icons text-5xl mb-3 block" style={{ color: '#d1d5db' }}>info</span>
          <p className="font-medium">現在のボーナス期間データがありません</p>
          <p className="text-sm mt-1 text-gray-400">Supabase の m_bonus_periods テーブルを確認してください</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">ボーナス計算（管理者専用）- 固定費ベース方式</h2>

      {/* 期間情報 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">{period.period_label}</h3>
            <p className="text-sm text-gray-500">{period.months_label}（{period.period_start} 〜 {period.period_end}）</p>
          </div>
          <div className="flex gap-6 text-sm text-gray-600 flex-wrap">
            <div>固定費合計: <span className="font-bold text-gray-900">{formatYen(period.fixed_cost)}</span></div>
            <div>配分率: <span className="font-bold text-gray-900">{period.distribution_rate}%</span></div>
            <div>目標粗利: <span className="font-bold text-gray-900">{formatYen(period.target_amount)}</span></div>
          </div>
        </div>
      </div>

      {/* サマリーカード */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: '対象社員数', value: `${summary.total_employees}名`, color: '' },
            { label: '全体契約数', value: `${summary.total_contract_count}件`, color: '' },
            { label: '全体粗利合計', value: formatYen(summary.total_gross_profit), color: '' },
            { label: 'ボーナス合計', value: formatYen(summary.total_bonus), color: 'text-green-600' },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
              <div className="text-sm text-gray-500 mb-1">{card.label}</div>
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 社員別テーブル */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-bold">社員別ボーナス一覧</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['社員名', '契約数', '契約金額', '粗利額', '固定費', '超過額', 'ボーナス見込', '達成率'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const rate = Math.min(100, emp.achievement_rate);
                const color = rate >= 100 ? '#06C755' : rate >= 70 ? '#f59e0b' : '#ef4444';
                const textColor = rate >= 100 ? 'text-green-600' : rate >= 70 ? 'text-yellow-600' : 'text-red-500';
                return (
                  <tr key={emp.user_id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{emp.name}</td>
                    <td className="px-4 py-3">{emp.contract_count}件</td>
                    <td className="px-4 py-3">{formatYen(emp.contract_amount)}</td>
                    <td className="px-4 py-3 font-medium">{formatYen(emp.gross_profit)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatYen(emp.fixed_cost)}</td>
                    <td className={`px-4 py-3 font-medium ${emp.surplus >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {emp.surplus >= 0 ? '+' : ''}{formatYen(emp.surplus)}
                    </td>
                    <td className="px-4 py-3 font-bold text-green-700">{formatYen(emp.bonus_estimate)}</td>
                    <td className="px-4 py-3" style={{ minWidth: 140 }}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: color }} />
                        </div>
                        <span className={`text-xs font-bold ${textColor}`} style={{ minWidth: 38 }}>
                          {emp.achievement_rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">対象社員がいません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
