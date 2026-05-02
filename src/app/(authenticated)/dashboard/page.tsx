'use client';

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useDashboard } from '@/hooks/useDashboard';
import NoticesTab from '@/components/notices/NoticesTab';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Title, Tooltip, Legend);

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06C755', '#ec4899'];

function formatYen(v: number) {
  if (v >= 10000) return `${Math.floor(v / 10000).toLocaleString()}万円`;
  return `${v.toLocaleString()}円`;
}

type SalesPeriodMode = 'month' | 'quarter' | 'year';
type DashboardTab = 'management' | 'calendar' | 'notices';

/** 暦の YYYY-MM から年度Q（4月始まり）インデックス 0..3 */
function fiscalQuarterIndex(ym: string): number {
  const monthNum = parseInt(ym.slice(5, 7), 10);
  if (monthNum >= 4 && monthNum <= 6) return 0;
  if (monthNum >= 7 && monthNum <= 9) return 1;
  if (monthNum >= 10) return 2;
  return 3;
}

const TABS: { key: DashboardTab; label: string; icon: string }[] = [
  { key: 'management', label: '管理業務', icon: 'dashboard' },
  { key: 'calendar', label: 'カレンダー', icon: 'calendar_today' },
  { key: 'notices', label: '連絡事項', icon: 'campaign' },
];

function getPeriodDates(period: string): { start: string; end: string } {
  const now = new Date();
  if (period === '今四半期') {
    const q = Math.floor(now.getMonth() / 3);
    const startMonth = q * 3 + 1;
    const endMonth = q * 3 + 3;
    return {
      start: `${now.getFullYear()}-${String(startMonth).padStart(2, '0')}-01`,
      end: `${now.getFullYear()}-${String(endMonth).padStart(2, '0')}-${new Date(now.getFullYear(), endMonth, 0).getDate()}`,
    };
  }
  if (period === '今年') {
    return {
      start: `${now.getFullYear()}-01-01`,
      end: `${now.getFullYear()}-12-31`,
    };
  }
  // 今月
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`,
  };
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('management');

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="material-icons" style={{ fontSize: 18 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'management' && <ManagementTab />}
      {activeTab === 'calendar' && <CalendarTab />}
      {activeTab === 'notices' && <NoticesTab />}
    </div>
  );
}

// ============================================================
// 管理業務タブ
// ============================================================
function ManagementTab() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState('今月');
  const [salesMode, setSalesMode] = useState<SalesPeriodMode>('month');

  const { start, end } = useMemo(() => getPeriodDates(period), [period]);
  const { data, isLoading, error } = useDashboard(start, end, user?.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" /><p className="ml-3 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-gray-500">
        <span className="material-icons text-5xl mb-2">cloud_off</span>
        <p>ダッシュボードデータの取得に失敗しました</p>
      </div>
    );
  }

  const kpi = data.kpi;
  const bonus = data.bonus_progress;

  const kpiItems = [
    { title: '担当案件数', value: String(kpi.assigned_projects_count), unit: '件' },
    { title: '見込み金額', value: formatYen(kpi.assigned_projects_amount), unit: '' },
    { title: '見積もり数', value: String(kpi.sent_estimates_count), unit: '件' },
    { title: '送客金額', value: formatYen(kpi.sent_estimates_amount), unit: '' },
    { title: '契約数', value: String(kpi.contract_count), unit: '件' },
    { title: '契約平均単価', value: kpi.average_contract_amount > 0 ? formatYen(kpi.average_contract_amount) : '-', unit: '' },
    { title: '契約率', value: String(kpi.contract_rate), unit: '%' },
    { title: '粗利率', value: String(kpi.gross_profit_rate), unit: '%' },
  ];

  const performanceTrend = data.charts?.performance_trend ?? [];
  const performanceBarChart = useMemo(() => {
    if (salesMode === 'year') {
      const sumEst = performanceTrend.reduce((s, r) => s + r.estimate_presented, 0);
      const sumCon = performanceTrend.reduce((s, r) => s + r.contract_amount, 0);
      const sumComp = performanceTrend.reduce((s, r) => s + r.completed_amount, 0);
      const sumProfit = performanceTrend.reduce((s, r) => s + r.profit_amount, 0);
      return {
        labels: ['前々年度', '前年度', '今年度'],
        estimate_presented: [0, 0, sumEst],
        contract_amount: [0, 0, sumCon],
        completed_amount: [0, 0, sumComp],
        profit_amount: [0, 0, sumProfit],
      };
    }
    if (salesMode === 'quarter') {
      const qLabels = ['Q1 (4-6月)', 'Q2 (7-9月)', 'Q3 (10-12月)', 'Q4 (1-3月)'];
      const estimate_presented = [0, 0, 0, 0];
      const contract_amount = [0, 0, 0, 0];
      const completed_amount = [0, 0, 0, 0];
      const profit_amount = [0, 0, 0, 0];
      performanceTrend.forEach((r) => {
        const qi = fiscalQuarterIndex(r.month);
        estimate_presented[qi] += r.estimate_presented;
        contract_amount[qi] += r.contract_amount;
        completed_amount[qi] += r.completed_amount;
        profit_amount[qi] += r.profit_amount;
      });
      return { labels: qLabels, estimate_presented, contract_amount, completed_amount, profit_amount };
    }
    return {
      labels: performanceTrend.map((r) => r.month),
      estimate_presented: performanceTrend.map((r) => r.estimate_presented),
      contract_amount: performanceTrend.map((r) => r.contract_amount),
      completed_amount: performanceTrend.map((r) => r.completed_amount),
      profit_amount: performanceTrend.map((r) => r.profit_amount),
    };
  }, [performanceTrend, salesMode]);

  const performanceBarChartConfig = {
    labels: performanceBarChart.labels,
    datasets: [
      {
        label: '見積提示金額',
        data: performanceBarChart.estimate_presented,
        backgroundColor: 'rgba(59, 130, 246, 0.75)',
        borderColor: '#2563eb',
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 18,
      },
      {
        label: '契約金額',
        data: performanceBarChart.contract_amount,
        backgroundColor: 'rgba(6, 199, 85, 0.75)',
        borderColor: '#059669',
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 18,
      },
      {
        label: '完了金額',
        data: performanceBarChart.completed_amount,
        backgroundColor: 'rgba(245, 158, 11, 0.85)',
        borderColor: '#d97706',
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 18,
      },
      {
        label: '利益金額',
        data: performanceBarChart.profit_amount,
        backgroundColor: 'rgba(239, 68, 68, 0.75)',
        borderColor: '#dc2626',
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 18,
      },
    ],
  };

  const performanceBarChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { boxWidth: 12, padding: 12, font: { size: 10 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const y = ctx.parsed.y;
            if (y == null) return '';
            const label = ctx.dataset.label || '';
            return `${label}: ${Number(y).toLocaleString()}円`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: false,
        ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } },
      },
      y: {
        beginAtZero: true,
        ticks: { callback: (v: number | string) => (Number(v) / 10000).toLocaleString() + '万円' },
      },
    },
  };

  const routeChart = data.charts?.acquisition_route ?? [];
  const routeTotal = routeChart.reduce((s, r) => s + r.count, 0);
  const routeStackedData = {
    labels: ['集客ルート'],
    datasets: routeChart.map((r, i) => ({
      label: r.route,
      data: [r.count],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
      barPercentage: 0.6,
    })),
  };
  const routeStackedOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        max: routeTotal || 1,
        ticks: {
          callback: (v: number | string) => Math.round(Number(v) / (routeTotal || 1) * 100) + '%',
          font: { size: 10 },
        },
        grid: { display: false },
      },
      y: { stacked: true, display: false },
    },
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 10 }, padding: 8 } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; raw: unknown }) => {
            const pct = routeTotal > 0 ? ((Number(ctx.raw) / routeTotal) * 100).toFixed(1) : '0';
            return `${ctx.dataset.label}: ${ctx.raw}件 (${pct}%)`;
          },
        },
      },
    },
  };

  const workChart = data.charts?.work_type ?? [];
  const workBarData = {
    labels: workChart.map((w) => w.type),
    datasets: [{
      label: '売上',
      data: workChart.map((w) => w.amount),
      backgroundColor: workChart.map((_, i) => {
        const colors = ['#06C755', '#05a948', '#3b82f6', '#2563eb', '#1d4ed8', '#8b5cf6', '#a78bfa'];
        return colors[i % colors.length];
      }),
      borderRadius: 4,
    }],
  };
  const workBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number } }) => '売上: ' + ctx.parsed.y.toLocaleString() + '円',
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v: number | string) => (Number(v) / 10000).toLocaleString() + '万円' },
      },
    },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">営業ダッシュボード: {data.user_name || user?.name || ''}</h2>
        <div className="flex gap-2">
          {['今月', '今四半期', '今年'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                period === p ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        {kpiItems.map((item) => (
          <div key={item.title} className="kpi-card">
            <div className="kpi-title">{item.title}</div>
            <div className="kpi-value">
              {item.value}
              {item.unit && <span className="kpi-unit">{item.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {bonus && (
        <div className="my-bonus-section">
          <div className="my-bonus-header">
            <h3>
              <span className="material-icons" style={{ color: '#f59e0b' }}>emoji_events</span>{' '}
              マイボーナス進捗（{bonus.period_label}）
            </h3>
            <span className="my-bonus-period">{bonus.period_months}</span>
          </div>
          <div className="my-bonus-grid">
            <div className="my-bonus-card">
              <div className="my-bonus-label">固定費負担額</div>
              <div className="my-bonus-value">{formatYen(bonus.fixed_cost)}</div>
            </div>
            <div className="my-bonus-card">
              <div className="my-bonus-label">期間粗利</div>
              <div className="my-bonus-value">{formatYen(bonus.gross_profit)}</div>
            </div>
            <div className={`my-bonus-card ${bonus.surplus >= 0 ? 'highlight-positive' : ''}`}>
              <div className="my-bonus-label">粗利 − 固定費</div>
              <div className="my-bonus-value">{bonus.surplus >= 0 ? '+' : ''}{formatYen(bonus.surplus)}</div>
            </div>
            <div className="my-bonus-card highlight-accent">
              <div className="my-bonus-label">ボーナス見込み</div>
              <div className="my-bonus-value">{formatYen(bonus.bonus_estimate)}</div>
              <div className="my-bonus-sub">超過分 × {bonus.distribution_rate}%</div>
            </div>
          </div>
          <div className="my-bonus-progress-wrap">
            <div className="my-bonus-progress-labels">
              <span>0</span>
              <span className="my-bonus-breakeven-label">固定費 {formatYen(bonus.fixed_cost)}</span>
              <span>目標 {formatYen(bonus.target_amount)}</span>
            </div>
            <div className="my-bonus-progress-bar">
              <div className="my-bonus-progress-fill" style={{ width: `${Math.min(100, bonus.achievement_rate)}%` }} />
              {bonus.target_amount > 0 && (
                <div className="my-bonus-breakeven-line" style={{ left: `${Math.min(100, (bonus.fixed_cost / bonus.target_amount) * 100)}%` }} />
              )}
            </div>
            <div className="my-bonus-progress-current">
              現在: {formatYen(bonus.gross_profit)}（達成率 {bonus.achievement_rate}%）
            </div>
          </div>
        </div>
      )}

      <div className="charts-grid">
        <div className="chart-card chart-card-wide">
          <div className="chart-header">
            <h3 className="font-bold">業績推移</h3>
            <div className="chart-period-tabs">
              {([['month', '月'], ['quarter', '四半期'], ['year', '年']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  className={`chart-tab ${salesMode === mode ? 'active' : ''}`}
                  onClick={() => setSalesMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 280 }}>
            <Bar data={performanceBarChartConfig as never} options={performanceBarChartOptions as never} />
          </div>
        </div>

        {routeChart.length > 0 && (
          <div className="chart-card">
            <h3 className="font-bold mb-4">集客ルート別案件数</h3>
            <div style={{ height: 200 }}>
              <Bar data={routeStackedData} options={routeStackedOptions as never} />
            </div>
          </div>
        )}

        {workChart.length > 0 && (
          <div className="chart-card">
            <h3 className="font-bold mb-4">工事種別別売上</h3>
            <div className="h-64">
              <Bar data={workBarData} options={workBarOptions as never} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// カレンダータブ
// ============================================================
function CalendarTab() {
  const [calendarId, setCalendarId] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('google_calendar_id') || '' : ''
  );
  const [inputId, setInputId] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const saveCalendarId = () => {
    const id = inputId.trim();
    if (id) {
      localStorage.setItem('google_calendar_id', id);
      setCalendarId(id);
      setShowSettings(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="material-icons text-green-600">calendar_today</span>
          Googleカレンダー
        </h2>
        <button
          onClick={() => { setShowSettings(!showSettings); setInputId(calendarId); }}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
        >
          <span className="material-icons" style={{ fontSize: 14 }}>settings</span>
          カレンダー設定
        </button>
      </div>

      {showSettings && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-blue-800 mb-2 font-medium">GoogleカレンダーIDを設定</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="カレンダーID（例: abc123@group.calendar.google.com）"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button onClick={saveCalendarId} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">保存</button>
            <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          </div>
        </div>
      )}

      {calendarId ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
          <iframe
            src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=Asia%2FTokyo&showTitle=0&showNav=1&showPrint=0&showCalendars=0`}
            style={{ border: 0, width: '100%', height: '100%' }}
            title="Google Calendar"
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <span className="material-icons text-gray-200" style={{ fontSize: 64 }}>calendar_today</span>
          <p className="text-gray-400 mt-4">GoogleカレンダーIDが設定されていません</p>
          <button onClick={() => setShowSettings(true)} className="mt-4 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 inline-flex items-center gap-1">
            <span className="material-icons" style={{ fontSize: 16 }}>settings</span>
            カレンダーIDを設定
          </button>
        </div>
      )}
    </div>
  );
}

// NoticesTab は src/components/notices/NoticesTab.tsx に実装済み
