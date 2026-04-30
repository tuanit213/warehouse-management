# Auth Service + API Gateway

## Auth endpoints qua Gateway

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- PATCH /api/auth/change-password
- GET /api/auth/users (ADMIN)
- PATCH /api/auth/users/:id/role (ADMIN)

## JWT claims

```json
{ "sub": "user-id", "email": "admin@wms.local", "role": "ADMIN" }
```

## Gateway rule

- /api/auth/register và /api/auth/login là public.
- Các route còn lại cần Bearer token.
- Gateway gọi Auth Service /api/auth/verify để xác thực token trước khi proxy.

## Test nhanh

```powershell
$body = @{ email='admin@wms.local'; password='Password@123'; fullName='Admin'; role='ADMIN' } | ConvertTo-Json
$reg = Invoke-RestMethod http://localhost:3000/api/auth/register -Method Post -ContentType 'application/json' -Body $body
$token = $reg.accessToken
Invoke-RestMethod http://localhost:3000/api/auth/me -Headers @{ Authorization = "Bearer $token" }
```
