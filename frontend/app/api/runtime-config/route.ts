export const dynamic = 'force-dynamic';

function normalizeApiUrl(value?: string) {
  return (value || '').trim().replace(/\/+$/, '');
}

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function validateApiUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'NEXT_PUBLIC_API_URL must be an absolute http(s) URL';
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_LOCAL_PRODUCTION_URLS !== 'true' &&
      !isLocalOrPrivateHost(url.hostname) &&
      url.protocol !== 'https:'
    ) {
      return 'NEXT_PUBLIC_API_URL must use https in production';
    }
    return undefined;
  } catch {
    return 'NEXT_PUBLIC_API_URL must be an absolute http(s) URL';
  }
}

export function GET() {
  const configuredApiUrl = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);
  const apiUrl = configuredApiUrl || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000/api');
  const error = apiUrl ? validateApiUrl(apiUrl) : 'NEXT_PUBLIC_API_URL must be an absolute http(s) URL';
  const body = `window.__WMS_CONFIG__=${JSON.stringify({ apiUrl: error ? '' : apiUrl, error })};`;

  return new Response(body, {
    status: error ? 500 : 200,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'application/javascript; charset=utf-8',
    },
  });
}
