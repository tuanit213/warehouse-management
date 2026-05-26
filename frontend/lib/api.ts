type RuntimeConfig = {
  apiUrl?: string;
  error?: string;
};

declare global {
  interface Window {
    __WMS_CONFIG__?: RuntimeConfig;
  }
}

function normalizeApiUrl(value?: string) {
  return (value || '').trim().replace(/\/+$/, '');
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function assertUsableApiUrl(value: string, source: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${source} must be an absolute http(s) URL`);
  if (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_LOCAL_PRODUCTION_URLS !== 'true' &&
    !isLocalOrPrivateHost(url.hostname) &&
    url.protocol !== 'https:'
  ) {
    throw new Error(`${source} must use https in production`);
  }
}

export function getApiUrl() {
  if (typeof window !== 'undefined') {
    const runtimeConfig = window.__WMS_CONFIG__;
    if (runtimeConfig?.error) throw new Error(`Runtime config error: ${runtimeConfig.error}`);
    const runtimeApiUrl = normalizeApiUrl(runtimeConfig?.apiUrl);
    if (runtimeApiUrl) {
      if (!isHttpUrl(runtimeApiUrl)) throw new Error('Runtime apiUrl must be an absolute http(s) URL');
      assertUsableApiUrl(runtimeApiUrl, 'Runtime apiUrl');
      return runtimeApiUrl;
    }
  }

  const buildApiUrl = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);
  if (buildApiUrl) {
    if (!isHttpUrl(buildApiUrl)) throw new Error('NEXT_PUBLIC_API_URL must be an absolute http(s) URL');
    assertUsableApiUrl(buildApiUrl, 'NEXT_PUBLIC_API_URL');
    return buildApiUrl;
  }

  if (typeof window === 'undefined') return 'http://localhost:3000/api';
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000/api';
  throw new Error('NEXT_PUBLIC_API_URL is required in production');
}

export const API_URL = getApiUrl();

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      Array.isArray(data?.message) ? data.message.join(', ') : data?.message || `${response.status} ${response.statusText}`,
      response.status,
    );
  }
  return data;
}
