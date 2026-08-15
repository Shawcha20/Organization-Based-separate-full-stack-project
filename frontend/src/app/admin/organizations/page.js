'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Table, { Pagination } from '@/components/ui/Table';
import { Input, Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

const STATUSES = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'];

export default function OrganizationsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin-organizations', search, status, page],
    queryFn: () =>
      api(
        `/admin/organizations?${new URLSearchParams({
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          page,
        })}`
      ),
    // Keeps the previous page on screen while the next one loads, so the table
    // does not flash empty on every keystroke.
    placeholderData: keepPreviousData,
  });

  const columns = [
    {
      key: 'name',
      header: 'Organization',
      render: (org) => (
        <Link
          href={`/admin/organizations/${org._id}`}
          className="font-medium text-slate-900 hover:text-brand-700"
        >
          {org.name}
        </Link>
      ),
    },
    { key: 'plan', header: 'Plan', render: (org) => org.plan?.name || '-' },
    { key: 'status', header: 'Status', render: (org) => <Badge status={org.status} /> },
    { key: 'memberCount', header: 'Members', align: 'right' },
    { key: 'createdAt', header: 'Signed up', render: (org) => date(org.createdAt) },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Organizations</h1>
        <p className="text-sm text-slate-500">Every tenant on the platform</p>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search by name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="sm:w-52"
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        <Table
          columns={columns}
          rows={query.data?.items}
          isLoading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          empty={{
            title: 'No organizations found',
            description: search || status ? 'Try a different search or filter.' : undefined,
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
