'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, tokenStore } from './api';

const AuthContext = createContext(null);

export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  ORG_MEMBER: 'ORG_MEMBER',
};

/** Where each role lands after logging in. */
export const HOME_FOR_ROLE = {
  [ROLES.PLATFORM_ADMIN]: '/admin',
  [ROLES.ORG_ADMIN]: '/org',
  [ROLES.ORG_MEMBER]: '/me',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // On a page refresh the token is all we have, so the session is rebuilt from
  // the server rather than trusted from storage.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api('/auth/me')
      .then((data) => {
        setUser(data.user);
        setOrganization(data.organization);
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(data.token);
    setUser(data.user);
    setOrganization(data.organization);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setOrganization(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, organization, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
