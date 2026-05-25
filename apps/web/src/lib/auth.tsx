import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken, setOnAuthLost } from './api';
import type { UserDto, AuthTokensDto } from '@bolao/shared';

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'bolao.tokens.v1';

function loadTokens(): AuthTokensDto | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthTokensDto) : null;
  } catch {
    return null;
  }
}
function saveTokens(t: AuthTokensDto | null) {
  if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  else localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<UserDto>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    const t = loadTokens();
    if (t?.refreshToken) {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: t.refreshToken }),
      }).catch(() => undefined);
    }
    saveTokens(null);
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnAuthLost(() => {
      saveTokens(null);
      setAccessToken(null);
      setUser(null);
    });
    const t = loadTokens();
    if (t?.accessToken) {
      setAccessToken(t.accessToken);
      refreshMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => setOnAuthLost(null);
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: UserDto; tokens: AuthTokensDto }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    saveTokens(res.tokens);
    setAccessToken(res.tokens.accessToken);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api<{ user: UserDto; tokens: AuthTokensDto }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    saveTokens(res.tokens);
    setAccessToken(res.tokens.accessToken);
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshMe }),
    [user, loading, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
