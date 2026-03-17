/**
 * Masks a phone number, keeping only the last 4 digits visible.
 * e.g. "+919876543210" → "••••••3210"
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return `••••••${last4}`;
}
