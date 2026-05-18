import { All, Controller, ForbiddenException, Get, HttpException, Req, Res, UnauthorizedException } from '@nestjs/common';

const serviceMap: Record<string, string> = {
  auth: 'http://auth-service:3001/api',
  products: 'http://product-service:3002/api',
  product: 'http://product-service:3002/api',
  categories: 'http://product-service:3002/api',
  inventory: 'http://inventory-service:3003/api',
  warehouses: 'http://inventory-service:3003/api',
  locations: 'http://inventory-service:3003/api',
  'stock-levels': 'http://inventory-service:3003/api',
  'stock-alerts': 'http://inventory-service:3003/api',
  'stock-movements': 'http://inventory-service:3003/api',
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
const rateLimitedPaths = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

type Role = 'ADMIN' | 'MANAGER' | 'WAREHOUSE_STAFF';
type VerifiedUser = { id: string; email: string; fullName?: string; role: Role; status?: string };
type VerifiedAuth = { valid: boolean; user: VerifiedUser; claims: { sub: string; email: string; role: Role; fullName?: string } };

const roleRank: Record<Role, number> = { WAREHOUSE_STAFF: 1, MANAGER: 2, ADMIN: 3 };

type Rule = { methods?: string[]; roles: Role[] };
const rbacRules: Array<{ pattern: RegExp; rules: Rule[] }> = [
  { pattern: /^\/auth\/users(?:\/.*)?$/, rules: [{ roles: ['ADMIN'] }] },
  { pattern: /^\/reports?(?:\/.*)?$/, rules: [{ roles: ['ADMIN', 'MANAGER'] }] },
  { pattern: /^\/(?:inventory|warehouses|locations|stock-levels|stock-alerts|stock-movements)(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'WAREHOUSE_STAFF'] }] },
  { pattern: /^\/(?:transactions?|suppliers|inbounds|outbounds)(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }] },
  { pattern: /^\/products?(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'MANAGER'] }] },
  { pattern: /^\/categories(?:\/.*)?$/, rules: [{ methods: ['GET'], roles: ['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'] }, { roles: ['ADMIN', 'MANAGER'] }] },
];

@Controller()
export class GatewayController {
  @Get('gateway/routes')
  routes() { return serviceMap; }

  @Get('gateway/me')
  async me(@Req() req: any) { return this.verify(req); }

  @All('*')
  async proxy(@Req() req: any, @Res() res: any) {
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
    if (publicPaths.includes(pathOnly)) this.checkRateLimit(req, pathOnly);
    else {
      verified = await this.verify(req);
      this.authorize(req.method, pathOnly, verified.user.role);
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
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
    } catch (error: any) {
      throw new HttpException({ message: 'Gateway proxy failed', targetUrl, correlationId, cause: error?.cause?.message || error?.message }, 502);
    }
    const contentType = response.headers.get('content-type') || 'application/json';
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) res.setHeader('content-disposition', contentDisposition);
    res.status(response.status).type(contentType);
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

  private authorize(method: string, path: string, role: Role) {
    if (role === 'ADMIN') return;
    const match = rbacRules.find((item) => item.pattern.test(path));
    if (!match) return;
    const rule = match.rules.find((item) => !item.methods || item.methods.includes(method));
    if (!rule) throw new ForbiddenException('No RBAC rule for this method');
    if (!rule.roles.includes(role)) throw new ForbiddenException(`Role ${role} cannot access ${method} ${path}`);
  }

  private async verify(req: any): Promise<VerifiedAuth> {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const response = await fetch('http://auth-service:3001/api/auth/verify', { method: 'POST', headers: { authorization } });
    if (!response.ok) throw new UnauthorizedException('Invalid token');
    return response.json();
  }
}
