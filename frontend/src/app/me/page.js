'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanise, dateTime } from '@/lib/format';

export default function MyProfilePage() {
  const { user, setUser } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const saveProfile = useMutation({
    mutationFn: (body) => api('/me', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      setUser(updated);
      setProfileSaved(true);
    },
  });

  const changePassword = useMutation({
    mutationFn: (body) => api('/auth/change-password', { method: 'POST', body }),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      setPasswordSaved(true);
      setPasswordError('');
      setFieldErrors({});
    },
    onError: (error) => {
      setPasswordSaved(false);
      setPasswordError(error.message);
      setFieldErrors(error.fieldErrors || {});
    },
  });

  function submitPassword(event) {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      setFieldErrors({ confirm: 'The two passwords do not match' });
      return;
    }
    changePassword.mutate({
      currentPassword: passwords.currentPassword,
      newPassword: passwords.newPassword,
    });
  }

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My profile</h1>
        <p className="text-sm text-slate-500">
          {humanise(user?.role)} · last signed in {dateTime(user?.lastLoginAt)}
        </p>
      </div>

      <Card title="Account details">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile.mutate({ name });
          }}
          className="space-y-4"
        >
          {profileSaved && <Alert tone="success">Your profile has been updated.</Alert>}
          {saveProfile.error && <Alert tone="error">{saveProfile.error.message}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setProfileSaved(false);
                }}
                required
              />
            </Field>

            <Field label="Email" hint="Contact your organization admin to change this">
              <Input value={user?.email || ''} disabled />
            </Field>
          </div>

          <Button type="submit" loading={saveProfile.isPending}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card title="Change password">
        <form onSubmit={submitPassword} className="space-y-4">
          {passwordSaved && <Alert tone="success">Your password has been changed.</Alert>}
          {passwordError && !Object.keys(fieldErrors).length && (
            <Alert tone="error">{passwordError}</Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Current password" error={fieldErrors.currentPassword}>
              <Input
                type="password"
                value={passwords.currentPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, currentPassword: event.target.value })
                }
                error={fieldErrors.currentPassword}
                autoComplete="current-password"
                required
              />
            </Field>

            <Field
              label="New password"
              error={fieldErrors.newPassword}
              hint="At least 8 characters, with a letter and a number"
            >
              <Input
                type="password"
                value={passwords.newPassword}
                onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                error={fieldErrors.newPassword}
                autoComplete="new-password"
                required
              />
            </Field>

            <Field label="Confirm new password" error={fieldErrors.confirm}>
              <Input
                type="password"
                value={passwords.confirm}
                onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                error={fieldErrors.confirm}
                autoComplete="new-password"
                required
              />
            </Field>
          </div>

          <Button type="submit" loading={changePassword.isPending}>
            Change password
          </Button>
        </form>
      </Card>
    </>
  );
}
