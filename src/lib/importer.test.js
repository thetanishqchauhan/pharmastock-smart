import { describe, expect, it } from 'vitest';
import { autoMapHeaders, planImport, validateRows } from './importer.js';

const TODAY = '2026-10-29';
let n = 0;
const newId = () => `id${++n}`;
const headers = ['Medicine Name', 'Strength', 'Batch No', 'Expiry', 'Qty', 'Purchase Rate'];
const row = (name, strength, batch, exp, qty, price = '10') => ({
  'Medicine Name': name, Strength: strength, 'Batch No': batch, Expiry: exp, Qty: qty, 'Purchase Rate': price,
});

describe('importer', () => {
  it('auto-maps common header names', () => {
    expect(autoMapHeaders(headers)).toMatchObject({
      name: 'Medicine Name', strength: 'Strength', batch_number: 'Batch No', expiry_date: 'Expiry', quantity: 'Qty', purchase_price: 'Purchase Rate',
    });
  });

  it('reports missing required columns', () => {
    expect(validateRows([], { name: 'x' }, {}, TODAY).fatal).toMatch(/Batch number/);
  });

  it('validates rows and combines duplicate batches', () => {
    const map = autoMapHeaders(headers);
    const { rows } = validateRows(
      [
        row('Para', '500 mg', 'B1', '03/2027', '10'),
        row('para', '500 MG', 'b1', '03/2027', '5'),
        row('Cetri', '10 mg', 'C1', '31/02/2027', '5'),
        row('', '', 'X', '01/2027', '1'),
        row('Amox', '', 'A1', '01/2026', '2.5'),
        row('Old', '', 'O1', '01/2026', '3', ''),
      ],
      map, {}, TODAY,
    );
    expect(rows).toHaveLength(5);
    expect(rows[0].data.quantity).toBe(15);
    expect(rows[0].warnings.join()).toMatch(/duplicate/);
    expect(rows[1].errors.join()).toMatch(/not recognised/);
    expect(rows[2].errors.join()).toMatch(/name is missing/);
    expect(rows[3].errors.join()).toMatch(/whole number/);
    expect(rows[4].errors).toEqual([]);
    expect(rows[4].warnings.join()).toMatch(/already expired/);
    expect(rows[4].warnings.join()).toMatch(/No purchase price/);
  });

  it('plans received-stock import with new medicines and batches', () => {
    const map = autoMapHeaders(headers);
    const { rows } = validateRows([row('Para', '500 mg', 'B1', '03/2027', '10'), row('Para', '500 mg', 'B2', '06/2027', '4')], map, {}, TODAY);
    const plan = planImport(rows, 'receive', {}, newId, '2026-10-29T10:00:00Z');
    expect(plan.newMedicines).toHaveLength(1);
    expect(plan.newBatches).toHaveLength(2);
    expect(plan.newMovements.map((m) => [m.type, m.quantity])).toEqual([['purchase', 10], ['purchase', 4]]);
  });

  it('plans snapshot import as differences against existing balances', () => {
    const existing = {
      medicines: [{ id: 'm1', name: 'Para', strength: '500 mg' }],
      batches: [{ id: 'b1', medicine_id: 'm1', batch_number: 'B1', expiry_date: '2027-03-31' }],
      movements: [{ batch_id: 'b1', type: 'purchase', quantity: 30 }],
    };
    const map = autoMapHeaders(headers);
    const { rows } = validateRows(
      [row('Para', '500 mg', 'B1', '03/2027', '22'), row('Para', '500 mg', 'B9', '09/2027', '6')],
      map, existing, TODAY,
    );
    const plan = planImport(rows, 'snapshot', existing, newId, '2026-10-29T10:00:00Z');
    expect(plan.newMedicines).toHaveLength(0);
    expect(plan.newBatches).toHaveLength(1);
    expect(plan.newMovements.map((m) => [m.type, m.quantity])).toEqual([['snapshot', -8], ['opening', 6]]);
  });
});
