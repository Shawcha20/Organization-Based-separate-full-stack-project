'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { ROLES } from '@/lib/auth';

const NAV = [
  { href: '/org', label: 'Organization' },
  { href: '/org/members', label: 'Members' },
  { href: '/org/subscription', label: 'Subscription' },
  { href: '/org/billing', label: 'Billing & payments' },
  { href: '/org/transactions', label: 'Transactions' },
  { href: '/me', label: 'My profile' },
];

export default function OrgLayout({ children }) {
  return (
    <DashboardLayout allow={[ROLES.ORG_ADMIN]} nav={NAV}>
      {children}
    </DashboardLayout>
  );
}
