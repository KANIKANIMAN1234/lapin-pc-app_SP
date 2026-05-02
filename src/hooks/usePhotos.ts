import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Photo } from '@/types';

/**
 * 案件の写真一覧を取得する
 * - Google Drive URL は Supabase t_photos テーブルに保存されたものを使用
 */
export function usePhotos(projectId: string) {
  return useQuery({
    queryKey: ['photos', projectId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_photos')
        .select('id, type, file_id, drive_url, thumbnail_url, file_name, uploaded_at, progress_status')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return data as Photo[];
    },
    enabled: !!projectId,
  });
}

/**
 * 写真をアップロードする
 * Edge Function を経由して Google Drive に保存 → t_photos テーブルに URL を記録
 */
export function useUploadPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      type,
      imageBase64,
      progressStatus,
    }: {
      projectId: string;
      type: string;
      imageBase64: string;
      progressStatus?: Photo['progress_status'];
    }) => {
      const supabase = createClient();

      // Edge Function `photos` を呼び出し
      // → Drive アップロード + 共有権限設定 + t_photos INSERT を一括処理
      const { data, error } = await supabase.functions.invoke('photos', {
        body: {
          project_id: projectId,
          type,
          image_base64: imageBase64,
          progress_status: progressStatus,
        },
      });

      if (error) throw error;
      return data as Photo;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['photos', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] });
    },
  });
}

/**
 * 写真を論理削除する
 */
export function useDeletePhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ photoId, projectId }: { photoId: string; projectId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('t_photos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', photoId);
      if (error) throw error;
      return { projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['photos', projectId] });
    },
  });
}
