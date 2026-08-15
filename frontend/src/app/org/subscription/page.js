'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import PlanCard from '@/components/PlanCard';
import { Loading, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { money, date, interval } from '@/lib/format';

export default function SubscriptionPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');

  const query = useQuery({ queryKey: ['org-subscription'], queryFn: () => api('/org/subscription') });
  const members = useQuery({ queryKey: ['org-members'], queryFn: () => api('/org/members') });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['org-subscription'] });
    queryClient.invalidateQueries({ queryKey: ['org'] });
  };

  const changePlan = useMutation({
    mutationFn: (planId) => api('/org/subscription/change', { method: 'POST', body: { planId } }),
    onSuccess: (subscription) => {
      setNotice(`Your plan is now ${subscription.planName}.`);
      refresh();
    },
    onError: () => setNotice(''),
  });

  const cancel = useMutation({
    mutationFn: () => api('/org/subscription/cancel', { method: 'POST' }),
    onSuccess: () => {
      setNotice('Your subscription will end when the current period finishes.');
      refresh();
    },
    onError: () => setNotice(''),
  });

  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const { subscription, plans } = query.data;
  const currentPlanId = subscription.plan?._id || subscription.plan;
  const memberCount = members.data?.items?.length;
  const memberLimit = subscription.plan?.memberLimit;
  const actionError = changePlan.error || cancel.error;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Subscription</h1>
        <p className="text-sm text-slate-500">Your current plan and billing period</p>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {actionError && <Alert tone="error">{actionError.message}</Alert>}

      {subscription.cancelAtPeriodEnd && (
        <Alert tone="warning">
          This subscription is scheduled to end on {date(subscription.currentPeriodEnd)}. You keep
          full access until then.
        </Alert>
      )}
      {subscription.status === 'FAILED' && (
        <Alert tone="error">
          The last payment failed. Update your payment method on the billing page to keep your
          subscription active.
        </Alert>
      )}

      <Card
        title="Current plan"
        actions={
          !subscription.cancelAtPeriodEnd &&
          subscription.status !== 'CANCELLED' && (
            <Button
              variant="danger"
              size="sm"
              loading={cancel.isPending}
              onClick={() => {
                if (window.confirm('Cancel at the end of the current billing period?')) {
                  cancel.mutate();
                }
              }}
            >
              Cancel subscription
            </Button>
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Detail label="Plan" value={subscription.planName} />
          <Detail
            label="Price"
            value={`${money(subscription.amount, subscription.currency)} ${interval(subscription.interval)}`}
          />
          <Detail
            label={subscription.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'}
            value={date(subscription.currentPeriodEnd)}
          />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
            <div className="mt-1">
              <Badge status={subscription.status} />
            </div>
          </div>
        </div>

        {memberLimit && memberCount !== undefined && (
          <p className="mt-4 text-sm text-slate-600">
            Using <strong>{memberCount}</strong> of <strong>{memberLimit}</strong> member seats.
          </p>
        )}
      </Card>

      <Card
        title="Change plan"
        description="Upgrades and downgrades take effect immediately and are prorated by Stripe"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const current = plan._id === currentPlanId;
            return (
              <PlanCard
                key={plan._id}
                plan={plan}
                selected={current}
                badge={current ? 'Current' : undefined}
                disabled={current || changePlan.isPending}
                onSelect={() => {
                  const direction = plan.price > subscription.amount ? 'Upgrade' : 'Downgrade';
                  if (window.confirm(`${direction} to ${plan.name}?`)) changePlan.mutate(plan._id);
                }}
              />
            );
          })}
        </div>
      </Card>
    </>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
