import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedStatus } from '../lib/payment-verification.ts';

const order = { id: 'account-order-1', provider_order_id: 'ORD12345678', amount_cents: 14990 };
const provider = { id: 'ORD12345678', external_reference: 'account-order-1', currency: 'BRL', country_code: 'BRA', total_amount: '149.90', total_paid_amount: '149.90', status: 'processed', status_detail: 'accredited' };
test('only the matching paid order unlocks', () => {
  assert.equal(verifiedStatus(provider, order), 'paid');
  for (const change of [
    { external_reference: 'another-account' }, { id: 'another-order' },
    { total_amount: '14.90' }, { currency: 'USD' }, { total_paid_amount: '0.00' },
  ]) assert.notEqual(verifiedStatus({ ...provider, ...change }, order), 'paid');
});
test('pending and refunded payments cannot retain access', () => {
  assert.equal(verifiedStatus({ ...provider, status: 'processing', status_detail: 'in_process', total_paid_amount: '0.00' }, order), 'pending');
  assert.equal(verifiedStatus({ ...provider, status_detail: 'refunded' }, order), 'refunded');
  assert.equal(verifiedStatus({ ...provider, status: 'failed', status_detail: 'rejected_by_issuer' }, order), 'failed');
});
