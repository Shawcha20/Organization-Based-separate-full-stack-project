'use client';

import { useState } from 'react';
import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Table, { Pagination } from '@/components/ui/Table';
import { api, downloadFile } from '@/lib/api';
import { money, dateTime } from '@/lib/format';

export default function BillingPage() {
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState('');

  const payments = useQuery({
    queryKey: ['org-payments', page],
    queryFn: () => api(`/org/payments?page=${page}`),
    placeholderData: keepPreviousData,
  });

  // Card details are managed entirely inside Stripe's hosted portal, so no
  // payment credentials ever reach this application.
  const portal = useMutation({
    mutationFn: () => api('/org/billing-portal', { method: 'POST' }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });

  async function download(payment) {
    setDownloadError('');
    try {
      await downloadFile(`/org/payments/${payment._id}/invoice`, `${payment.invoiceNumber}.pdf`);
    } catch (error) {
      setDownloadError(error.message);
    }
  }

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice', render: (p) => p.invoiceNumber || '-' },
    { key: 'planName', header: 'Plan', render: (p) => p.planName || p.description },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => money(p.amount, p.currency) },
    { key: 'status', header: 'Status', render: (p) => <Badge status={p.status} /> },
    { key: 'createdAt', header: 'Date', render: (p) => dateTime(p.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        p.invoiceNumber ? (
          <Button size="sm" variant="secondary" onClick={() => download(p)}>
            Invoice PDF
          </Button>
        ) : (
          <span className="text-xs text-slate-400">No invoice</span>
        ),
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Billing & payments</h1>
        <p className="text-sm text-slate-500">Payment method and invoice history for your organization</p>
      </div>

      <Card
        title="Payment method"
        description="Cards are stored and managed by Stripe, never on our servers"
        actions={
          <Button size="sm" loading={portal.isPending} onClick={() => portal.mutate()}>
            Manage payment method
          </Button>
        }
      >
        {portal.error ? (
          <Alert tone="error">{portal.error.message}</Alert>
        ) : (
          <p className="text-sm text-slate-600">
            Opens Stripe's secure billing portal, where you can update your card or review your
            invoices directly.
          </p>
        )}
      </Card>

      <Card title="Payment history">
        {downloadError && <Alert tone="error">{downloadError}</Alert>}

        <div className={downloadError ? 'mt-4' : ''}>
          <Table
            columns={columns}
            rows={payments.data?.items}
            isLoading={payments.isLoading}
            error={payments.error}
            onRetry={payments.refetch}
            empty={{
              title: 'No payments yet',
              description: 'Payments appear here once Stripe confirms them.',
            }}
            footer={
              <Pagination
                page={payments.data?.page}
                pages={payments.data?.pages}
                total={payments.data?.total}
                onChange={setPage}
              />
            }
          />
        </div>
      </Card>
    </>
  );
}
