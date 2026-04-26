/**
 * Supabase Database 型定義
 *
 * 本番では以下のコマンドで自動生成した型に置き換えること:
 *   npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
 *
 * @supabase/supabase-js v2.46+ では GenericTable に Relationships が必須、
 * GenericSchema に CompositeTypes が必須のため、それらを含めて定義する。
 */

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    PostgrestVersion: "12";
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
          id?: string;
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
        Relationships: [];
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
        Relationships: [];
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
          id?: string;
          customer_name: string;
          customer_name_kana?: string | null;
          postal_code?: string | null;
          address: string;
          phone: string;
          email?: string | null;
          work_description?: string;
          work_type: string[];
          status?: 'inquiry' | 'estimate' | 'followup_status' | 'contract' | 'in_progress' | 'completed' | 'lost';
          estimated_amount?: number;
          contract_amount?: number | null;
          acquisition_route?: string;
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
        Relationships: [];
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
          id?: string;
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
        Relationships: [];
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
          id?: string;
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
        Relationships: [];
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
          id?: string;
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
        Relationships: [];
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
          id?: string;
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
        Relationships: [];
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
          id?: string;
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
        Relationships: [];
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
          id?: string;
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
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// suppress unused warning
void (null as unknown as Json);
