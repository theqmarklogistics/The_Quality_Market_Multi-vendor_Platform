// Public payment config — MoMo pay code/name shown in post-checkout instructions.
// Bank details are intentionally not exposed here (sent via invoice on the web).
import { apiGet } from './client';
import type { PaymentConfig } from './types';

export function getPaymentConfig(): Promise<PaymentConfig> {
  return apiGet<PaymentConfig>('/api/payment-config');
}
