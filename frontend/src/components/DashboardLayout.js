'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, HOME_FOR_ROLE } from '@/lib/auth';
import { Loading } from '@/components/ui/States';
import { humanise } from '@/lib/format';

/**
 * Frame for all three panels, and the client-side half of route protection.
 * The server enforces the same rules on every request - this only saves the
 * user from seeing a screen they would be refused anyway.
 */
export default function DashboardLayout({ allow, nav, children }) {
  const { user, organization, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!allow.includes(user.role)) {
      router.replace(HOME_FOR_ROLE[user.role] || '/');
    }
  }, [user, loading, allow, router]);

  if (loading || !user || !allow.includes(user.role)) return <Loading />;

  const isActive = (href) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-base font-semibold text-slate-900">
            Octopi<span className="text-brand-600"> Digital</span>
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded border border-slate-300 px-2 py-1 text-sm lg:hidden"
            aria-label="Toggle navigation"
          >
            Menu
          </button>
        </div>

        <nav className={`${menuOpen ? 'block' : 'hidden'} px-3 pb-4 lg:block`}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`mb-0.5 block rounded-md px-3 py-2 text-sm transition ${
                isActive(item.href)
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {organization?.name || 'Platform administration'}
            </p>
            <p className="text-xs text-slate-500">
              {user.name} · {humanise(user.role)}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </header>

        <main className="flex-1 px-5 py-6">
          <div className="mx-auto max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
