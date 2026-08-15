'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { api } from '@/lib/api';

function RetryCheckout() {
  const registrationId = useSearchParams().get('registration');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function retry() {
    setError('');
    setSubmitting(true);
    try {
      const { checkoutUrl } = await api(`/checkout/register/${registrationId}/retry`, {
        method: 'POST',
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Alert tone="warning">
        Your payment was not completed, so your organization has not been activated. Nothing was
        charged.
      </Alert>

      <p className="text-sm text-slate-600">
        Your signup details are saved. You can pick up where you left off.
      </p>

      {registrationId ? (
        <Button onClick={retry} loading={submitting} className="w-full">
          Retry payment
        </Button>
      ) : (
        <Link href="/signup">
          <Button className="w-full">Start again</Button>
        </Link>
      )}

      <Link href="/login" className="block text-center text-sm text-brand-600 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}

export default function CheckoutCancelledPage() {
  return (
    <Suspense>
      <AuthShell title="Payment not completed" subtitle="Your organization is still pending">
        <RetryCheckout />
      </AuthShell>
    </Suspense>
  );
}
