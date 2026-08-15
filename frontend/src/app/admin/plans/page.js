'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Alert from '@/components/ui/Alert';
import { Field, Input, Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { money, interval } from '@/lib/format';

const BLANK = {
  name: '',
  description: '',
  priceDollars: '',
  interval: 'month',
  memberLimit: 10,
  features: '',
};

export default function PlansPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: () => api('/admin/plans') });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    queryClient.invalidateQueries({ queryKey: ['plans'] });
  };

  const save = useMutation({
    mutationFn: (body) =>
      editing
        ? api(`/admin/plans/${editing}`, { method: 'PATCH', body })
        : api('/admin/plans', { method: 'POST', body }),
    onSuccess: () => {
      refresh();
      reset();
    },
    onError: (error) => setFieldErrors(error.fieldErrors || {}),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }) =>
      api(`/admin/plans/${id}/active`, { method: 'PATCH', body: { active } }),
    onSuccess: refresh,
  });

  function reset() {
    setForm(BLANK);
    setEditing(null);
    setFieldErrors({});
  }

  function startEdit(plan) {
    setEditing(plan._id);
    setFieldErrors({});
    setForm({
      name: plan.name,
      description: plan.description || '',
      // Prices are stored in cents; the form works in whole currency units.
      priceDollars: (plan.price / 100).toString(),
      interval: plan.interval,
      memberLimit: plan.memberLimit,
      features: (plan.features || []).join(', '),
    });
  }

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    setFieldErrors({});
    save.mutate({
      name: form.name,
      description: form.description,
      price: Math.round(Number(form.priceDollars) * 100),
      interval: form.interval,
      memberLimit: Number(form.memberLimit),
      features: form.features
        .split(',')
        .map((feature) => feature.trim())
        .filter(Boolean),
    });
  }

  const columns = [
    { key: 'name', header: 'Plan', render: (plan) => <span className="font-medium">{plan.name}</span> },
    {
      key: 'price',
      header: 'Price',
      render: (plan) => `${money(plan.price, plan.currency)} ${interval(plan.interval)}`,
    },
    { key: 'memberLimit', header: 'Member limit', align: 'right' },
    {
      key: 'features',
      header: 'Features',
      render: (plan) => <span className="text-slate-500">{plan.features?.join(', ') || '-'}</span>,
    },
    {
      key: 'active',
      header: 'Status',
      render: (plan) => <Badge status={plan.active ? 'ACTIVE' : 'DISABLED'} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (plan) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => startEdit(plan)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleActive.mutate({ id: plan._id, active: !plan.active })}
          >
            {plan.active ? 'Disable' : 'Enable'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Plans</h1>
        <p className="text-sm text-slate-500">
          Disabling a plan hides it from new signups. Existing subscriptions keep the price they
          were sold at.
        </p>
      </div>

      <Card title={editing ? 'Edit plan' : 'Create a plan'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {save.error && !Object.keys(fieldErrors).length && (
            <Alert tone="error">{save.error.message}</Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Name" error={fieldErrors.name}>
              <Input value={form.name} onChange={update('name')} error={fieldErrors.name} required />
            </Field>

            <Field label="Price (USD)" error={fieldErrors.price}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.priceDollars}
                onChange={update('priceDollars')}
                error={fieldErrors.price}
                required
              />
            </Field>

            <Field label="Billing interval">
              <Select value={form.interval} onChange={update('interval')}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </Select>
            </Field>

            <Field label="Member limit" error={fieldErrors.memberLimit}>
              <Input
                type="number"
                min="1"
                value={form.memberLimit}
                onChange={update('memberLimit')}
                error={fieldErrors.memberLimit}
              />
            </Field>
          </div>

          <Field label="Description" error={fieldErrors.description}>
            <Input value={form.description} onChange={update('description')} />
          </Field>

          <Field label="Features" hint="Separate each feature with a comma">
            <Input
              value={form.features}
              onChange={update('features')}
              placeholder="Up to 25 members, Priority support"
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Create plan'}
            </Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title="All plans">
        <Table
          columns={columns}
          rows={plans.data?.items}
          isLoading={plans.isLoading}
          error={plans.error}
          onRetry={plans.refetch}
          empty={{ title: 'No plans yet', description: 'Create your first plan above.' }}
        />
      </Card>
    </>
  );
}
