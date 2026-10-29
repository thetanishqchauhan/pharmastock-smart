import { useState } from 'react';
import { MOVEMENT_TYPES, fefoAllocate, label, validateMovement } from '../lib/inventory.js';
import { formatDate, parseDate } from '../lib/dates.js';
import { inr } from '../lib/csv.js';
import { Empty, Field, StatusBadge } from '../components/ui.jsx';
import { MedicineForm, cleanMedicine } from './Medicines.jsx';

const occurredAt = (date, today) => (date === today ? new Date() : new Date(`${date}T12:00:00`)).toISOString();

export default function MedicineDetail({ inventory, medicineId, store, run, today, go }) {
  const row = inventory.find((r) => r.medicine.id === medicineId);
  const [tab, setTab] = useState('in');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  if (!row) return <Empty>Medicine not found. <button onClick={() => go('medicines')}>Back</button></Empty>;
  const m = row.medicine;

  const saveDetails = async () => {
    if (await run(() => store.updateMedicine({ id: m.id, ...cleanMedicine(form) }), 'Details saved.')) setEditing(false);
  };

  return (
    <>
      <button className="link" onClick={() => go('medicines')}>← All medicines</button>
      <div className="row between">
        <h1>{label(m)} <small>{[m.dosage_form, m.manufacturer].filter(Boolean).join(' · ')}</small></h1>
        <button
          onClick={() => {
            setForm({ ...m, lead_time_days: m.lead_time_days ?? '' });
            setEditing(!editing);
          }}
        >
          {editing ? 'Cancel' : 'Edit details'}
        </button>
      </div>

      {editing && form && (
        <div className="panel">
          <MedicineForm value={form} onChange={setForm} />
          <button className="primary" onClick={saveDetails}>Save</button>
        </div>
      )}

      <div className="stats">
        <div><span>Available (non-expired)</span><b>{row.available} {m.unit}</b></div>
        <div><span>Avg. daily sales</span><b>{row.avgDaily.toFixed(2)}</b></div>
        <div><span>Est. days of stock</span><b>{row.daysLeft == null ? '—' : row.daysLeft.toFixed(1)}</b></div>
        <div><span>Reorder point</span><b>{row.reorderPoint}</b></div>
        <div><span>Lead time</span><b>{row.leadTimeDays} d</b></div>
        <div className={row.needsReorder ? 'warn' : ''}><span>Suggested order</span><b>{row.suggestedQty || '—'}</b></div>
      </div>

      <div className="tabs">
        {[['in', 'Stock in'], ['out', 'Stock out'], ['adjust', 'Correction']].map(([id, text]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{text}</button>
        ))}
      </div>
      <div className="panel">
        {tab === 'in' && <StockIn row={row} store={store} run={run} today={today} />}
        {tab === 'out' && <StockOut row={row} store={store} run={run} today={today} />}
        {tab === 'adjust' && <Correction row={row} store={store} run={run} today={today} />}
      </div>

      <h2>Batches</h2>
      {row.batches.length === 0 ? (
        <Empty>No batches yet — use Stock in.</Empty>
      ) : (
        <table>
          <thead>
            <tr><th>Batch</th><th>Expiry</th><th>Status</th><th className="num">Qty</th><th className="num">Purchase price</th><th className="num">Cost exposure</th></tr>
          </thead>
          <tbody>
            {row.batches.map((b) => (
              <tr key={b.id} className={b.quantity === 0 ? 'faded' : ''}>
                <td>{b.batch_number}</td>
                <td>{formatDate(b.expiry_date)} <small>({b.daysToExpiry} d)</small></td>
                <td><StatusBadge status={b.status} /></td>
                <td className="num">{b.quantity}</td>
                <td className="num">{b.purchase_price != null ? inr(b.purchase_price) : '—'}</td>
                <td className="num">{inr(b.exposure)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Movement history</h2>
      <MovementTable movements={row.movements} batches={row.batches} />
    </>
  );
}

export function MovementTable({ movements, batches, medicineLabel }) {
  const byId = new Map(batches.map((b) => [b.id, b]));
  const list = [...movements].sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  if (!list.length) return <Empty>No stock movements recorded.</Empty>;
  return (
    <table>
      <thead>
        <tr><th>Date</th>{medicineLabel && <th>Medicine</th>}<th>Batch</th><th>Type</th><th className="num">Qty</th><th>Reason / reference</th></tr>
      </thead>
      <tbody>
        {list.slice(0, 300).map((mv) => (
          <tr key={mv.id}>
            <td>{new Date(mv.occurred_at).toLocaleDateString('en-IN')}</td>
            {medicineLabel && <td>{medicineLabel(mv)}</td>}
            <td>{byId.get(mv.batch_id)?.batch_number}</td>
            <td>{MOVEMENT_TYPES[mv.type]?.label || mv.type}</td>
            <td className={`num ${mv.quantity < 0 ? 'neg' : 'pos'}`}>{mv.quantity > 0 ? `+${mv.quantity}` : mv.quantity}</td>
            <td>{[mv.reason, mv.reference].filter(Boolean).join(' · ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StockIn({ row, store, run, today }) {
  const blank = { batch_number: '', expiry_date: '', quantity: '', purchase_price: '', mrp: '', reference: '', date: today };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const existing = row.batches.find((b) => b.batch_number.trim().toLowerCase() === f.batch_number.trim().toLowerCase());

  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(async () => {
      const qty = Number(f.quantity);
      const expiry = existing ? existing.expiry_date : parseDate(f.expiry_date);
      if (!f.batch_number.trim()) throw new Error('Batch number is required');
      if (!expiry) throw new Error('A valid expiry date is required');
      if (!Number.isInteger(qty) || qty <= 0) throw new Error('Quantity must be a positive whole number');
      const price = f.purchase_price === '' ? null : Number(f.purchase_price);
      if (price != null && !(price >= 0)) throw new Error('Purchase price is invalid');
      let batchId = existing?.id;
      if (!batchId) {
        batchId = store.newId();
        await store.insertBatches([
          {
            id: batchId,
            medicine_id: row.medicine.id,
            batch_number: f.batch_number.trim(),
            expiry_date: expiry,
            purchase_price: price,
            mrp: f.mrp === '' ? null : Number(f.mrp),
          },
        ]);
      }
      await store.insertMovements([
        { id: store.newId(), batch_id: batchId, type: 'purchase', quantity: qty, reason: null, reference: f.reference || null, occurred_at: occurredAt(f.date, today) },
      ]);
    }, 'Stock received.');
    if (ok) setF(blank);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid">
        <Field label="Batch number *" hint={existing ? `Existing batch — expiry ${formatDate(existing.expiry_date)} will be used` : 'New batch'}>
          <input value={f.batch_number} onChange={set('batch_number')} list="batch-list" />
          <datalist id="batch-list">{row.batches.map((b) => <option key={b.id} value={b.batch_number} />)}</datalist>
        </Field>
        {!existing && <Field label="Expiry date *"><input type="date" value={f.expiry_date} onChange={set('expiry_date')} /></Field>}
        <Field label={`Quantity (${row.medicine.unit}) *`}><input type="number" min="1" step="1" value={f.quantity} onChange={set('quantity')} /></Field>
        {!existing && <Field label="Purchase price / unit (₹)"><input type="number" min="0" step="0.01" value={f.purchase_price} onChange={set('purchase_price')} /></Field>}
        {!existing && <Field label="MRP (₹)"><input type="number" min="0" step="0.01" value={f.mrp} onChange={set('mrp')} /></Field>}
        <Field label="Supplier / invoice ref."><input value={f.reference} onChange={set('reference')} /></Field>
        <Field label="Date"><input type="date" value={f.date} max={today} onChange={set('date')} /></Field>
      </div>
      <button className="primary">Record stock in</button>
    </form>
  );
}

function StockOut({ row, store, run, today }) {
  const blank = { type: 'sale', quantity: '', batch_id: '', reference: '', reason: '', date: today };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const qty = Number(f.quantity) || 0;
  const plan = f.type === 'sale' && qty > 0 ? fefoAllocate(row.batches, qty, today) : null;
  const choosable = row.batches.filter((b) => b.quantity > 0);

  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(async () => {
      if (!Number.isInteger(qty) || qty <= 0) throw new Error('Quantity must be a positive whole number');
      let parts;
      if (f.type === 'sale') {
        if (plan.shortfall > 0) throw new Error(`Only ${qty - plan.shortfall} non-expired units available`);
        parts = plan.allocations.map((a) => ({ batch_id: a.batch.id, quantity: a.quantity }));
      } else {
        const b = row.batches.find((x) => x.id === f.batch_id);
        if (!b) throw new Error('Choose a batch');
        if (qty > b.quantity) throw new Error(`Batch ${b.batch_number} has only ${b.quantity}`);
        parts = [{ batch_id: b.id, quantity: qty }];
      }
      const movements = parts.map((p) => ({
        id: store.newId(),
        batch_id: p.batch_id,
        type: f.type,
        quantity: -p.quantity,
        reason: f.reason || null,
        reference: f.reference || null,
        occurred_at: occurredAt(f.date, today),
      }));
      movements.forEach((mv) => {
        const err = validateMovement(mv);
        if (err) throw new Error(err);
      });
      await store.insertMovements(movements);
    }, 'Stock out recorded.');
    if (ok) setF(blank);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid">
        <Field label="Type">
          <select value={f.type} onChange={set('type')}>
            {['sale', 'supplier_return', 'expired_removal', 'damage'].map((t) => <option key={t} value={t}>{MOVEMENT_TYPES[t].label}</option>)}
          </select>
        </Field>
        <Field label={`Quantity (${row.medicine.unit}) *`}><input type="number" min="1" step="1" value={f.quantity} onChange={set('quantity')} /></Field>
        {f.type !== 'sale' && (
          <Field label="Batch *">
            <select value={f.batch_id} onChange={set('batch_id')}>
              <option value="">Choose…</option>
              {choosable.map((b) => (
                <option key={b.id} value={b.id}>{b.batch_number} · exp {formatDate(b.expiry_date)} · {b.quantity} left{b.status === 'expired' ? ' · EXPIRED' : ''}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Reference"><input value={f.reference} onChange={set('reference')} placeholder="Bill no. (optional)" /></Field>
        {f.type !== 'sale' && <Field label="Note"><input value={f.reason} onChange={set('reason')} /></Field>}
        <Field label="Date"><input type="date" value={f.date} max={today} onChange={set('date')} /></Field>
      </div>
      {plan && (
        <p className="note">
          FEFO guidance (first expiry, first out):{' '}
          {plan.allocations.map((a) => `${a.quantity} from ${a.batch.batch_number} (exp ${formatDate(a.batch.expiry_date)})`).join(', ') || 'no usable stock'}
          {plan.shortfall > 0 && <b className="neg"> — short by {plan.shortfall}</b>}. Expired batches are never used for sales.
        </p>
      )}
      <button className="primary">Record stock out</button>
    </form>
  );
}

function Correction({ row, store, run, today }) {
  const [f, setF] = useState({ batch_id: '', counted: '', reason: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const batch = row.batches.find((b) => b.id === f.batch_id);

  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(async () => {
      if (!batch) throw new Error('Choose a batch');
      const counted = Number(f.counted);
      if (!Number.isInteger(counted) || counted < 0) throw new Error('Counted quantity must be a whole number ≥ 0');
      if (!f.reason.trim()) throw new Error('A reason is required for every correction');
      const delta = counted - batch.quantity;
      if (delta === 0) throw new Error('Counted quantity matches the system — nothing to correct');
      await store.insertMovements([
        { id: store.newId(), batch_id: batch.id, type: 'adjustment', quantity: delta, reason: f.reason.trim(), reference: null, occurred_at: occurredAt(today, today) },
      ]);
    }, 'Correction recorded with history.');
    if (ok) setF({ batch_id: '', counted: '', reason: '' });
  };

  return (
    <form onSubmit={submit}>
      <div className="grid">
        <Field label="Batch *">
          <select value={f.batch_id} onChange={set('batch_id')}>
            <option value="">Choose…</option>
            {row.batches.map((b) => <option key={b.id} value={b.id}>{b.batch_number} · system qty {b.quantity}</option>)}
          </select>
        </Field>
        <Field label="Physically counted qty *"><input type="number" min="0" step="1" value={f.counted} onChange={set('counted')} /></Field>
        <Field label="Reason *"><input value={f.reason} onChange={set('reason')} placeholder="e.g. Monthly stock count" /></Field>
      </div>
      {batch && f.counted !== '' && <p className="note">Change: {Number(f.counted) - batch.quantity > 0 ? '+' : ''}{Number(f.counted) - batch.quantity}. The previous quantity stays in history.</p>}
      <button className="primary">Record correction</button>
    </form>
  );
}
