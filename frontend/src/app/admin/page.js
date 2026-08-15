'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/StatCard';
import { Loading, ErrorState, Empty } from '@/components/ui/States';
import { api } from '@/lib/api';
import { money, date } from '@/lib/format';

export default function AdminOverviewPage() {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: () => api('/admin/stats') });

  if (stats.isLoading) return <Loading />;
  if (stats.error) return <ErrorState error={stats.error} onRetry={stats.refetch} />;

  const data = stats.data;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Platform overview</h1>
        <p className="text-sm text-slate-500">Activity across every organization</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Organizations" value={data.organizations} />
        <StatCard label="Users" value={data.users} />
        <StatCard label="Active subscriptions" value={data.activeSubscriptions} />
        <StatCard label="Total revenue" value={money(data.totalRevenue)} />
        <StatCard
          label="Failed payments"
          value={data.failedPayments}
          tone={data.failedPayments > 0 ? 'danger' : 'default'}
        />
      </div>

      <Card title="Recent signups">
        {data.recentSignups.length === 0 ? (
          <Empty title="No organizations yet" description="New signups will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recentSignups.map((org) => (
              <li key={org._id} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  href={`/admin/organizations/${org._id}`}
                  className="text-sm font-medium text-slate-900 hover:text-brand-700"
                >
                  {org.name}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{date(org.createdAt)}</span>
                  <Badge status={org.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
