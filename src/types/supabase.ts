/**
 * Supabase Database 型定義
 *
 * テーブル命名規則:
 *   m_ = マスターテーブル（m_users, m_customers, m_settings, m_bonus_periods）
 *   t_ = トランザクションテーブル（t_projects, t_photos, t_budgets, ...）
 *
 * 本番では以下のコマンドで自動生成した型に置き換えること:
 *   npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
 *
 * @supabase/supabase-js v2.46+ では GenericTable に Relationships が必須、
 * GenericSchema に PostgrestVersion / CompositeTypes が必須のため含めて定義。
 */

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    PostgrestVersion: "12";
    Tables: {

      // ----------------------------------------------------------
      // マスターテーブル（m_ プレフィックス）
      // ----------------------------------------------------------

      m_users: {
        Row: {
          id: string;
          line_user_id: string | null;
          email: string | null;
          name: string;
          role: string;
          role_level: 'admin' | 'staff' | 'sales';
          phone: string | null;
          avatar_url: string | null;
          status: 'active' | 'retired';
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          line_user_id?: string | null;
          email?: string | null;
          name: string;
          role?: string;
          role_level?: 'admin' | 'staff' | 'sales';
          phone?: string | null;
          avatar_url?: string | null;
          status?: 'active' | 'retired';
          deleted_at?: string | null;
        };
        Update: {
          line_user_id?: string | null;
          email?: string | null;
          name?: string;
          role?: string;
          role_level?: 'admin' | 'staff' | 'sales';
          phone?: string | null;
          avatar_url?: string | null;
          status?: 'active' | 'retired';
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      m_settings: {
        Row: {
          id: string;
          key: string;
          value: string;
          description: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          key: string;
          value: string;
          description?: string | null;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: string;
          description?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };

      m_bonus_periods: {
        Row: {
          id: string;
          year: number;
          period_number: number;
          period_label: string;
          period_start: string;
          period_end: string;
          months_label: string;
          fixed_cost: number;
          distribution_rate: number;
          target_amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          period_number: number;
          period_label: string;
          period_start: string;
          period_end: string;
          months_label: string;
          fixed_cost: number;
          distribution_rate: number;
          target_amount: number;
        };
        Update: {
          year?: number;
          period_number?: number;
          period_label?: string;
          period_start?: string;
          period_end?: string;
          months_label?: string;
          fixed_cost?: number;
          distribution_rate?: number;
          target_amount?: number;
        };
        Relationships: [];
      };

      m_customers: {
        Row: {
          id: string;
          customer_number: string | null;
          customer_name: string;
          customer_name_kana: string | null;
          postal_code: string | null;
          address: string;
          phone: string;
          email: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          customer_number?: string | null;
          customer_name: string;
          customer_name_kana?: string | null;
          postal_code?: string | null;
          address: string;
          phone: string;
          email?: string | null;
          notes?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          customer_number?: string | null;
          customer_name?: string;
          customer_name_kana?: string | null;
          postal_code?: string | null;
          address?: string;
          phone?: string;
          email?: string | null;
          notes?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      // ----------------------------------------------------------
      // トランザクションテーブル（t_ プレフィックス）
      // ----------------------------------------------------------

      t_projects: {
        Row: {
          id: string;
          project_number: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_name_kana: string | null;
          postal_code: string | null;
          address: string;
          phone: string;
          email: string | null;
          work_description: string;
          work_type: string[];
          prospect_amount: number;
          estimated_amount: number;
          contract_amount: number | null;
          actual_cost: number | null;
          gross_profit: number | null;       // Generated Column (readonly)
          gross_profit_rate: number | null;  // Generated Column (readonly)
          acquisition_route: string;
          flyer_area: string | null;
          flyer_distributor_id: string | null;
          assigned_to: string;
          status: 'inquiry' | 'estimate' | 'followup_status' | 'contract' | 'in_progress' | 'completed' | 'lost';
          inquiry_date: string;
          estimate_date: string | null;
          contract_date: string | null;
          start_date: string | null;
          completion_date: string | null;
          implementation_period: string | null;
          expected_order_month: string | null;
          expected_revenue_month: string | null;
          planned_budget: number | null;
          actual_budget: number | null;
          thankyou_flag: boolean;
          followup_flag: boolean;
          inspection_flag: boolean;
          lat: number | null;
          lng: number | null;
          drive_folder_id: string | null;
          drive_folder_url: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_number?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_name_kana?: string | null;
          postal_code?: string | null;
          address: string;
          phone: string;
          email?: string | null;
          work_description?: string;
          work_type: string[];
          prospect_amount?: number;
          estimated_amount?: number;
          contract_amount?: number | null;
          actual_cost?: number | null;
          acquisition_route?: string;
          flyer_area?: string | null;
          flyer_distributor_id?: string | null;
          assigned_to: string;
          status?: 'inquiry' | 'estimate' | 'followup_status' | 'contract' | 'in_progress' | 'completed' | 'lost';
          inquiry_date?: string;
          estimate_date?: string | null;
          contract_date?: string | null;
          start_date?: string | null;
          completion_date?: string | null;
          implementation_period?: string | null;
          expected_order_month?: string | null;
          expected_revenue_month?: string | null;
          planned_budget?: number | null;
          actual_budget?: number | null;
          thankyou_flag?: boolean;
          followup_flag?: boolean;
          inspection_flag?: boolean;
          lat?: number | null;
          lng?: number | null;
          drive_folder_id?: string | null;
          drive_folder_url?: string | null;
          notes?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          customer_id?: string | null;
          customer_name?: string;
          customer_name_kana?: string | null;
          postal_code?: string | null;
          address?: string;
          phone?: string;
          email?: string | null;
          work_description?: string;
          work_type?: string[];
          prospect_amount?: number;
          estimated_amount?: number;
          contract_amount?: number | null;
          actual_cost?: number | null;
          acquisition_route?: string;
          flyer_area?: string | null;
          flyer_distributor_id?: string | null;
          assigned_to?: string;
          status?: 'inquiry' | 'estimate' | 'followup_status' | 'contract' | 'in_progress' | 'completed' | 'lost';
          inquiry_date?: string;
          estimate_date?: string | null;
          contract_date?: string | null;
          start_date?: string | null;
          completion_date?: string | null;
          implementation_period?: string | null;
          expected_order_month?: string | null;
          expected_revenue_month?: string | null;
          planned_budget?: number | null;
          actual_budget?: number | null;
          thankyou_flag?: boolean;
          followup_flag?: boolean;
          inspection_flag?: boolean;
          lat?: number | null;
          lng?: number | null;
          drive_folder_id?: string | null;
          drive_folder_url?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      t_photos: {
        Row: {
          id: string;
          project_id: string;
          type: string;
          file_id: string;
          drive_url: string;
          thumbnail_url: string;
          file_name: string | null;
          file_size: number | null;
          uploaded_by: string;
          uploaded_at: string;
          progress_status: 'ahead' | 'on_schedule' | 'delayed' | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          type: string;
          file_id: string;
          drive_url: string;
          thumbnail_url: string;
          file_name?: string | null;
          file_size?: number | null;
          uploaded_by: string;
          uploaded_at?: string;
          progress_status?: 'ahead' | 'on_schedule' | 'delayed' | null;
          deleted_at?: string | null;
        };
        Update: {
          type?: string;
          file_id?: string;
          drive_url?: string;
          thumbnail_url?: string;
          file_name?: string | null;
          file_size?: number | null;
          progress_status?: 'ahead' | 'on_schedule' | 'delayed' | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      t_budgets: {
        Row: {
          id: string;
          project_id: string;
          item: string;
          item_category: '材料費' | '労務費' | '外注費' | '経費' | 'その他' | null;
          planned_amount: number;
          planned_vendor: string | null;
          actual_amount: number | null;
          actual_vendor: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          item: string;
          item_category?: '材料費' | '労務費' | '外注費' | '経費' | 'その他' | null;
          planned_amount?: number;
          planned_vendor?: string | null;
          actual_amount?: number | null;
          actual_vendor?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          item?: string;
          item_category?: '材料費' | '労務費' | '外注費' | '経費' | 'その他' | null;
          planned_amount?: number;
          planned_vendor?: string | null;
          actual_amount?: number | null;
          actual_vendor?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      t_receipts: {
        Row: {
          id: string;
          project_id: string | null;
          store_name: string | null;
          purchase_date: string | null;
          amount: number;
          items: string | null;
          ocr_result: Json | null;
          ai_candidates: Json | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          image_url: string;
          status: 'pending' | 'confirmed' | 'rejected';
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          store_name?: string | null;
          purchase_date?: string | null;
          amount: number;
          items?: string | null;
          ocr_result?: Json | null;
          ai_candidates?: Json | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          image_url: string;
          status?: 'pending' | 'confirmed' | 'rejected';
          created_by?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          project_id?: string | null;
          store_name?: string | null;
          purchase_date?: string | null;
          amount?: number;
          items?: string | null;
          ocr_result?: Json | null;
          ai_candidates?: Json | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          status?: 'pending' | 'confirmed' | 'rejected';
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      t_meetings: {
        Row: {
          id: string;
          project_id: string;
          meeting_date: string;
          meeting_type: '初回商談' | '現地調査' | '見積提出' | '契約' | '工事確認' | '完工確認' | 'その他' | null;
          audio_url: string | null;
          transcript: string | null;
          summary: string | null;
          customer_requests: Json | null;
          promises: Json | null;
          next_actions: Json | null;
          recorded_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          meeting_date: string;
          meeting_type?: '初回商談' | '現地調査' | '見積提出' | '契約' | '工事確認' | '完工確認' | 'その他' | null;
          audio_url?: string | null;
          transcript?: string | null;
          summary?: string | null;
          customer_requests?: Json | null;
          promises?: Json | null;
          next_actions?: Json | null;
          recorded_by: string;
          deleted_at?: string | null;
        };
        Update: {
          meeting_date?: string;
          meeting_type?: '初回商談' | '現地調査' | '見積提出' | '契約' | '工事確認' | '完工確認' | 'その他' | null;
          audio_url?: string | null;
          transcript?: string | null;
          summary?: string | null;
          customer_requests?: Json | null;
          promises?: Json | null;
          next_actions?: Json | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      t_reports: {
        Row: {
          id: string;
          user_id: string;
          report_date: string;
          title: string | null;
          content: string;
          audio_url: string | null;
          visits: Json | null;
          activities: Json | null;
          achievements: Json | null;
          issues: Json | null;
          next_actions: Json | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          report_date: string;
          title?: string | null;
          content: string;
          audio_url?: string | null;
          visits?: Json | null;
          activities?: Json | null;
          achievements?: Json | null;
          issues?: Json | null;
          next_actions?: Json | null;
          submitted_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          title?: string | null;
          content?: string;
          audio_url?: string | null;
          visits?: Json | null;
          activities?: Json | null;
          achievements?: Json | null;
          issues?: Json | null;
          next_actions?: Json | null;
          submitted_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      t_expenses: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          expense_date: string;
          category: string;
          memo: string | null;
          amount: number;
          receipt_image_url: string | null;
          status: 'pending' | 'approved' | 'rejected';
          approved_by: string | null;
          approved_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          expense_date: string;
          category: string;
          memo?: string | null;
          amount: number;
          receipt_image_url?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          approved_by?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          project_id?: string | null;
          expense_date?: string;
          category?: string;
          memo?: string | null;
          amount?: number;
          receipt_image_url?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          approved_by?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      t_bonus: {
        Row: {
          id: string;
          user_id: string;
          year: number;
          period_number: number;
          target_gross_profit: number;
          actual_gross_profit: number;
          achievement_rate: number | null; // Generated Column (readonly)
          bonus_base: number;
          cut_rate: number;
          final_bonus: number;
          contribution_details: Json | null;
          is_finalized: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          year: number;
          period_number: number;
          target_gross_profit: number;
          actual_gross_profit: number;
          bonus_base: number;
          cut_rate?: number;
          final_bonus: number;
          contribution_details?: Json | null;
          is_finalized?: boolean;
          deleted_at?: string | null;
        };
        Update: {
          target_gross_profit?: number;
          actual_gross_profit?: number;
          bonus_base?: number;
          cut_rate?: number;
          final_bonus?: number;
          contribution_details?: Json | null;
          is_finalized?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// 便利な型エイリアス（auto-generated 型ファイルに準拠）
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// suppress unused warning
void (null as unknown as Json);
