import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Project } from '@/types';

type ProjectFilters = {
  status?: string[];
  assigned_to?: string;
  keyword?: string;
  start_date?: string;
  end_date?: string;
};

/**
 * 案件一覧を取得する（RLSで自動的にアクセス可能なデータのみ返る）
 */
export function useProjects(filters?: ProjectFilters) {
  return useQuery({
    queryKey: ['projects', filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('t_projects')
        .select(`
          id, project_number, customer_name, customer_name_kana,
          address, phone, work_description, work_type,
          status, estimated_amount, contract_amount,
          acquisition_route, assigned_to,
          inquiry_date, contract_date, completion_date,
          gross_profit_rate, lat, lng,
          drive_folder_url, created_at, updated_at
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }
      if (filters?.keyword) {
        query = query.or(
          `customer_name.ilike.%${filters.keyword}%,address.ilike.%${filters.keyword}%,project_number.ilike.%${filters.keyword}%`
        );
      }
      if (filters?.start_date) {
        query = query.gte('inquiry_date', filters.start_date);
      }
      if (filters?.end_date) {
        query = query.lte('inquiry_date', filters.end_date);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Project[];
    },
  });
}

/**
 * 案件詳細を取得する（関連データも含む）
 */
export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_projects')
        .select(`
          *,
          t_photos(id, type, file_id, drive_url, thumbnail_url, file_name, uploaded_at, progress_status),
          t_receipts(id, store_name, amount, status, purchase_date, item_category:items),
          t_meetings(id, meeting_date, meeting_type, summary),
          t_reports(id, report_date, content, progress_status:content, weather:audio_url)
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

/**
 * 案件を新規登録する
 */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (project: Omit<Project, 'id' | 'project_number' | 'created_at' | 'updated_at'>) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_projects')
        .insert(project)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/**
 * 案件を更新する
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', data.id] });
    },
  });
}

/**
 * 案件を論理削除する
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('t_projects')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
