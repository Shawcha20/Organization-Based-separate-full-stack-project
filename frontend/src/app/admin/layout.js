'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { ROLES } from '@/lib/auth';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/organizations', label: 'Organizations' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/transactions', label: 'Transactions' },
];

export default function AdminLayout({ children }) {
  return (
    <DashboardLayout allow={[ROLES.PLATFORM_ADMIN]} nav={NAV}>
      {children}
    </DashboardLayout>
  );
}
