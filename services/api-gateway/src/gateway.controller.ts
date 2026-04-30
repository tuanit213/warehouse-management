import { All, Controller, Get, HttpException, Req, Res, UnauthorizedException } from '@nestjs/common';

const serviceMap: Record<string, string> = {
  auth: 'http://auth-service:3001/api',
  products: 'http://product-service:3002/api',
  product: 'http://product-service:3002/api',
  inventory: 'http://inventory-service:3003/api',
  transactions: 'http://transaction-service:3004/api',
  transaction: 'http://transaction-service:3004/api',
  reports: 'http://report-service:3005/api',
  report: 'http://report-service:3005/api',
};

const publicPaths = ['/auth/login', '/auth/register'];

@Controller()
export class GatewayController {
  @Get('gateway/routes')
  routes() { return serviceMap; }

  @Get('gateway/me')
  async me(@Req() req: any) { return this.verify(req); }

  @All('*')
  async proxy(@Req() req: any, @Res() res: any) {
    const original = req.originalUrl.replace(/^\/api/, '') || '/';
    const [, first] = original.split('/');
    const base = serviceMap[first];
    if (!base) throw new HttpException({ message: 'No route for service', path: original }, 404);

    if (!publicPaths.includes(original)) await this.verify(req);

    const targetUrl = base + original;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'expect'].includes(key.toLowerCase())) continue;
      if (Array.isArray(value)) headers[key] = value.join(',');
      else if (value) headers[key] = String(value);
    }

    headers['content-type'] = headers['content-type'] || 'application/json';
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
    } catch (error: any) {
      throw new HttpException({ message: 'Gateway proxy failed', targetUrl, cause: error?.cause?.message || error?.message }, 502);
    }
    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json';
    res.status(response.status).type(contentType).send(text);
  }

  private async verify(req: any) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const response = await fetch('http://auth-service:3001/api/auth/verify', { method: 'POST', headers: { authorization } });
    if (!response.ok) throw new UnauthorizedException('Invalid token');
    return response.json();
  }
}
