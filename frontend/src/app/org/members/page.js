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
import { dateTime, humanise } from '@/lib/format';
import { useAuth } from '@/lib/auth';

export default function MembersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [invite, setInvite] = useState({ name: '', email: '', role: 'ORG_MEMBER' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');

  const members = useQuery({ queryKey: ['org-members'], queryFn: () => api('/org/members') });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['org-members'] });

  const sendInvite = useMutation({
    mutationFn: (body) => api('/org/members', { method: 'POST', body }),
    onSuccess: (member) => {
      setInvite({ name: '', email: '', role: 'ORG_MEMBER' });
      setFieldErrors({});
      setNotice(`Invitation sent to ${member.email}.`);
      refresh();
    },
    onError: (error) => {
      setNotice('');
      setFieldErrors(error.fieldErrors || {});
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }) => api(`/org/members/${id}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id) => api(`/org/members/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const actionError = changeRole.error || remove.error;

  const columns = [
    { key: 'name', header: 'Name', render: (m) => <span className="font-medium">{m.name}</span> },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (m) =>
        // You cannot change your own role, so it is shown as plain text.
        m._id === user.id ? (
          <span className="text-slate-500">{humanise(m.role)} (you)</span>
        ) : (
          <Select
            value={m.role}
            onChange={(event) => changeRole.mutate({ id: m._id, role: event.target.value })}
            className="w-40"
          >
            <option value="ORG_MEMBER">Organization member</option>
            <option value="ORG_ADMIN">Organization admin</option>
          </Select>
        ),
    },
    { key: 'status', header: 'Status', render: (m) => <Badge status={m.status} /> },
    { key: 'lastLoginAt', header: 'Last login', render: (m) => dateTime(m.lastLoginAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) =>
        m._id === user.id ? null : (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={() => {
              if (window.confirm(`Remove ${m.name} from this organization?`)) remove.mutate(m._id);
            }}
          >
            Remove
          </Button>
        ),
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Members</h1>
        <p className="text-sm text-slate-500">Invite people and manage what they can do</p>
      </div>

      <Card title="Invite a member" description="They will receive an email to set their password">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendInvite.mutate(invite);
          }}
          className="space-y-4"
        >
          {notice && <Alert tone="success">{notice}</Alert>}
          {sendInvite.error && !Object.keys(fieldErrors).length && (
            <Alert tone="error">{sendInvite.error.message}</Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" error={fieldErrors.name}>
              <Input
                value={invite.name}
                onChange={(event) => setInvite({ ...invite, name: event.target.value })}
                error={fieldErrors.name}
                required
              />
            </Field>

            <Field label="Email" error={fieldErrors.email}>
              <Input
                type="email"
                value={invite.email}
                onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                error={fieldErrors.email}
                required
              />
            </Field>

            <Field label="Role">
              <Select
                value={invite.role}
                onChange={(event) => setInvite({ ...invite, role: event.target.value })}
              >
                <option value="ORG_MEMBER">Organization member</option>
                <option value="ORG_ADMIN">Organization admin</option>
              </Select>
            </Field>
          </div>

          <Button type="submit" loading={sendInvite.isPending}>
            Send invitation
          </Button>
        </form>
      </Card>

      <Card title={`Members (${members.data?.items?.length || 0})`}>
        {actionError && <Alert tone="error">{actionError.message}</Alert>}

        <div className={actionError ? 'mt-4' : ''}>
          <Table
            columns={columns}
            rows={members.data?.items}
            isLoading={members.isLoading}
            error={members.error}
            onRetry={members.refetch}
            empty={{ title: 'No members yet' }}
          />
        </div>
      </Card>
    </>
  );
}
