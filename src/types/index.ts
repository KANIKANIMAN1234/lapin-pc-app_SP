// User & Auth
export type UserRole = 'admin' | 'staff' | 'sales';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  phone?: string;
  avatar_url?: string;
  line_user_id?: string;
  status: 'active' | 'retired';
}

// Project (案件)
export type ProjectStatus =
  | 'inquiry'
  | 'estimate'
  | 'followup_status'
  | 'contract'
  | 'in_progress'
  | 'completed'
  | 'lost';

export interface Project {
  id: string;
  project_number: string;
  /** 顧客マスタ（m_customers）への参照。未移行データは null の可能性あり */
  customer_id?: string | null;
  customer_name: string;
  /** 案件名（表示・Drive フォルダ名の優先ラベル） */
  project_title?: string | null;
  customer_name_kana?: string;
  postal_code?: string;
  address: string;
  phone: string;
  email?: string;
  work_description: string;
  work_type: string[];
  /** 見込み金額（登録時の概算）。見積提示後は estimated_amount */
  prospect_amount?: number;
  estimated_amount: number;
  contract_amount?: number;
  acquisition_route: string;
  assigned_to: string;
  assigned_to_name?: string;
  status: ProjectStatus;
  inquiry_date: string;
  contract_date?: string;
  start_date?: string;
  completion_date?: string;
  estimate_date?: string;
  planned_budget?: number;
  actual_budget?: number;
  actual_cost?: number;
  gross_profit?: number;
  gross_profit_rate?: number;
  thankyou_flag?: boolean;
  followup_flag?: boolean;
  inspection_flag?: boolean;
  lat?: number;
  lng?: number;
  map_thumbnail_url?: string | null;
  drive_folder_id?: string;
  drive_folder_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Photo
export interface Photo {
  id: string;
  project_id: string;
  type: 'before' | 'inspection' | 'undercoat' | 'completed';
  file_id: string;
  drive_url: string;
  thumbnail_url: string;
  file_name?: string;
  file_size?: number;
  uploaded_by: string;
  uploaded_at: string;
  progress_status?: 'ahead' | 'on_schedule' | 'delayed';
  created_at: string;
  deleted_at?: string | null;
}

// Budget Item
export interface BudgetItem {
  id: string;
  project_id: string;
  item_name: string;
  planned_amount: number;
  planned_vendor?: string;
  actual_amount?: number;
  actual_vendor?: string;
  difference?: number;
}

// Receipt (領収書)
export interface Receipt {
  id: string;
  project_id: string;
  store_name?: string;
  amount: number;
  purchased_at?: string;
  category?: string;
  memo?: string;
  photo_url?: string;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
}

// Meeting Record (商談記録)
export interface Meeting {
  id: string;
  project_id: string;
  meeting_date: string;
  meeting_type: string;
  summary: string;
  audio_url?: string;
  created_by: string;
  created_at: string;
}

// Report (日報)
export interface Report {
  id: string;
  project_id: string;
  report_date: string;
  content: string;
  photos?: string[];
  weather?: string;
  progress_status: 'ahead' | 'on_schedule' | 'delayed';
  created_by: string;
  created_at: string;
}

// Expense (経費)
export interface Expense {
  id: string;
  project_id?: string;
  project_number?: string;
  amount: number;
  date: string;
  category: string;
  memo?: string;
  receipt_url?: string;
  user_id: string;
  created_at: string;
}

// Bonus
export interface BonusPeriod {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  fixed_cost: number;
  distribution_rate: number;
}

export interface BonusProgress {
  period_label: string;
  period_months: string;
  fixed_cost: number;
  gross_profit: number;
  surplus: number;
  bonus_estimate: number;
  target_amount: number;
  achievement_rate: number;
  distribution_rate: number;
}

// Dashboard KPI
export interface DashboardKPI {
  assigned_projects_count: number;
  assigned_projects_amount: number;
  sent_estimates_count: number;
  sent_estimates_amount: number;
  contract_count: number;
  contract_amount: number;
  contract_rate: number;
  average_contract_amount: number;
  gross_profit_rate: number;
  gross_profit_amount: number;
}

/** 業績推移チャート用。月キー YYYY-MM ごとの4指標 */
export interface PerformanceTrendPoint {
  month: string;
  /** 見積提示相当: estimated_amount 合計（estimate_date 優先、なければ inquiry の月） */
  estimate_presented: number;
  /** 契約ベース: contract_date の月 × 契約金額 */
  contract_amount: number;
  /** 完工ベース: ステータス完了、completion_date（なければ contract_date）の月 × 契約金額 */
  completed_amount: number;
  /** 利益: 完了案件の粗利（gross_profit）を同上の月で集計 */
  profit_amount: number;
}

export interface AcquisitionRouteData {
  route: string;
  count: number;
  amount: number;
}

export interface WorkTypeData {
  type: string;
  count: number;
  amount: number;
}

// AppNotification
export interface AppNotification {
  id: string;
  type: 'line_message' | 'project' | 'inspection' | 'followup' | 'photo';
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
}

// Settings
export interface Settings {
  company_name?: string;
  trade_name?: string;
  header_display?: 'company' | 'trade';
  gas_web_app_url?: string;
  google_calendar_id?: string;
  n8n_webhook_url?: string;
}
