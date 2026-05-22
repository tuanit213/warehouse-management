export function parseCurrency(value?: string) {
  return Number(String(value || '').replace(/\D/g, '') || 0);
}

export function formatCurrency(value?: string | number) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : '';
}
