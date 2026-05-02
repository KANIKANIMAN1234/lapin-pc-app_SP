import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** Route Handler 用: Authorization Bearer または Cookie セッションからユーザーID */
export async function getRouteHandlerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (authHeader?.startsWith('Bearer ') && url && anon) {
    const token = authHeader.slice(7).trim();
    const supabase = createClient(url, anon);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    return user?.id ?? null;
  }
  const server = await createServerSupabaseClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  return user?.id ?? null;
}
