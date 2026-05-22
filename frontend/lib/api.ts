export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

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
