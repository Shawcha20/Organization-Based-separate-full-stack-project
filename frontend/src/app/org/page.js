'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { Loading, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

export default function OrgProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const org = useQuery({ queryKey: ['org'], queryFn: () => api('/org') });

  useEffect(() => {
    if (org.data && !form) {
      setForm({
        name: org.data.name,
        billingEmail: org.data.billingEmail,
        contactEmail: org.data.contactEmail || '',
        contactPhone: org.data.contactPhone || '',
      });
    }
  }, [org.data, form]);

  const save = useMutation({
    mutationFn: (body) => api('/org', { method: 'PATCH', body }),
    onSuccess: () => {
      setSaved(true);
      setFieldErrors({});
      queryClient.invalidateQueries({ queryKey: ['org'] });
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (error) => {
      setSaved(false);
      setFieldErrors(error.fieldErrors || {});
    },
  });

  if (org.isLoading || !form) return <Loading />;
  if (org.error) return <ErrorState error={org.error} onRetry={org.refetch} />;

  const update = (key) => (event) => {
    setForm({ ...form, [key]: event.target.value });
    setSaved(false);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Organization</h1>
          <p className="text-sm text-slate-500">
            On {org.data.plan?.name || 'no plan'} since {date(org.data.createdAt)}
          </p>
        </div>
        <Badge status={org.data.status} />
      </div>

      <Card title="Profile" description="Contact and billing details for your organization">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(form);
          }}
          className="space-y-4"
        >
          {saved && <Alert tone="success">Your changes have been saved.</Alert>}
          {save.error && !Object.keys(fieldErrors).length && (
            <Alert tone="error">{save.error.message}</Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organization name" error={fieldErrors.name}>
              <Input value={form.name} onChange={update('name')} error={fieldErrors.name} required />
            </Field>

            <Field
              label="Billing email"
              error={fieldErrors.billingEmail}
              hint="Invoices and payment notices go here"
            >
              <Input
                type="email"
                value={form.billingEmail}
                onChange={update('billingEmail')}
                error={fieldErrors.billingEmail}
                required
              />
            </Field>

            <Field label="Contact email" error={fieldErrors.contactEmail}>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={update('contactEmail')}
                error={fieldErrors.contactEmail}
              />
            </Field>

            <Field label="Contact phone" error={fieldErrors.contactPhone}>
              <Input
                value={form.contactPhone}
                onChange={update('contactPhone')}
                error={fieldErrors.contactPhone}
              />
            </Field>
          </div>

          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </form>
      </Card>
    </>
  );
}
