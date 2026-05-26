import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const CONSENT_KEY = 'bolao.pushConsent.v1';
type ConsentState = 'unknown' | 'granted' | 'dismissed' | 'denied';

interface VapidResponse {
  publicKey: string | null;
  enabled: boolean;
}

interface SubscribeResponse {
  id: string;
  alreadySubscribed: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function getStoredConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unknown';
  const v = localStorage.getItem(CONSENT_KEY);
  if (v === 'granted' || v === 'dismissed' || v === 'denied') return v;
  return 'unknown';
}

export function setStoredConsent(state: ConsentState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, state);
}

export function isPushAvailableInBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

export interface UsePushResult {
  available: boolean;
  consent: ConsentState;
  permission: NotificationPermission | 'unsupported';
  busy: boolean;
  error: string | null;
  /** Triggers the browser permission prompt and registers the subscription with the API. */
  subscribe: () => Promise<void>;
  /** Dismisses the prompt for this session without subscribing. */
  dismiss: () => void;
  /** Unregisters the current subscription (both local and on the API). */
  unsubscribe: () => Promise<void>;
}

export function usePush(): UsePushResult {
  const available = isPushAvailableInBrowser();
  const [consent, setConsent] = useState<ConsentState>(() => getStoredConsent());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    available ? Notification.permission : 'unsupported',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    setPermission(Notification.permission);
  }, [available]);

  const subscribe = useCallback(async () => {
    if (!available) {
      setError('Seu navegador não suporta notificações push.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const vapid = await api<VapidResponse>('/push/vapid-public-key');
      if (!vapid.enabled || !vapid.publicKey) {
        throw new Error('Notificações desativadas no servidor (VAPID ausente)');
      }

      // Ask permission BEFORE registering — Safari requires this order.
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setStoredConsent('denied');
        setConsent('denied');
        return;
      }

      const reg = await registerServiceWorker();
      const keyBytes = urlBase64ToUint8Array(vapid.publicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // PushManager wants a BufferSource with a plain ArrayBuffer (not the
        // looser ArrayBufferLike that Uint8Array exposes). The bytes are the
        // same — we slice to get a fresh ArrayBuffer-backed view.
        applicationServerKey: keyBytes.buffer.slice(
          keyBytes.byteOffset,
          keyBytes.byteOffset + keyBytes.byteLength,
        ) as ArrayBuffer,
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Subscription do navegador veio incompleta');
      }
      await api<SubscribeResponse>('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      setStoredConsent('granted');
      setConsent('granted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ativar notificações');
    } finally {
      setBusy(false);
    }
  }, [available]);

  const dismiss = useCallback(() => {
    setStoredConsent('dismissed');
    setConsent('dismissed');
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!available) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api('/push/subscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStoredConsent('dismissed');
      setConsent('dismissed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao desativar');
    } finally {
      setBusy(false);
    }
  }, [available]);

  return { available, consent, permission, busy, error, subscribe, dismiss, unsubscribe };
}
