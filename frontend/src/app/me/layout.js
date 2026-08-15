'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { useAuth, ROLES } from '@/lib/auth';

export default function MemberLayout({ children }) {
  const { user } = useAuth();

  const nav = [
    { href: '/me', label: 'My profile' },
    { href: '/me/organization', label: 'Organization' },
  ];

  // An org admin lands here to manage their own account, so give them a way
  // back to the admin panel.
  if (user?.role === ROLES.ORG_ADMIN) {
    nav.push({ href: '/org', label: 'Back to admin panel' });
  }

  return (
    <DashboardLayout allow={[ROLES.ORG_MEMBER, ROLES.ORG_ADMIN]} nav={nav}>
      {children}
    </DashboardLayout>
  );
}
