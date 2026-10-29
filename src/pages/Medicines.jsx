import { useState } from 'react';
import { label, medicineKey } from '../lib/inventory.js';
import { downloadCSV } from '../lib/csv.js';
import { Empty, Field } from '../components/ui.jsx';

export const blankMedicine = {
  name: '',
  strength: '',
  dosage_form: '',
  manufacturer: '',
  unit: 'strip',
  min_stock: 0,
  safety_stock: 0,
  lead_time_days: '',
};

export function MedicineForm({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid">
      <Field label="Name *"><input value={value.name} onChange={set('name')} required /></Field>
      <Field label="Strength"><input value={value.strength || ''} onChange={set('strength')} placeholder="500 mg" /></Field>
      <Field label="Dosage form"><input value={value.dosage_form || ''} onChange={set('dosage_form')} placeholder="Tablet" /></Field>
      <Field label="Manufacturer / brand"><input value={value.manufacturer || ''} onChange={set('manufacturer')} /></Field>
      <Field label="Unit"><input value={value.unit || ''} onChange={set('unit')} placeholder="strip" /></Field>
      <Field label="Minimum stock" hint="Flag when stock falls below this">
        <input type="number" min="0" value={value.min_stock} onChange={set('min_stock')} />
      </Field>
      <Field label="Safety stock" hint="Extra buffer in the reorder point">
        <input type="number" min="0" value={value.safety_stock} onChange={set('safety_stock')} />
      </Field>
      <Field label="Supplier lead time (days)" hint="Blank = use default from Settings">
        <input type="number" min="0" value={value.lead_time_days ?? ''} onChange={set('lead_time_days')} />
      </Field>
    </div>
  );
}

export function cleanMedicine(v) {
  const int = (x) => (x === '' || x == null ? 0 : Math.max(0, parseInt(x, 10) || 0));
  if (!String(v.name).trim()) throw new Error('Medicine name is required');
  return {
    ...v,
    name: v.name.trim(),
    strength: v.strength?.trim() || null,
    dosage_form: v.dosage_form?.trim() || null,
    manufacturer: v.manufacturer?.trim() || null,
    unit: v.unit?.trim() || 'unit',
    min_stock: int(v.min_stock),
    safety_stock: int(v.safety_stock),
    lead_time_days: v.lead_time_days === '' || v.lead_time_days == null ? null : int(v.lead_time_days),
  };
}

export default function Medicines({ inventory, data, store, run, openMedicine }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankMedicine);

  const term = q.trim().toLowerCase();
  const rows = inventory
    .filter(
      (r) =>
        !term ||
        [r.medicine.name, r.medicine.strength, r.medicine.manufacturer, r.medicine.dosage_form, ...r.batches.map((b) => b.batch_number)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
    )
    .sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));

  const save = async () => {
    const ok = await run(async () => {
      const m = cleanMedicine(form);
      if (data.medicines.some((x) => medicineKey(x.name, x.strength) === medicineKey(m.name, m.strength))) {
        throw new Error('A medicine with this name and strength already exists');
      }
      await store.insertMedicines([{ ...m, id: store.newId() }]);
    }, 'Medicine added.');
    if (ok) {
      setForm(blankMedicine);
      setAdding(false);
    }
  };

  const exportStock = () =>
    downloadCSV(
      'stock-by-batch.csv',
      inventory.flatMap((r) => r.batches.filter((b) => b.quantity !== 0).map((b) => ({ ...b, m: r.medicine }))),
      [
        { header: 'Medicine', value: (b) => b.m.name },
        { header: 'Strength', value: (b) => b.m.strength },
        { header: 'Manufacturer', value: (b) => b.m.manufacturer },
        { header: 'Batch', value: 'batch_number' },
        { header: 'Expiry', value: 'expiry_date' },
        { header: 'Quantity', value: 'quantity' },
        { header: 'Purchase price', value: 'purchase_price' },
        { header: 'Status', value: 'status' },
      ],
    );

  return (
    <>
      <div className="row between">
        <h1>Medicines</h1>
        <div>
          <button onClick={exportStock}>Export stock CSV</button>{' '}
          <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add medicine'}</button>
        </div>
      </div>

      {adding && (
        <div className="panel">
          <MedicineForm value={form} onChange={setForm} />
          <button className="primary" onClick={save}>Save medicine</button>
        </div>
      )}

      <input className="search" placeholder="Search by name, brand, manufacturer or batch…" value={q} onChange={(e) => setQ(e.target.value)} />

      {rows.length === 0 ? (
        <Empty>No medicines found.</Empty>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Form</th>
              <th>Manufacturer</th>
              <th className="num">Available</th>
              <th className="num">Batches</th>
              <th>Alerts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.medicine.id} className="clickable" onClick={() => openMedicine(r.medicine.id)}>
                <td><b>{label(r.medicine)}</b></td>
                <td>{r.medicine.dosage_form}</td>
                <td>{r.medicine.manufacturer}</td>
                <td className="num">{r.available} <small>{r.medicine.unit}</small></td>
                <td className="num">{r.batches.filter((b) => b.quantity > 0).length}</td>
                <td>
                  {r.needsReorder && <span className="badge warning">Low stock</span>}{' '}
                  {r.nearExpiryBatches.length > 0 && <span className="badge warning">Near expiry</span>}{' '}
                  {r.expiredBatches.length > 0 && <span className="badge danger">Expired stock</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
