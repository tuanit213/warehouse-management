import { All, Controller, ForbiddenException, Get, HttpException, Req, Res, UnauthorizedException } from '@nestjs/common';

const serviceMap: Record<string, string> = {
  auth: 'http://auth-service:3001/api',
  products: 'http://product-service:3002/api',
  product: 'http://product-service:3002/api',
  categories: 'http://product-service:3002/api',
  uploads: 'http://product-service:3002/api',
  inventory: 'http://inventory-service:3003/api',
  warehouses: 'http://inventory-service:3003/api',
  locations: 'http://inventory-service:3003/api',
  'stock-levels': 'http://inventory-service:3003/api',
  'stock-alerts': 'http://inventory-service:3003/api',
  'stock-movements': 'http://inventory-service:3003/api',
  'stock-transfers': 'http://inventory-service:3003/api',
  'stock-reservations': 'http://inventory-service:3003/api',
  stocktakes: 'http://inventory-service:3003/api',
  transactions: 'http://transaction-service:3004/api',
  transaction: 'http://transaction-service:3004/api',
  suppliers: 'http://transaction-service:3004/api',
  inbounds: 'http://transaction-service:3004/api',
  outbounds: 'http://transaction-service:3004/api',
  reports: 'http://report-service:3005/api',
  report: 'http://report-service:3005/api',
};

const downstreamServices = [
  ['auth-service', 'http://auth-service:3001/api/health'],
  ['product-service', 'http://product-service:3002/api/health'],
  ['inventory-service', 'http://inventory-service:3003/api/health'],
  ['transaction-service', 'http://transaction-service:3004/api/health'],
  ['report-service', 'http://report-service:3005/api/health'],
] as const;

const publicPaths = ['/auth/login', '/auth/register', '/auth/refresh'];
const publicPathPrefixes = ['/uploads/products/'];
const rateLimitedPaths = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const timeoutMs = (envName: string, fallback: number) => {
  const value = Number(process.env[envName] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const PROXY_TIMEOUT_MS = timeoutMs('PROXY_TIMEOUT_MS', 10_000);
const AUTH_VERIFY_TIMEOUT_MS = timeoutMs('AUTH_VERIFY_TIMEOUT_MS', 3_000);

type Role = 'ADMIN' | 'MANAGER' | 'WAREHOUSE_STAFF';
type VerifiedUser = { id: string; email: string; fullName?: string; role: Role; status?: string };
type VerifiedAuth = { valid: boolean; user: VerifiedUser; claims: { sub: string; email: string; role: Role; fullName?: string } };

const roleRank: Record<Role, number> = { WAREHOUSE_STAFF: 1, MANAGER: 2, ADMIN: 3 };

type Rule = { methods?: string[]; roles: Role[] };
const rbacRules: Array<{ pattern: RegExp; rules: Rule[] }> = [
  { pattern: /^\/auth\/users(?:\/.*)?$/, rules: [{ roles: ['ADMIN'] }] },
  { pattern: /^\/reports?(?:\/.*)?$/, rules: [{ roles: ['ADMIN', 'MANAGER'] }] },
  { pattern: /^\/(?:inventory|warehouses|locations|stock-levels|stock-alerts|stock-movements|stock-transfers|stock-reservations|stocktakes)(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'WAREHOUSE_STAFF'] }] },
  { pattern: /^\/(?:transactions?|suppliers|inbounds|outbounds)(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }] },
  { pattern: /^\/products?(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'MANAGER'] }] },
  { pattern: /^\/categories(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'MANAGER'] }] },
];

const metrics = { requests: 0, proxyTimeouts: 0, authFailures: 0, rbacDenied: 0 };

@Controller()
export class GatewayController {
  @Get('gateway/routes')
  routes() {
    if (process.env.NODE_ENV === 'production') return { services: Object.keys(serviceMap).sort() };
    return serviceMap;
  }

  @Get('gateway/me')
  async me(@Req() req: any, @Res() res: any) {
    const correlationId = this.correlationId(req, res);
    return res.status(200).json(await this.verify(req, correlationId));
  }

  @Get('metrics')
  metrics(@Res() res: any) {
    res.type('text/plain');
    return res.send([
      `wms_gateway_uptime_seconds ${Math.floor(process.uptime())}`,
      `wms_gateway_requests_total ${metrics.requests}`,
      `wms_gateway_proxy_timeouts_total ${metrics.proxyTimeouts}`,
      `wms_gateway_auth_failures_total ${metrics.authFailures}`,
      `wms_gateway_rbac_denied_total ${metrics.rbacDenied}`,
    ].join('\n') + '\n');
  }

  @All('*')
  async proxy(@Req() req: any, @Res() res: any) {
    metrics.requests += 1;
    const original = req.originalUrl.replace(/^\/api/, '') || '/';
    const pathOnly = original.split('?')[0];
    const correlationId = this.correlationId(req, res);
    if (pathOnly === '/health') {
      return res.status(200).json({ service: 'api-gateway', status: 'ok', correlationId, timestamp: new Date().toISOString() });
    }
    if (pathOnly === '/health/ready') {
      const readiness = await this.readiness();
      return res.status(readiness.status === 'ok' ? 200 : 503).json({ ...readiness, correlationId });
    }
    const [, first] = pathOnly.split('/');
    const base = serviceMap[first];
    if (!base) throw new HttpException({ message: 'No route for service', path: original, correlationId }, 404);

    let verified: VerifiedAuth | undefined;
    if (publicPaths.includes(pathOnly) || publicPathPrefixes.some((prefix) => pathOnly.startsWith(prefix))) this.checkRateLimit(req, pathOnly);
    else {
      verified = await this.verify(req, correlationId);
      this.authorize(req.method, pathOnly, verified.user.role, correlationId);
    }

    const targetUrl = base + original;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'expect'].includes(key.toLowerCase())) continue;
      if (Array.isArray(value)) headers[key] = value.join(',');
      else if (value) headers[key] = String(value);
    }

    headers['content-type'] = headers['content-type'] || 'application/json';
    headers['x-correlation-id'] = correlationId;
    if (process.env.INTERNAL_GATEWAY_TOKEN) {
      headers['x-internal-gateway-token'] = process.env.INTERNAL_GATEWAY_TOKEN;
    }
    if (verified) {
      headers['x-user-id'] = verified.user.id;
      headers['x-user-email'] = verified.user.email;
      headers['x-user-role'] = verified.user.role;
      headers['x-user-full-name'] = verified.user.fullName || verified.claims.fullName || '';
    }

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
    } catch (error: any) {
      if (this.isTimeout(error)) {
        metrics.proxyTimeouts += 1;
        this.log('warn', 'proxy_timeout', { correlationId, method: req.method, path: pathOnly });
        throw new HttpException({ message: 'Gateway proxy timed out', correlationId }, 504);
      }
      throw new HttpException({
        message: 'Gateway proxy failed',
        correlationId,
        ...(process.env.NODE_ENV === 'production' ? {} : { targetUrl, cause: error?.cause?.message || error?.message }),
      }, 502);
    }
    const contentType = response.headers.get('content-type') || 'application/json';
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) res.setHeader('content-disposition', contentDisposition);
    res.status(response.status).type(contentType);
    this.log('info', 'request_complete', { correlationId, method: req.method, path: pathOnly, status: response.status });
    if (contentType.includes('application/json') || contentType.startsWith('text/')) {
      return res.send(await response.text());
    }
    return res.send(Buffer.from(await response.arrayBuffer()));
  }

  private async readiness() {
    const checks = await Promise.all(downstreamServices.map(async ([service, url]) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
        return { service, status: response.ok ? 'ok' : 'error', httpStatus: response.status };
      } catch (error: any) {
        return { service, status: 'error', error: error?.message || 'unreachable' };
      }
    }));
    const status = checks.every((item) => item.status === 'ok') ? 'ok' : 'degraded';
    return { service: 'api-gateway', status, checks, timestamp: new Date().toISOString() };
  }

  private correlationId(req: any, res: any) {
    const incoming = req.headers['x-correlation-id'];
    const value = Array.isArray(incoming) ? incoming[0] : incoming;
    const correlationId = value || `wms-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    res.setHeader('x-correlation-id', correlationId);
    return correlationId;
  }

  private checkRateLimit(req: any, path: string) {
    if (!rateLimitedPaths.has(path)) return;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${path}`;
    const now = Date.now();
    const current = authAttempts.get(key);
    if (!current || current.resetAt <= now) {
      authAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }
    current.count += 1;
    if (current.count > RATE_LIMIT_MAX) {
      throw new HttpException({ message: 'Too many auth attempts. Try again later.' }, 429);
    }
  }

  private authorize(method: string, path: string, role: Role, correlationId?: string) {
    if (role === 'ADMIN') return;
    const match = rbacRules.find((item) => item.pattern.test(path));
    if (!match) return;
    const rule = match.rules.find((item) => !item.methods || item.methods.includes(method));
    if (!rule) throw new ForbiddenException('No RBAC rule for this method');
    if (!rule.roles.includes(role)) {
      metrics.rbacDenied += 1;
      this.log('warn', 'rbac_denied', { correlationId, method, path, role });
      throw new ForbiddenException(`Role ${role} cannot access ${method} ${path}`);
    }
  }

  private isTimeout(error: any) {
    return error?.name === 'TimeoutError' || error?.name === 'AbortError' || /aborted|timeout/i.test(error?.message || '');
  }

  private async verify(req: any, correlationId?: string): Promise<VerifiedAuth> {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      const response = await fetch('http://auth-service:3001/api/auth/verify', {
        method: 'POST',
        headers: {
          authorization,
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
          ...(process.env.INTERNAL_GATEWAY_TOKEN ? { 'x-internal-gateway-token': process.env.INTERNAL_GATEWAY_TOKEN } : {}),
        },
        signal: AbortSignal.timeout(AUTH_VERIFY_TIMEOUT_MS),
      });
      if (!response.ok) {
        metrics.authFailures += 1;
        this.log('warn', 'auth_verify_failed', { correlationId, reason: 'invalid_token' });
        throw new UnauthorizedException('Invalid token');
      }
      return response.json();
    } catch (error: any) {
      if (error instanceof UnauthorizedException) throw error;
      metrics.authFailures += 1;
      if (this.isTimeout(error)) {
        this.log('warn', 'auth_verify_failed', { correlationId, reason: 'timeout' });
        throw new HttpException({ message: 'Auth verification timed out', correlationId }, 504);
      }
      this.log('warn', 'auth_verify_failed', { correlationId, reason: 'downstream_error' });
      throw new HttpException({ message: 'Auth verification failed', correlationId }, 503);
    }
  }

  private log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ service: 'api-gateway', level, event, timestamp: new Date().toISOString(), ...fields }));
  }
}
