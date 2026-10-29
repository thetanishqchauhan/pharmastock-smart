import { DEFAULT_SETTINGS } from '../lib/inventory.js';
import { generateSampleData } from '../lib/sampleData.js';
import { todayISO } from '../lib/dates.js';

const KEY = 'pharmastock-demo-v1';
const empty = () => ({ medicines: [], batches: [], movements: [], settings: { ...DEFAULT_SETTINGS } });
const now = () => new Date().toISOString();

function read() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return empty();
  }
}
function write(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

/** Browser-only store for demos and development. Data never leaves this browser. */
export const localStore = {
  mode: 'demo',
  newId: () => crypto.randomUUID(),

  async load() {
    return { pharmacy: { name: 'Demo Pharmacy' }, ...read() };
  },
  async insertMedicines(rows) {
    const db = read();
    db.medicines.push(...rows.map((r) => ({ created_at: now(), ...r })));
    write(db);
  },
  async updateMedicine(row) {
    const db = read();
    db.medicines = db.medicines.map((m) => (m.id === row.id ? { ...m, ...row } : m));
    write(db);
  },
  async insertBatches(rows) {
    const db = read();
    db.batches.push(...rows.map((r) => ({ created_at: now(), ...r })));
    write(db);
  },
  async insertMovements(rows) {
    const db = read();
    const balances = new Map();
    for (const mv of [...db.movements, ...rows]) {
      balances.set(mv.batch_id, (balances.get(mv.batch_id) || 0) + Number(mv.quantity));
    }
    for (const [batchId, qty] of balances) {
      if (qty < 0 && rows.some((r) => r.batch_id === batchId)) throw new Error('This would make batch stock negative.');
    }
    db.movements.push(...rows.map((r) => ({ occurred_at: now(), created_at: now(), ...r })));
    write(db);
  },
  async saveSettings(settings) {
    const db = read();
    db.settings = { ...db.settings, ...settings };
    write(db);
  },
  async loadSample() {
    const db = read();
    write({ ...db, ...generateSampleData(todayISO(), this.newId) });
  },
  async reset() {
    write(empty());
  },
};
