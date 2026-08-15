'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import AuthShell from '@/components/AuthShell';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { Loading, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';

function CheckoutStatus() {
  const sessionId = useSearchParams().get('session_id');

  /**
   * Being redirected here does not mean anything was paid - the redirect can
   * be typed by hand. This polls our own database, which only flips to
   * COMPLETED once the signed Stripe webhook has been processed.
   */
  const status = useQuery({
    queryKey: ['checkout-status', sessionId],
    queryFn: () => api(`/checkout/status?session_id=${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 2000 : false),
  });

  if (!sessionId) {
    return <Alert tone="error">This page needs a checkout session to look up.</Alert>;
  }
  if (status.isLoading) return <Loading label="Checking your payment..." />;
  if (status.error) return <ErrorState error={status.error} onRetry={status.refetch} />;

  if (status.data.status === 'COMPLETED') {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          Payment confirmed. <strong>{status.data.organizationName}</strong> is active.
        </Alert>
        <p className="text-sm text-slate-600">
          Sign in with <strong>{status.data.email}</strong> and the password you chose during
          signup.
        </p>
        <Link href="/login">
          <Button className="w-full">Go to sign in</Button>
        </Link>
      </div>
    );
  }

  if (status.data.status === 'FAILED') {
    return (
      <div className="space-y-4">
        <Alert tone="error">
          We could not confirm your payment, so your organization was not activated.
        </Alert>
        <Link href={`/checkout/cancelled?registration=${status.data.registrationId}`}>
          <Button className="w-full">Try payment again</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Loading label="Waiting for Stripe to confirm the payment..." />
      <p className="text-center text-sm text-slate-500">
        This usually takes a few seconds. Your organization is created only once the payment is
        confirmed on our side.
      </p>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <AuthShell title="Almost there" subtitle="Confirming your payment with Stripe">
        <CheckoutStatus />
      </AuthShell>
    </Suspense>
  );
}
