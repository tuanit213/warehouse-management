export function GET() {
  return Response.json({
    service: 'frontend',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
