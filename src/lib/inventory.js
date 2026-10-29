import { daysBetween, todayISO as localDate } from './dates.js';

// sign: +1 must be positive, -1 must be negative, 0 either direction (requires a reason)
export const MOVEMENT_TYPES = {
  opening: { label: 'Opening stock', sign: 1 },
  purchase: { label: 'Stock in (purchase)', sign: 1 },
  customer_return: { label: 'Customer return', sign: 1 },
  sale: { label: 'Sale / dispensed', sign: -1 },
  supplier_return: { label: 'Returned to supplier', sign: -1 },
  expired_removal: { label: 'Expired stock removed', sign: -1 },
  damage: { label: 'Damaged / lost', sign: -1 },
  adjustment: { label: 'Stock count correction', sign: 0 },
  snapshot: { label: 'Stock snapshot sync', sign: 0 },
};

export const DEFAULT_SETTINGS = {
  expiry_window_days: 90,
  lookback_days: 30,
  cover_days: 15,
  default_lead_time_days: 3,
};

export function validateMovement(mv) {
  const t = MOVEMENT_TYPES[mv.type];
  if (!t) return `Unknown movement type "${mv.type}"`;
  const q = Number(mv.quantity);
  if (!Number.isInteger(q) || q === 0) return 'Quantity must be a non-zero whole number';
  if (t.sign === 1 && q < 0) return `${t.label} must increase stock`;
  if (t.sign === -1 && q > 0) return `${t.label} must decrease stock`;
  if (t.sign === 0 && !String(mv.reason || '').trim()) return 'A reason is required for corrections';
  return null;
}

export function batchBalances(movements) {
  const balances = new Map();
  for (const mv of movements) {
    balances.set(mv.batch_id, (balances.get(mv.batch_id) || 0) + Number(mv.quantity));
  }
  return balances;
}

/** Expired = past its expiry date. Near = expires within the warning window. */
export function expiryStatus(expiryISO, todayISO, windowDays) {
  if (!expiryISO) return 'unknown';
  const d = daysBetween(todayISO, expiryISO);
  if (d < 0) return 'expired';
  if (d <= windowDays) return 'near';
  return 'ok';
}

// Snapshot imports that reduce stock are treated as consumption (an estimate).
export function isDemandMovement(mv) {
  return mv.type === 'sale' || (mv.type === 'snapshot' && Number(mv.quantity) < 0);
}

export function averageDailyDemand(movements, todayISO, lookbackDays) {
  if (!lookbackDays || lookbackDays <= 0) return 0;
  let total = 0;
  for (const mv of movements) {
    if (!isDemandMovement(mv)) continue;
    const age = daysBetween(localDate(new Date(mv.occurred_at)), todayISO);
    if (age >= 0 && age < lookbackDays) total += -Number(mv.quantity);
  }
  return total / lookbackDays;
}

/**
 * Reorder point = (average daily sales x lead time) + safety stock, never below the
 * owner-defined minimum. Suggested quantity tops stock up to cover lead time + cover days.
 */
export function reorderPlan({ stock, avgDaily, leadTimeDays, safetyStock = 0, minStock = 0, coverDays = 0 }) {
  const demandPoint = Math.ceil(avgDaily * leadTimeDays + safetyStock);
  const reorderPoint = Math.max(demandPoint, minStock);
  const daysLeft = avgDaily > 0 ? stock / avgDaily : null;
  const needsReorder = stock < minStock || ((avgDaily > 0 || safetyStock > 0) && stock <= demandPoint);
  const target = Math.max(Math.ceil(avgDaily * (leadTimeDays + coverDays) + safetyStock), minStock);
  const suggestedQty = needsReorder ? Math.max(target - stock, 1) : 0;
  return { reorderPoint, daysLeft, needsReorder, suggestedQty };
}

/** First Expiry, First Out: allocate quantity from the earliest-expiring, non-expired batches. */
export function fefoAllocate(batches, qty, todayISO) {
  const usable = batches
    .filter((b) => b.quantity > 0 && b.expiry_date && daysBetween(todayISO, b.expiry_date) >= 0)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || String(a.batch_number).localeCompare(String(b.batch_number)));
  const allocations = [];
  let remaining = qty;
  for (const b of usable) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    allocations.push({ batch: b, quantity: take });
    remaining -= take;
  }
  return { allocations, shortfall: Math.max(remaining, 0) };
}

/** Builds per-medicine inventory rows with batch balances, expiry and reorder status. */
export function buildInventory({ medicines, batches, movements, settings }, todayISO) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const balances = batchBalances(movements);
  const batchToMedicine = new Map(batches.map((b) => [b.id, b.medicine_id]));
  const movesByMedicine = new Map();
  for (const mv of movements) {
    const mid = batchToMedicine.get(mv.batch_id);
    if (!movesByMedicine.has(mid)) movesByMedicine.set(mid, []);
    movesByMedicine.get(mid).push(mv);
  }
  const batchesByMedicine = new Map();
  for (const b of batches) {
    const quantity = balances.get(b.id) || 0;
    const status = expiryStatus(b.expiry_date, todayISO, s.expiry_window_days);
    const row = {
      ...b,
      quantity,
      status,
      daysToExpiry: b.expiry_date ? daysBetween(todayISO, b.expiry_date) : null,
      exposure: quantity > 0 ? quantity * Number(b.purchase_price || 0) : 0,
    };
    if (!batchesByMedicine.has(b.medicine_id)) batchesByMedicine.set(b.medicine_id, []);
    batchesByMedicine.get(b.medicine_id).push(row);
  }

  return medicines.map((m) => {
    const mBatches = (batchesByMedicine.get(m.id) || []).sort((a, b) =>
      String(a.expiry_date).localeCompare(String(b.expiry_date)),
    );
    const available = mBatches.filter((b) => b.status !== 'expired').reduce((t, b) => t + Math.max(b.quantity, 0), 0);
    const expiredQty = mBatches.filter((b) => b.status === 'expired').reduce((t, b) => t + Math.max(b.quantity, 0), 0);
    const moves = movesByMedicine.get(m.id) || [];
    const avgDaily = averageDailyDemand(moves, todayISO, s.lookback_days);
    const leadTimeDays = m.lead_time_days ?? s.default_lead_time_days;
    const plan = reorderPlan({
      stock: available,
      avgDaily,
      leadTimeDays,
      safetyStock: Number(m.safety_stock || 0),
      minStock: Number(m.min_stock || 0),
      coverDays: s.cover_days,
    });
    const lastPrice = [...mBatches].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
      ?.purchase_price;
    return {
      medicine: m,
      batches: mBatches,
      movements: moves,
      available,
      expiredQty,
      avgDaily,
      leadTimeDays,
      lastPrice: lastPrice != null ? Number(lastPrice) : null,
      nearExpiryBatches: mBatches.filter((b) => b.status === 'near' && b.quantity > 0),
      expiredBatches: mBatches.filter((b) => b.status === 'expired' && b.quantity > 0),
      negativeBatches: mBatches.filter((b) => b.quantity < 0),
      ...plan,
    };
  });
}

export function buildDashboard(inventory) {
  const nearExpiry = inventory.flatMap((r) => r.nearExpiryBatches.map((b) => ({ row: r, batch: b })));
  const expired = inventory.flatMap((r) => r.expiredBatches.map((b) => ({ row: r, batch: b })));
  const lowStock = inventory.filter((r) => r.needsReorder);
  const missingPrice = inventory.flatMap((r) =>
    r.batches.filter((b) => b.quantity > 0 && !(Number(b.purchase_price) > 0)).map((b) => ({ row: r, batch: b })),
  );
  const negative = inventory.flatMap((r) => r.negativeBatches.map((b) => ({ row: r, batch: b })));

  const actions = [
    ...expired.map(({ row, batch }) => ({
      level: 'danger',
      medicineId: row.medicine.id,
      text: `${label(row.medicine)} batch ${batch.batch_number} has EXPIRED with ${batch.quantity} in stock — remove from sale.`,
    })),
    ...negative.map(({ row, batch }) => ({
      level: 'danger',
      medicineId: row.medicine.id,
      text: `${label(row.medicine)} batch ${batch.batch_number} shows negative stock (${batch.quantity}) — check records.`,
    })),
    ...lowStock
      .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
      .map((r) => ({
        level: 'warning',
        medicineId: r.medicine.id,
        text: `${label(r.medicine)}: ${r.available} left${r.daysLeft != null ? ` (~${r.daysLeft.toFixed(1)} days)` : ''}, reorder point ${r.reorderPoint}. Suggest ordering ${r.suggestedQty}.`,
      })),
    ...nearExpiry
      .sort((a, b) => a.batch.daysToExpiry - b.batch.daysToExpiry)
      .map(({ row, batch }) => ({
        level: 'info',
        medicineId: row.medicine.id,
        text: `${label(row.medicine)} batch ${batch.batch_number} expires in ${batch.daysToExpiry} days (${batch.quantity} units, cost exposure ₹${batch.exposure.toFixed(0)}).`,
      })),
    ...missingPrice.map(({ row, batch }) => ({
      level: 'muted',
      medicineId: row.medicine.id,
      text: `${label(row.medicine)} batch ${batch.batch_number} has no purchase price — expiry exposure can't be estimated.`,
    })),
  ];

  return {
    products: inventory.length,
    lowStock: lowStock.length,
    nearExpiry: nearExpiry.length,
    expired: expired.length,
    suggestedOrders: lowStock.filter((r) => r.suggestedQty > 0).length,
    nearExpiryExposure: nearExpiry.reduce((t, x) => t + x.batch.exposure, 0),
    expiredExposure: expired.reduce((t, x) => t + x.batch.exposure, 0),
    actions,
  };
}

export function label(m) {
  return [m.name, m.strength].filter(Boolean).join(' ');
}

export function medicineKey(name, strength) {
  const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${norm(name)}|${norm(strength)}`;
}
