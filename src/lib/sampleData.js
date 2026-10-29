import { addDays } from './dates.js';

// Fictional demo data only — not real stock, prices or product recommendations.
const PRODUCTS = [
  ['Paracetamol', '500 mg', 'Tablet', 'Demo Pharma', 6, 22, 0.4],
  ['Paracetamol', '650 mg', 'Tablet', 'Demo Pharma', 4, 30, 0.6],
  ['Cetirizine', '10 mg', 'Tablet', 'Sample Labs', 3, 18, 0.3],
  ['Amoxicillin', '500 mg', 'Capsule', 'Sample Labs', 2, 75, 0.5],
  ['Azithromycin', '500 mg', 'Tablet', 'Example Healthcare', 1.5, 95, 0.2],
  ['Pantoprazole', '40 mg', 'Tablet', 'Example Healthcare', 4, 45, 0.5],
  ['Metformin', '500 mg', 'Tablet', 'Demo Pharma', 5, 20, 0.7],
  ['Amlodipine', '5 mg', 'Tablet', 'Sample Labs', 3, 25, 0.6],
  ['Atorvastatin', '10 mg', 'Tablet', 'Example Healthcare', 2.5, 60, 0.5],
  ['Ibuprofen', '400 mg', 'Tablet', 'Demo Pharma', 3, 15, 0.4],
  ['ORS Powder', '21 g', 'Sachet', 'Sample Labs', 6, 18, 0.3],
  ['Cough Syrup (demo)', '100 ml', 'Syrup', 'Example Healthcare', 2, 85, 0.2],
  ['Vitamin C', '500 mg', 'Tablet', 'Demo Pharma', 1, 30, 0.1],
  ['Calcium + D3', '500 mg', 'Tablet', 'Sample Labs', 1.5, 90, 0.2],
  ['Domperidone', '10 mg', 'Tablet', 'Example Healthcare', 1, 28, 0.15],
  ['Montelukast', '10 mg', 'Tablet', 'Demo Pharma', 1.2, 110, 0.25],
  ['Insulin Pen (demo)', '3 ml', 'Injection', 'Sample Labs', 0.3, 420, 0.1],
  ['Antiseptic Liquid', '100 ml', 'Liquid', 'Example Healthcare', 0.8, 55, 0.1],
];

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function generateSampleData(todayISO, newId) {
  const rand = rng(42);
  const medicines = [];
  const batches = [];
  const movements = [];
  const start = addDays(todayISO, -60);

  PRODUCTS.forEach(([name, strength, form, mfr, dailyRate, price, nearExpiryChance], i) => {
    const mid = newId();
    medicines.push({
      id: mid,
      name,
      strength,
      dosage_form: form,
      manufacturer: mfr,
      unit: form === 'Tablet' || form === 'Capsule' ? 'strip' : 'unit',
      min_stock: Math.ceil(dailyRate * 2),
      safety_stock: Math.ceil(dailyRate * 1.5),
      lead_time_days: i % 3 === 0 ? 5 : 3,
      created_at: start,
    });

    const batchCount = 1 + (i % 3 === 0 ? 1 : 0) + (rand() < nearExpiryChance ? 1 : 0);
    const mBatches = [];
    for (let b = 0; b < batchCount; b++) {
      let expiryOffset = 200 + Math.floor(rand() * 500);
      if (b === batchCount - 1 && batchCount > 1 && rand() < 0.7) expiryOffset = 10 + Math.floor(rand() * 70);
      if (i === 15 && b === 0) expiryOffset = -5;
      const bid = newId();
      const batch = {
        id: bid,
        medicine_id: mid,
        batch_number: `DM${String(i + 1).padStart(2, '0')}${String.fromCharCode(65 + b)}${100 + Math.floor(rand() * 900)}`,
        expiry_date: addDays(todayISO, expiryOffset),
        purchase_price: Math.round(price * (0.95 + rand() * 0.1)),
        mrp: Math.round(price * 1.25),
        created_at: addDays(start, b),
      };
      batches.push(batch);
      const qty = Math.ceil(dailyRate * (35 + rand() * 40));
      mBatches.push({ ...batch, quantity: qty, holdFromSales: (i === 15 && b === 0) || expiryOffset < 90 });
      movements.push({
        id: newId(),
        batch_id: bid,
        type: 'purchase',
        quantity: qty,
        reason: null,
        reference: `INV-DEMO-${100 + i}${b}`,
        occurred_at: `${addDays(start, b)}T12:00:00.000Z`,
      });
    }

    for (let d = 59; d >= 0; d--) {
      const day = addDays(todayISO, -d);
      let sold = Math.round(dailyRate * (0.4 + rand() * 1.2));
      const usable = mBatches
        .filter((b) => b.quantity > 0 && b.expiry_date >= day && !b.holdFromSales)
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      for (const b of usable) {
        if (sold <= 0) break;
        const take = Math.min(sold, b.quantity);
        b.quantity -= take;
        sold -= take;
        movements.push({ id: newId(), batch_id: b.id, type: 'sale', quantity: -take, reason: null, reference: null, occurred_at: `${day}T12:00:00.000Z` });
      }
    }
  });

  return { medicines, batches, movements };
}
