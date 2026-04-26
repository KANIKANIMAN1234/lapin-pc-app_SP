/**
 * Supabase Database 型定義
 * 本来は `supabase gen types typescript` で自動生成するが、
 * ここでは主要テーブルの型を手動で定義する。
 * 実装時は CLI で自動生成した型に置き換えること。
 *
 * $ npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
 *
 * 注意: Insert/Update に Omit<Row> の自己参照を使うと TypeScript が never に
 * 解決することがあるため、各フィールドを明示的に定義している。
 */

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          line_user_id: string;
          name: string;
          email: string | null;
          role: 'admin' | 'staff' | 'sales';
          phone: string | null;
          avatar_url: string | null;
          status: 'active' | 'retired';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          line_user_id: string;
          name: string;
          email?: string | null;
          role: 'admin' | 'staff' | 'sales';
          phone?: string | null;
          avatar_url?: string | null;
          status?: 'active' | 'retired';
        };
        Update: {
          line_user_id?: string;
          name?: string;
          email?: string | null;
          role?: 'admin' | 'staff' | 'sales';
          phone?: string | null;
          avatar_url?: string | null;
          status?: 'active' | 'retired';
        };
      };
      settings: {
        Row: {
          id: string;
          company_name: string | null;
          trade_name: string | null;
          header_display: 'company' | 'trade';
          n8n_webhook_url: string | null;
          google_calendar_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          company_name?: string | null;
          trade_name?: string | null;
          header_display?: 'company' | 'trade';
          n8n_webhook_url?: string | null;
          google_calendar_id?: string | null;
        };
        Update: {
          company_name?: string | null;
          trade_name?: string | null;
          header_display?: 'company' | 'trade';
          n8n_webhook_url?: string | null;
          google_calendar_id?: string | null;
        };
      };
      projects: {
        Row: {
          id: string;
          project_number: string;
          customer_name: string;
          customer_name_kana: string | null;
          postal_code: string | null;
          address: string;
          phone: string;
          email: string | null;
          work_description: string;
          work_type: string[];
          status: 'inquiry' | 'estimate' | 'followup_status' | 'contract' | 'in_progress' | 'completed' | 'lost';
          estimated_amount: number;
          contract_amount: number | null;
          actual_cost: number | null;
          gross_profit: number | null;
          gross_profit_rate: number | null;
          acquisition_route: string;
          assigned_to: string;
          inquiry_date: string;
          contract_date: string | null;
          start_date: string | null;
          completion_date: string | null;
          estimate_date: string | null;
          thankyou_flag: boolean;
          followup_flag: boolean;
          inspection_flag: boolean;
          lat: number | null;
          lng: number | null;
          drive_folder_id: string | null;
          drive_folder_url: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          customer_name: string;
          customer_name_kana?: string | null;
          postal_code?: string | null;
          address: string;
          phone: string;
          email?: string | null;
          work_description: string;
          work_type: string[];
          status: 'inquiry' | 'estimate' | 'followup_status' | 'contract' | 'in_progress' | 'completed' | 'lost';
          estimated_amount: number;
          contract_amount?: number | null;
          acquisition_route: string;
          assigned_to: string;
          inquiry_date: string;
          contract_date?: string | null;
          start_date?: string | null;
          completion_date?: string | null;
          estimate_date?: string | null;
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
        Update: {
          customer_name?: string;
          customer_name_kana?: string | null;
          postal_code?: string | null;
          address?: string;
          phone?: string;
          email?: string | null;
          work_description?: string;
          work_type?: string[];
          status?: 'inquiry' | 'estimate' | 'followup_status' | 'contract' | 'in_progress' | 'completed' | 'lost';
          estimated_amount?: number;
          contract_amount?: number | null;
          acquisition_route?: string;
          assigned_to?: string;
          inquiry_date?: string;
          contract_date?: string | null;
          start_date?: string | null;
          completion_date?: string | null;
          estimate_date?: string | null;
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
      };
      photos: {
        Row: {
          id: string;
          project_id: string;
          type: 'before' | 'inspection' | 'undercoat' | 'completed';
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
          project_id: string;
          type: 'before' | 'inspection' | 'undercoat' | 'completed';
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
          type?: 'before' | 'inspection' | 'undercoat' | 'completed';
          file_id?: string;
          drive_url?: string;
          thumbnail_url?: string;
          file_name?: string | null;
          progress_status?: 'ahead' | 'on_schedule' | 'delayed' | null;
          deleted_at?: string | null;
        };
      };
      receipts: {
        Row: {
          id: string;
          project_id: string;
          store_name: string | null;
          amount: number;
          purchased_at: string | null;
          category: string | null;
          memo: string | null;
          photo_url: string | null;
          status: 'pending' | 'confirmed' | 'rejected';
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          store_name?: string | null;
          amount: number;
          purchased_at?: string | null;
          category?: string | null;
          memo?: string | null;
          photo_url?: string | null;
          status?: 'pending' | 'confirmed' | 'rejected';
          created_by: string;
        };
        Update: {
          store_name?: string | null;
          amount?: number;
          purchased_at?: string | null;
          category?: string | null;
          memo?: string | null;
          photo_url?: string | null;
          status?: 'pending' | 'confirmed' | 'rejected';
        };
      };
      expenses: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          amount: number;
          expense_date: string;
          category: string;
          memo: string | null;
          receipt_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          project_id?: string | null;
          amount: number;
          expense_date: string;
          category: string;
          memo?: string | null;
          receipt_url?: string | null;
        };
        Update: {
          user_id?: string;
          project_id?: string | null;
          amount?: number;
          expense_date?: string;
          category?: string;
          memo?: string | null;
          receipt_url?: string | null;
        };
      };
      meetings: {
        Row: {
          id: string;
          project_id: string;
          meeting_date: string;
          meeting_type: string;
          summary: string;
          audio_url: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          project_id: string;
          meeting_date: string;
          meeting_type: string;
          summary: string;
          audio_url?: string | null;
          created_by: string;
        };
        Update: {
          meeting_date?: string;
          meeting_type?: string;
          summary?: string;
          audio_url?: string | null;
        };
      };
      reports: {
        Row: {
          id: string;
          project_id: string;
          report_date: string;
          content: string;
          photos: string[] | null;
          weather: string | null;
          progress_status: 'ahead' | 'on_schedule' | 'delayed';
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          report_date: string;
          content: string;
          photos?: string[] | null;
          weather?: string | null;
          progress_status: 'ahead' | 'on_schedule' | 'delayed';
          created_by: string;
        };
        Update: {
          report_date?: string;
          content?: string;
          photos?: string[] | null;
          weather?: string | null;
          progress_status?: 'ahead' | 'on_schedule' | 'delayed';
        };
      };
      bonus_periods: {
        Row: {
          id: string;
          period_label: string;
          period_start: string;
          period_end: string;
          fixed_cost: number;
          distribution_rate: number;
          created_at: string;
        };
        Insert: {
          period_label: string;
          period_start: string;
          period_end: string;
          fixed_cost: number;
          distribution_rate: number;
        };
        Update: {
          period_label?: string;
          period_start?: string;
          period_end?: string;
          fixed_cost?: number;
          distribution_rate?: number;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
