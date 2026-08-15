'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { api, tokenStore } from '@/lib/api';
import { HOME_FOR_ROLE } from '@/lib/auth';

/**
 * Shared by the password reset and invitation flows - both take a token from
 * the emailed link and exchange it for a new password.
 */
export default function SetPasswordForm({ endpoint, submitLabel, signInAfter = false }) {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return <Alert tone="error">This link is missing its token. Please use the link from your email.</Alert>;
  }

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    if (form.password !== form.confirm) {
      setFieldErrors({ confirm: 'The two passwords do not match' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await api(endpoint, { method: 'POST', body: { token, password: form.password } });

      if (signInAfter && data?.token) {
        // Accepting an invitation signs the new member straight in.
        tokenStore.set(data.token);
        window.location.href = HOME_FOR_ROLE[data.user.role] || '/';
        return;
      }
      router.push('/login');
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Field
        label="New password"
        error={fieldErrors.password}
        hint="At least 8 characters, including a letter and a number"
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

      <Field label="Confirm password" error={fieldErrors.confirm}>
        <Input
          type="password"
          value={form.confirm}
          onChange={update('confirm')}
          error={fieldErrors.confirm}
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" loading={submitting} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
