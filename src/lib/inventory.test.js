import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, parseDate } from './dates.js';
import {
  averageDailyDemand,
  batchBalances,
  buildDashboard,
  buildInventory,
  expiryStatus,
  fefoAllocate,
  reorderPlan,
  validateMovement,
} from './inventory.js';

const TODAY = '2026-10-29';
const at = (iso) => `${iso}T12:00:00.000Z`;

describe('dates', () => {
  it('parses common pharmacy formats', () => {
    expect(parseDate('2027-03-15')).toBe('2027-03-15');
    expect(parseDate('15/03/2027')).toBe('2027-03-15');
    expect(parseDate('15-03-27')).toBe('2027-03-15');
    expect(parseDate('03/2027')).toBe('2027-03-31');
    expect(parseDate('02/28')).toBe('2028-02-29');
    expect(parseDate('Mar-2027')).toBe('2027-03-31');
    expect(parseDate('31/02/2027')).toBeNull();
    expect(parseDate('13/2027')).toBeNull();
    expect(parseDate('soon')).toBeNull();
  });
  it('computes day differences', () => {
    expect(daysBetween(TODAY, '2026-11-08')).toBe(10);
    expect(addDays(TODAY, 3)).toBe('2026-11-01');
  });
});

describe('blueprint examples', () => {
  it('Example A: days of stock remaining = 20 / 4 = 5', () => {
    expect(reorderPlan({ stock: 20, avgDaily: 4, leadTimeDays: 3, safetyStock: 5 }).daysLeft).toBe(5);
  });
  it('Example B: reorder point = 4 x 3 + 5 = 17 and flags at 17', () => {
    expect(reorderPlan({ stock: 18, avgDaily: 4, leadTimeDays: 3, safetyStock: 5 })).toMatchObject({ reorderPoint: 17, needsReorder: false });
    const at17 = reorderPlan({ stock: 17, avgDaily: 4, leadTimeDays: 3, safetyStock: 5, coverDays: 7 });
    expect(at17.needsReorder).toBe(true);
    expect(at17.suggestedQty).toBe(4 * 10 + 5 - 17);
  });
  it('Example C: exposure = 30 x 40 = 1200', () => {
    const inv = buildInventory(
      {
        medicines: [{ id: 'm1', name: 'X' }],
        batches: [{ id: 'b1', medicine_id: 'm1', batch_number: 'B1', expiry_date: addDays(TODAY, 20), purchase_price: 40 }],
        movements: [{ batch_id: 'b1', type: 'purchase', quantity: 30, occurred_at: at(TODAY) }],
        settings: {},
      },
      TODAY,
    );
    expect(inv[0].nearExpiryBatches[0].exposure).toBe(1200);
  });
});

describe('reorderPlan', () => {
  it('flags below owner minimum even without sales history', () => {
    expect(reorderPlan({ stock: 3, avgDaily: 0, leadTimeDays: 3, minStock: 5 })).toMatchObject({ needsReorder: true, suggestedQty: 2 });
    expect(reorderPlan({ stock: 5, avgDaily: 0, leadTimeDays: 3, minStock: 5 }).needsReorder).toBe(false);
  });
  it('does not flag products with no demand and no thresholds', () => {
    expect(reorderPlan({ stock: 0, avgDaily: 0, leadTimeDays: 3 }).needsReorder).toBe(false);
  });
});

describe('expiry and FEFO', () => {
  it('classifies expiry status', () => {
    expect(expiryStatus('2026-10-28', TODAY, 90)).toBe('expired');
    expect(expiryStatus(TODAY, TODAY, 90)).toBe('near');
    expect(expiryStatus(addDays(TODAY, 90), TODAY, 90)).toBe('near');
    expect(expiryStatus(addDays(TODAY, 91), TODAY, 90)).toBe('ok');
  });
  it('allocates earliest non-expired batches first', () => {
    const batches = [
      { id: 'late', batch_number: 'L', expiry_date: '2027-06-30', quantity: 10 },
      { id: 'gone', batch_number: 'E', expiry_date: '2026-10-01', quantity: 50 },
      { id: 'early', batch_number: 'A', expiry_date: '2026-12-31', quantity: 4 },
    ];
    const { allocations, shortfall } = fefoAllocate(batches, 6, TODAY);
    expect(allocations.map((a) => [a.batch.id, a.quantity])).toEqual([['early', 4], ['late', 2]]);
    expect(shortfall).toBe(0);
    expect(fefoAllocate(batches, 20, TODAY).shortfall).toBe(6);
  });
});

describe('ledger', () => {
  it('derives batch balances from movements', () => {
    const b = batchBalances([
      { batch_id: 'a', quantity: 10 },
      { batch_id: 'a', quantity: -3 },
      { batch_id: 'b', quantity: 5 },
    ]);
    expect(b.get('a')).toBe(7);
    expect(b.get('b')).toBe(5);
  });
  it('validates movement direction and reasons', () => {
    expect(validateMovement({ type: 'sale', quantity: -2 })).toBeNull();
    expect(validateMovement({ type: 'sale', quantity: 2 })).toMatch(/decrease/);
    expect(validateMovement({ type: 'purchase', quantity: -2 })).toMatch(/increase/);
    expect(validateMovement({ type: 'adjustment', quantity: -2 })).toMatch(/reason/);
    expect(validateMovement({ type: 'adjustment', quantity: -2, reason: 'count' })).toBeNull();
    expect(validateMovement({ type: 'sale', quantity: -1.5 })).toMatch(/whole/);
  });
  it('averages demand over the look-back window only', () => {
    const mvs = [
      { type: 'sale', quantity: -10, occurred_at: at(addDays(TODAY, -1)) },
      { type: 'sale', quantity: -20, occurred_at: at(addDays(TODAY, -9)) },
      { type: 'sale', quantity: -99, occurred_at: at(addDays(TODAY, -10)) },
      { type: 'snapshot', quantity: -10, reason: 'sync', occurred_at: at(TODAY) },
      { type: 'snapshot', quantity: 50, reason: 'sync', occurred_at: at(TODAY) },
      { type: 'purchase', quantity: 100, occurred_at: at(TODAY) },
    ];
    expect(averageDailyDemand(mvs, TODAY, 10)).toBe(4);
  });
});

describe('buildInventory + dashboard', () => {
  it('excludes expired stock from availability and raises actions', () => {
    const data = {
      medicines: [{ id: 'm1', name: 'Para', strength: '500 mg', min_stock: 10, safety_stock: 0 }],
      batches: [
        { id: 'b1', medicine_id: 'm1', batch_number: 'OLD', expiry_date: addDays(TODAY, -2), purchase_price: 10 },
        { id: 'b2', medicine_id: 'm1', batch_number: 'NEW', expiry_date: addDays(TODAY, 30), purchase_price: 12 },
      ],
      movements: [
        { batch_id: 'b1', type: 'purchase', quantity: 20, occurred_at: at(addDays(TODAY, -40)) },
        { batch_id: 'b2', type: 'purchase', quantity: 8, occurred_at: at(addDays(TODAY, -5)) },
      ],
      settings: { expiry_window_days: 60 },
    };
    const [row] = buildInventory(data, TODAY);
    expect(row.available).toBe(8);
    expect(row.expiredQty).toBe(20);
    expect(row.needsReorder).toBe(true);
    const d = buildDashboard([row]);
    expect(d).toMatchObject({ products: 1, lowStock: 1, nearExpiry: 1, expired: 1, nearExpiryExposure: 96, expiredExposure: 200 });
    expect(d.actions[0].level).toBe('danger');
  });
});
