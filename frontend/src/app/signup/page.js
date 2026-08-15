'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import AuthShell from '@/components/AuthShell';
import PlanCard from '@/components/PlanCard';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { Loading, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';

/**
 * Step one of paid onboarding. Submitting this creates nothing but a pending
 * registration - the organization itself is created only after Stripe confirms
 * the payment through the webhook.
 */
export default function SignupPage() {
  const [form, setForm] = useState({
    organizationName: '',
    adminName: '',
    email: '',
    password: '',
  });
  const [planId, setPlanId] = useState(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api('/plans') });

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    if (!planId) {
      setError('Please choose a plan to continue');
      return;
    }

    setSubmitting(true);
    try {
      const { checkoutUrl } = await api('/checkout/register', {
        method: 'POST',
        body: { ...form, planId },
      });
      // Hand off to Stripe's hosted checkout - card details never touch this app.
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fieldErrors || {});
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      wide
      title="Register your organization"
      subtitle="Choose a plan and pay to activate your workspace"
      footer={
        <>
          Already registered?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" error={fieldErrors.organizationName}>
            <Input
              value={form.organizationName}
              onChange={update('organizationName')}
              error={fieldErrors.organizationName}
              placeholder="Acme Inc."
              required
            />
          </Field>

          <Field label="Your name" error={fieldErrors.adminName}>
            <Input
              value={form.adminName}
              onChange={update('adminName')}
              error={fieldErrors.adminName}
              placeholder="Jane Doe"
              required
            />
          </Field>

          <Field label="Work email" error={fieldErrors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={update('email')}
              error={fieldErrors.email}
              placeholder="jane@acme.com"
              autoComplete="email"
              required
            />
          </Field>

          <Field
            label="Password"
            error={fieldErrors.password}
            hint="At least 8 characters, with a letter and a number"
          >
            <Input
              type="password"
              value={form.password}
              onChange={update('password')}
              error={fieldErrors.password}
              autoComplete="new-password"
              required
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Choose a plan</p>

          {plans.isLoading && <Loading label="Loading plans..." />}
          {plans.error && <ErrorState error={plans.error} onRetry={plans.refetch} />}

          <div className="grid gap-3 sm:grid-cols-3">
            {plans.data?.items?.map((plan) => (
              <PlanCard
                key={plan._id}
                plan={plan}
                selected={planId === plan._id}
                onSelect={() => setPlanId(plan._id)}
              />
            ))}
          </div>
        </div>

        <div>
          <Button type="submit" loading={submitting} className="w-full">
            Continue to payment
          </Button>
          <p className="mt-2 text-center text-xs text-slate-500">
            You will be redirected to Stripe to complete payment securely. Your workspace is
            activated once the payment is confirmed.
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
