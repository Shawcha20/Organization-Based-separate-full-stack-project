'use client';

import { use } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Alert from '@/components/ui/Alert';
import { Loading, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { money, date, dateTime, humanise } from '@/lib/format';

export default function OrganizationDetailPage({ params }) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-organization', id],
    queryFn: () => api(`/admin/organizations/${id}`),
  });

  const setStatus = useMutation({
    mutationFn: (status) =>
      api(`/admin/organizations/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-organization', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    },
  });

  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const { organization, members, subscriptions, payments, transactions } = query.data;
  const suspended = organization.status === 'SUSPENDED';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/organizations" className="text-sm text-brand-600 hover:underline">
            ← All organizations
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold text-slate-900">
            {organization.name}
            <Badge status={organization.status} />
          </h1>
        </div>

        <Button
          variant={suspended ? 'primary' : 'danger'}
          loading={setStatus.isPending}
          onClick={() => setStatus.mutate(suspended ? 'ACTIVE' : 'SUSPENDED')}
        >
          {suspended ? 'Reactivate organization' : 'Suspend organization'}
        </Button>
      </div>

      {setStatus.error && <Alert tone="error">{setStatus.error.message}</Alert>}
      {suspended && (
        <Alert tone="warning">
          Members of this organization cannot sign in while it is suspended.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <dl className="space-y-2 text-sm">
            <Row label="Billing email" value={organization.billingEmail} />
            <Row label="Contact email" value={organization.contactEmail || '-'} />
            <Row label="Contact phone" value={organization.contactPhone || '-'} />
            <Row label="Current plan" value={organization.plan?.name || '-'} />
            <Row label="Signed up" value={date(organization.createdAt)} />
          </dl>
        </Card>

        <Card title="Subscription history">
          <Table
            columns={[
              { key: 'planName', header: 'Plan' },
              { key: 'amount', header: 'Amount', render: (s) => money(s.amount, s.currency) },
              { key: 'status', header: 'Status', render: (s) => <Badge status={s.status} /> },
              { key: 'currentPeriodEnd', header: 'Renews', render: (s) => date(s.currentPeriodEnd) },
            ]}
            rows={subscriptions}
            empty={{ title: 'No subscriptions' }}
          />
        </Card>
      </div>

      <Card title={`Members (${members.length})`}>
        <Table
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'role', header: 'Role', render: (m) => humanise(m.role) },
            { key: 'status', header: 'Status', render: (m) => <Badge status={m.status} /> },
            { key: 'lastLoginAt', header: 'Last login', render: (m) => dateTime(m.lastLoginAt) },
          ]}
          rows={members}
          empty={{ title: 'No members' }}
        />
      </Card>

      <Card title="Payment history">
        <Table
          columns={[
            { key: 'invoiceNumber', header: 'Invoice', render: (p) => p.invoiceNumber || '-' },
            { key: 'planName', header: 'Plan' },
            { key: 'amount', header: 'Amount', render: (p) => money(p.amount, p.currency) },
            { key: 'status', header: 'Status', render: (p) => <Badge status={p.status} /> },
            { key: 'createdAt', header: 'Date', render: (p) => dateTime(p.createdAt) },
          ]}
          rows={payments}
          empty={{ title: 'No payments recorded' }}
        />
      </Card>

      <Card title="Transactions">
        <Table
          columns={[
            { key: 'type', header: 'Type', render: (t) => humanise(t.type) },
            { key: 'description', header: 'Description' },
            { key: 'amount', header: 'Amount', render: (t) => money(t.amount, t.currency) },
            { key: 'status', header: 'Status', render: (t) => <Badge status={t.status} /> },
            { key: 'createdAt', header: 'Date', render: (t) => dateTime(t.createdAt) },
          ]}
          rows={transactions}
          empty={{ title: 'No transactions recorded' }}
        />
      </Card>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
