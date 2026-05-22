import { ApiError, authHeaders } from './api';

export async function downloadAuthorizedFile(url: string, accessToken: string, fileName: string) {
  const response = await fetch(url, { headers: authHeaders(accessToken) });
  if (!response.ok) {
    const text = await response.text();
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = text ? JSON.parse(text) : null;
      message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || message;
    } catch {
      if (text) message = text;
    }
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
