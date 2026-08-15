'use client';

import { Suspense } from 'react';
import AuthShell from '@/components/AuthShell';
import SetPasswordForm from '@/components/SetPasswordForm';

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AuthShell
        title="Accept your invitation"
        subtitle="Set a password to activate your account"
      >
        <SetPasswordForm
          endpoint="/auth/accept-invite"
          submitLabel="Activate account"
          signInAfter
        />
      </AuthShell>
    </Suspense>
  );
}
