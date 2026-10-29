import { parseDate, daysBetween } from './dates.js';
import { batchBalances, medicineKey } from './inventory.js';

export const IMPORT_FIELDS = {
  name: { label: 'Medicine name', required: true, aliases: ['name', 'medicine', 'medicine name', 'product', 'product name', 'item', 'item name', 'drug', 'drug name'] },
  strength: { label: 'Strength', aliases: ['strength', 'potency', 'dose'] },
  dosage_form: { label: 'Dosage form', aliases: ['dosage form', 'form', 'dosage_form', 'type'] },
  manufacturer: { label: 'Manufacturer / brand', aliases: ['manufacturer', 'company', 'mfg', 'mfr', 'brand', 'marketed by'] },
  batch_number: { label: 'Batch number', required: true, aliases: ['batch', 'batch no', 'batch no.', 'batch number', 'batch_no', 'batchno', 'batch_number'] },
  expiry_date: { label: 'Expiry date', required: true, aliases: ['expiry', 'expiry date', 'exp', 'exp date', 'exp.', 'expiry_date', 'exp_date', 'expdate'] },
  quantity: { label: 'Quantity', required: true, aliases: ['quantity', 'qty', 'stock', 'closing stock', 'balance', 'units'] },
  purchase_price: { label: 'Purchase price (per unit)', aliases: ['purchase price', 'purchase_price', 'cost', 'cost price', 'rate', 'purchase rate', 'ptr'] },
  mrp: { label: 'MRP', aliases: ['mrp', 'm.r.p', 'm.r.p.'] },
  unit: { label: 'Unit', aliases: ['unit', 'pack', 'uom'] },
  min_stock: { label: 'Minimum stock', aliases: ['min stock', 'minimum stock', 'min_stock', 'reorder level', 'min qty'] },
};

const clean = (h) => String(h || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');

export function autoMapHeaders(headers) {
  const map = {};
  for (const [field, def] of Object.entries(IMPORT_FIELDS)) {
    const hit = headers.find((h) => def.aliases.map(clean).includes(clean(h)));
    if (hit !== undefined) map[field] = hit;
  }
  return map;
}

function num(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validates raw CSV rows. Rows with errors are never imported; warnings are shown for review.
 * Duplicate batch lines in the same file are combined.
 */
export function validateRows(rawRows, headerMap, { batches = [], medicines = [] } = {}, todayISO) {
  const missing = Object.entries(IMPORT_FIELDS)
    .filter(([f, d]) => d.required && !headerMap[f])
    .map(([, d]) => d.label);
  if (missing.length) return { fatal: `Missing required column(s): ${missing.join(', ')}`, rows: [] };

  const medByKey = new Map(medicines.map((m) => [medicineKey(m.name, m.strength), m]));
  const batchByKey = new Map(batches.map((b) => [`${b.medicine_id}|${String(b.batch_number).trim().toLowerCase()}`, b]));
  const seen = new Map();
  const rows = [];

  rawRows.forEach((raw, i) => {
    const get = (f) => (headerMap[f] ? String(raw[headerMap[f]] ?? '').trim() : '');
    if (Object.values(raw).every((v) => String(v ?? '').trim() === '')) return;

    const errors = [];
    const warnings = [];
    const data = {
      name: get('name'),
      strength: get('strength'),
      dosage_form: get('dosage_form'),
      manufacturer: get('manufacturer'),
      unit: get('unit') || 'unit',
      batch_number: get('batch_number'),
      expiry_raw: get('expiry_date'),
      expiry_date: parseDate(get('expiry_date')),
      quantity_raw: get('quantity'),
      quantity: num(get('quantity')),
      purchase_price: num(get('purchase_price')),
      mrp: num(get('mrp')),
      min_stock: num(get('min_stock')),
    };

    if (!data.name) errors.push('Medicine name is missing');
    if (!data.batch_number) errors.push('Batch number is missing');
    if (!data.expiry_raw) errors.push('Expiry date is missing');
    else if (!data.expiry_date) errors.push(`Expiry date "${data.expiry_raw}" not recognised (use DD/MM/YYYY, YYYY-MM-DD or MM/YYYY)`);
    if (data.quantity == null) errors.push('Quantity is missing');
    else if (!Number.isInteger(data.quantity) || data.quantity < 0) errors.push('Quantity must be a whole number ≥ 0');
    if (Number.isNaN(data.purchase_price) || data.purchase_price < 0) errors.push('Purchase price is invalid');
    if (Number.isNaN(data.mrp) || data.mrp < 0) errors.push('MRP is invalid');
    if (Number.isNaN(data.min_stock) || (data.min_stock != null && data.min_stock < 0)) errors.push('Minimum stock is invalid');

    if (data.purchase_price == null) warnings.push('No purchase price — expiry exposure cannot be estimated');
    if (data.expiry_date && daysBetween(todayISO, data.expiry_date) < 0) warnings.push('Batch is already expired');

    const med = medByKey.get(medicineKey(data.name, data.strength));
    data.existingMedicine = med || null;
    const existingBatch = med ? batchByKey.get(`${med.id}|${data.batch_number.toLowerCase()}`) : null;
    data.existingBatch = existingBatch || null;
    if (existingBatch && data.expiry_date && existingBatch.expiry_date !== data.expiry_date) {
      warnings.push(`Batch exists with expiry ${existingBatch.expiry_date}; stored expiry will be kept`);
    }

    const key = `${medicineKey(data.name, data.strength)}|${data.batch_number.toLowerCase()}`;
    if (!errors.length && seen.has(key)) {
      const first = seen.get(key);
      first.data.quantity += data.quantity;
      first.warnings.push(`Combined with duplicate line ${i + 2}`);
      return;
    }
    const row = { line: i + 2, data, errors, warnings };
    if (!errors.length) seen.set(key, row);
    rows.push(row);
  });

  return { fatal: null, rows };
}

/**
 * Turns validated rows into records to insert.
 * mode "receive": quantities are added as purchases.
 * mode "snapshot": batch balances are set to the file quantity (differences recorded as snapshot movements).
 */
export function planImport(rows, mode, { movements = [] } = {}, newId, nowISO) {
  const balances = batchBalances(movements);
  const newMedicines = [];
  const newBatches = [];
  const newMovements = [];
  const medByKey = new Map();
  let skipped = 0;

  for (const { data, errors } of rows) {
    if (errors.length) continue;
    const mKey = medicineKey(data.name, data.strength);
    let medicineId = data.existingMedicine?.id || medByKey.get(mKey);
    if (!medicineId) {
      medicineId = newId();
      medByKey.set(mKey, medicineId);
      newMedicines.push({
        id: medicineId,
        name: data.name,
        strength: data.strength || null,
        dosage_form: data.dosage_form || null,
        manufacturer: data.manufacturer || null,
        unit: data.unit,
        min_stock: data.min_stock ?? 0,
        safety_stock: 0,
        lead_time_days: null,
      });
    }

    let batchId = data.existingBatch?.id;
    const current = batchId ? balances.get(batchId) || 0 : 0;
    if (!batchId) {
      batchId = newId();
      newBatches.push({
        id: batchId,
        medicine_id: medicineId,
        batch_number: data.batch_number,
        expiry_date: data.expiry_date,
        purchase_price: data.purchase_price,
        mrp: data.mrp,
      });
    }

    let mv = null;
    if (mode === 'snapshot') {
      const delta = data.quantity - current;
      if (delta !== 0) {
        mv = data.existingBatch
          ? { type: 'snapshot', quantity: delta, reason: 'Stock snapshot import' }
          : { type: 'opening', quantity: delta, reason: 'Stock snapshot import (new batch)' };
      }
    } else if (data.quantity > 0) {
      mv = { type: 'purchase', quantity: data.quantity, reason: 'CSV import' };
    }
    if (mv) newMovements.push({ id: newId(), batch_id: batchId, occurred_at: nowISO, reference: null, ...mv });
    else skipped++;
  }
  return { newMedicines, newBatches, newMovements, unchanged: skipped };
}
