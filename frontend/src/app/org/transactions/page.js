'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Table, { Pagination } from '@/components/ui/Table';
import { Field, Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { money, dateTime, humanise } from '@/lib/format';

const STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'ROLLED_BACK'];

export default function OrgTransactionsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['org-transactions', status, page],
    queryFn: () =>
      api(`/org/transactions?${new URLSearchParams({ ...(status ? { status } : {}), page })}`),
    placeholderData: keepPreviousData,
  });

  const columns = [
    { key: 'type', header: 'Type', render: (row) => humanise(row.type) },
    { key: 'description', header: 'Description' },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => money(row.amount, row.currency) },
    { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'failureReason',
      header: 'Detail',
      render: (row) => <span className="text-slate-500">{row.failureReason || '-'}</span>,
    },
    { key: 'createdAt', header: 'Date', render: (row) => dateTime(row.createdAt) },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500">Every billing event for your organization</p>
      </div>

      <Card>
        <div className="mb-4 sm:w-56">
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Table
          columns={columns}
          rows={query.data?.items}
          isLoading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          empty={{ title: 'No transactions found' }}
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
