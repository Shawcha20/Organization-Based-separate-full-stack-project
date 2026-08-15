'use client';

import { Suspense } from 'react';
import AuthShell from '@/components/AuthShell';
import SetPasswordForm from '@/components/SetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthShell title="Choose a new password" subtitle="Your reset link is valid for one hour">
        <SetPasswordForm endpoint="/auth/reset-password" submitLabel="Update password" />
      </AuthShell>
    </Suspense>
  );
}
