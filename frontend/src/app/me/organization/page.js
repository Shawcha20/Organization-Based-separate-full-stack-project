'use client';

import { useQuery } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Loading, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

/**
 * Read-only view for regular members. The API deliberately returns only the
 * organization name and plan name here - no prices, billing email or payment
 * history - so there is nothing financial to hide in the UI.
 */
export default function MemberOrgPage() {
  const query = useQuery({ queryKey: ['org-info'], queryFn: () => api('/org/info') });

  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const org = query.data;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Organization</h1>
        <p className="text-sm text-slate-500">The organization you belong to</p>
      </div>

      <Card title={org.name}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{org.planName || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="mt-1">
              <Badge status={org.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Members</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{org.memberCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{date(org.createdAt)}</dd>
          </div>
        </dl>

        <p className="mt-5 text-sm text-slate-500">
          Billing and subscription details are only available to organization admins.
        </p>
      </Card>
    </>
  );
}
