'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { useAuth, HOME_FOR_ROLE } from '@/lib/auth';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const expired = params.get('expired');

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      const user = await login(form.email, form.password);
      router.push(HOME_FOR_ROLE[user.role] || '/');
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your organization's workspace"
      footer={
        <>
          Need an account?{' '}
          <Link href="/signup" className="font-medium text-brand-600 hover:underline">
            Register your organization
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {expired && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Email" error={fieldErrors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={update('email')}
            error={fieldErrors.email}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Password" error={fieldErrors.password}>
          <Input
            type="password"
            value={form.password}
            onChange={update('password')}
            error={fieldErrors.password}
            autoComplete="current-password"
            required
          />
        </Field>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-brand-600 hover:underline">
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
