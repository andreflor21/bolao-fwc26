import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken, setOnAuthLost } from './api';
import type { UserDto, UserRole, AuthTokensDto } from '@bolao/shared';

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  /** True when this user can switch into admin mode (role === 'admin'). */
  isAdmin: boolean;
  /** True when the admin has the toggle ON (i.e. seeing the admin sidebar). */
  adminView: boolean;
  /**
   * The role to use for UI gating. For admins with the toggle off, returns
   * 'subscriber' so they see exactly what a paid player sees.
   */
  effectiveRole: UserRole;
  toggleAdminView: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    extras?: { whatsapp?: string; whatsappGroupOptIn?: boolean },
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKENS_KEY = 'bolao.tokens.v1';
const ADMIN_VIEW_KEY = 'bolao.adminView.v1';

function loadTokens(): AuthTokensDto | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as AuthTokensDto) : null;
  } catch {
    return null;
  }
}
function saveTokens(t: AuthTokensDto | null) {
  if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
  else localStorage.removeItem(TOKENS_KEY);
}

function loadAdminView(): boolean {
  try {
    return localStorage.getItem(ADMIN_VIEW_KEY) === '1';
  } catch {
    return false;
  }
}
function saveAdminView(v: boolean) {
  try {
    if (v) localStorage.setItem(ADMIN_VIEW_KEY, '1');
    else localStorage.removeItem(ADMIN_VIEW_KEY);
  } catch {
    // localStorage may be unavailable in private browsing — silently degrade.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminView, setAdminView] = useState<boolean>(() => loadAdminView());

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
    // Reset admin toggle on logout so the next account starts in player mode.
    saveAdminView(false);
    setAdminView(false);
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

  const register = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      extras?: { whatsapp?: string; whatsappGroupOptIn?: boolean },
    ) => {
    const res = await api<{ user: UserDto; tokens: AuthTokensDto }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, ...extras }),
    });
    saveTokens(res.tokens);
    setAccessToken(res.tokens.accessToken);
    setUser(res.user);
  }, []);

  const toggleAdminView = useCallback(() => {
    setAdminView((prev) => {
      const next = !prev;
      saveAdminView(next);
      return next;
    });
  }, []);

  const isAdmin = user?.role === 'admin';
  // Non-admins ignore the toggle entirely. Admins with the toggle off render
  // the app exactly as a subscriber would — same data, same routes.
  const effectiveRole: UserRole = isAdmin && adminView ? 'admin' : user?.role ?? 'player';

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin,
      adminView,
      effectiveRole,
      toggleAdminView,
      login,
      register,
      logout,
      refreshMe,
    }),
    [user, loading, isAdmin, adminView, effectiveRole, toggleAdminView, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
