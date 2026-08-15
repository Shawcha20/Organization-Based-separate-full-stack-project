'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, HOME_FOR_ROLE } from '@/lib/auth';
import { Loading } from '@/components/ui/States';

// The entry point just routes people to the panel their role belongs to.
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? HOME_FOR_ROLE[user.role] : '/login');
  }, [user, loading, router]);

  return <Loading />;
}
