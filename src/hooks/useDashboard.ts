import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { DashboardKPI, MonthlySalesData, AcquisitionRouteData, WorkTypeData, BonusProgress } from '@/types';

export interface DashboardData {
  user_id: string;
  user_name: string;
  period: { start_date: string; end_date: string };
  kpi: DashboardKPI;
  bonus_progress: BonusProgress | null;
  charts: {
    monthly_sales: MonthlySalesData[];
    acquisition_route: AcquisitionRouteData[];
    work_type: WorkTypeData[];
  };
}

/**
 * ダッシュボード集計データを Supabase から直接集計して取得する
 */
export function useDashboard(startDate: string, endDate: string, userId?: string) {
  return useQuery({
    queryKey: ['dashboard', startDate, endDate, userId],
    queryFn: async (): Promise<DashboardData> => {
      const supabase = createClient();

      // 期間内のアクセス可能な案件を取得（RLSで自動フィルタ）
      let projectsQuery = supabase
        .from('t_projects')
        .select('id, status, prospect_amount, estimated_amount, contract_amount, gross_profit, gross_profit_rate, acquisition_route, work_type, inquiry_date, contract_date, assigned_to')
        .is('deleted_at', null)
        .gte('inquiry_date', startDate)
        .lte('inquiry_date', endDate);

      if (userId) {
        projectsQuery = projectsQuery.eq('assigned_to', userId);
      }

      const { data: projects } = await projectsQuery;
      const pj = projects ?? [];

      const assigned_projects_count = pj.length;
      const assigned_projects_amount = pj.reduce((s, p) => s + (Number(p.prospect_amount) || 0), 0);

      const estimates = pj.filter((p) => p.status === 'estimate' || p.status === 'contract' || p.status === 'in_progress' || p.status === 'completed');
      const sent_estimates_count = estimates.length;
      const sent_estimates_amount = estimates.reduce((s, p) => s + (p.estimated_amount || 0), 0);

      const contracts = pj.filter((p) => ['contract', 'in_progress', 'completed'].includes(p.status));
      const contract_count = contracts.length;
      const contract_amount = contracts.reduce((s, p) => s + (p.contract_amount || 0), 0);
      const contract_rate = sent_estimates_count > 0 ? Math.round((contract_count / sent_estimates_count) * 100) : 0;
      const average_contract_amount = contract_count > 0 ? Math.round(contract_amount / contract_count) : 0;

      const withGrossProfit = contracts.filter((p) => p.gross_profit != null);
      const gross_profit_amount = withGrossProfit.reduce((s, p) => s + (p.gross_profit || 0), 0);
      const gross_profit_rate = contract_amount > 0 ? Math.round((gross_profit_amount / contract_amount) * 100 * 10) / 10 : 0;

      // 月別推移（契約金額＝契約日の月、見込み＝問合せ日の月）
      const contractByMonth: Record<string, number> = {};
      contracts.forEach((p) => {
        if (!p.contract_date) return;
        const month = p.contract_date.substring(0, 7);
        contractByMonth[month] = (contractByMonth[month] || 0) + (p.contract_amount || 0);
      });
      const prospectByMonth: Record<string, number> = {};
      pj.forEach((p) => {
        if (!p.inquiry_date) return;
        const month = String(p.inquiry_date).substring(0, 7);
        prospectByMonth[month] = (prospectByMonth[month] || 0) + (Number(p.prospect_amount) || 0);
      });
      const allMonths = [...new Set([...Object.keys(contractByMonth), ...Object.keys(prospectByMonth)])].sort(
        (a, b) => a.localeCompare(b)
      );
      const monthly_sales: MonthlySalesData[] = allMonths.map((month) => ({
        month,
        amount: contractByMonth[month] || 0,
        prospect_amount: prospectByMonth[month] || 0,
      }));

      // 集客ルート別
      const routeMap: Record<string, { count: number; amount: number }> = {};
      pj.forEach((p) => {
        const r = p.acquisition_route || '不明';
        if (!routeMap[r]) routeMap[r] = { count: 0, amount: 0 };
        routeMap[r].count++;
        routeMap[r].amount += p.contract_amount || 0;
      });
      const acquisition_route: AcquisitionRouteData[] = Object.entries(routeMap).map(([route, v]) => ({
        route,
        count: v.count,
        amount: v.amount,
      }));

      // 工事種別別
      const workMap: Record<string, { count: number; amount: number }> = {};
      pj.forEach((p) => {
        (p.work_type || []).forEach((wt: string) => {
          if (!workMap[wt]) workMap[wt] = { count: 0, amount: 0 };
          workMap[wt].count++;
          workMap[wt].amount += p.contract_amount || 0;
        });
      });
      const work_type: WorkTypeData[] = Object.entries(workMap).map(([type, v]) => ({
        type,
        count: v.count,
        amount: v.amount,
      }));

      // ボーナス進捗（対象ユーザーのみ）
      let bonus_progress: BonusProgress | null = null;
      if (userId) {
        const now = new Date();
        const { data: bonusPeriods } = await supabase
          .from('m_bonus_periods')
          .select('*')
          .lte('period_start', now.toISOString().substring(0, 10))
          .gte('period_end', now.toISOString().substring(0, 10))
          .limit(1)
          .single();

        if (bonusPeriods) {
          const { data: bonusProjects } = await supabase
            .from('t_projects')
            .select('gross_profit')
            .eq('assigned_to', userId)
            .gte('contract_date', bonusPeriods.period_start)
            .lte('contract_date', bonusPeriods.period_end)
            .in('status', ['contract', 'in_progress', 'completed'])
            .is('deleted_at', null);

          const totalGrossProfit = (bonusProjects ?? []).reduce((s, p) => s + (p.gross_profit || 0), 0);
          const surplus = totalGrossProfit - bonusPeriods.fixed_cost;
          const bonus_estimate = surplus > 0 ? Math.round(surplus * (bonusPeriods.distribution_rate / 100)) : 0;
          const achievement_rate = bonusPeriods.fixed_cost > 0
            ? Math.round((totalGrossProfit / bonusPeriods.fixed_cost) * 100)
            : 0;

          bonus_progress = {
            period_label: bonusPeriods.period_label,
            period_months: `${bonusPeriods.period_start} 〜 ${bonusPeriods.period_end}`,
            fixed_cost: bonusPeriods.fixed_cost,
            gross_profit: totalGrossProfit,
            surplus,
            bonus_estimate,
            target_amount: bonusPeriods.target_amount,
            achievement_rate,
            distribution_rate: bonusPeriods.distribution_rate,
          };
        }
      }

      // ユーザー名を取得
      let user_name = '';
      if (userId) {
        const { data: userData } = await supabase
          .from('m_users')
          .select('name')
          .eq('id', userId)
          .single();
        user_name = userData?.name ?? '';
      }

      return {
        user_id: userId ?? '',
        user_name,
        period: { start_date: startDate, end_date: endDate },
        kpi: {
          assigned_projects_count,
          assigned_projects_amount,
          sent_estimates_count,
          sent_estimates_amount,
          contract_count,
          contract_amount,
          contract_rate,
          average_contract_amount,
          gross_profit_rate,
          gross_profit_amount,
        },
        bonus_progress,
        charts: { monthly_sales, acquisition_route, work_type },
      };
    },
    enabled: !!startDate && !!endDate,
  });
}
