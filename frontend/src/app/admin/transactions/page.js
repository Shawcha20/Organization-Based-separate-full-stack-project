'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Table, { Pagination } from '@/components/ui/Table';
import { Field, Input, Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { money, dateTime, humanise } from '@/lib/format';

const STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'ROLLED_BACK'];

export default function PlatformTransactionsPage() {
  const [filters, setFilters] = useState({ organization: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  const organizations = useQuery({
    queryKey: ['admin-organizations', 'all'],
    queryFn: () => api('/admin/organizations?limit=100'),
  });

  const query = useQuery({
    queryKey: ['admin-transactions', filters, page],
    queryFn: () =>
      api(
        `/admin/transactions?${new URLSearchParams({
          ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
          page,
        })}`
      ),
    placeholderData: keepPreviousData,
  });

  const update = (key) => (event) => {
    setFilters({ ...filters, [key]: event.target.value });
    setPage(1);
  };

  const columns = [
    {
      key: 'organization',
      header: 'Organization',
      render: (row) =>
        row.organization ? (
          <Link
            href={`/admin/organizations/${row.organization._id}`}
            className="font-medium text-slate-900 hover:text-brand-700"
          >
            {row.organization.name}
          </Link>
        ) : (
          '-'
        ),
    },
    { key: 'type', header: 'Type', render: (row) => humanise(row.type) },
    { key: 'description', header: 'Description' },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => money(row.amount, row.currency) },
    { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'createdAt', header: 'Date', render: (row) => dateTime(row.createdAt) },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500">Every money movement across all organizations</p>
      </div>

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Organization">
            <Select value={filters.organization} onChange={update('organization')}>
              <option value="">All organizations</option>
              {organizations.data?.items?.map((org) => (
                <option key={org._id} value={org._id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status">
            <Select value={filters.status} onChange={update('status')}>
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="From">
            <Input type="date" value={filters.from} onChange={update('from')} />
          </Field>

          <Field label="To">
            <Input type="date" value={filters.to} onChange={update('to')} />
          </Field>
        </div>

        <Table
          columns={columns}
          rows={query.data?.items}
          isLoading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          empty={{
            title: 'No transactions found',
            description: 'Try widening the filters or date range.',
          }}
          footer={
            <Pagination
              page={query.data?.page}
              pages={query.data?.pages}
              total={query.data?.total}
              onChange={setPage}
            />
          }
        />
      </Card>
    </>
  );
}
