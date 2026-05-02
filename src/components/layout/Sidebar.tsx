'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { NAV_ITEM_DEFS, parseNavVisibility, isSidebarItemVisible } from '@/lib/rolesAndNav';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const { data: visibilityMap = {} } = useQuery({
    queryKey: ['nav_visibility'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('m_settings')
        .select('value')
        .eq('key', 'nav_visibility_by_role')
        .maybeSingle();
      return parseNavVisibility(data?.value ?? null);
    },
    staleTime: 60_000,
  });

  return (
    <aside className="sidebar-nav">
      <nav className="sidebar-nav-list">
        {NAV_ITEM_DEFS.map((item) => {
          if (!isSidebarItemVisible(item, user?.role, user?.roleLevel, visibilityMap)) return null;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="material-icons">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pb-4 mt-auto">
        <div className="text-[10px] text-gray-300 text-center">Powered by Supabase</div>
      </div>
    </aside>
  );
}
