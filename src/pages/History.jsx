import { useState } from 'react';
import { MOVEMENT_TYPES, label } from '../lib/inventory.js';
import { downloadCSV } from '../lib/csv.js';
import { MovementTable } from './MedicineDetail.jsx';

export default function History({ data }) {
  const [type, setType] = useState('');
  const batchById = new Map(data.batches.map((b) => [b.id, b]));
  const medById = new Map(data.medicines.map((m) => [m.id, m]));
  const medOf = (mv) => medById.get(batchById.get(mv.batch_id)?.medicine_id);
  const list = data.movements.filter((mv) => !type || mv.type === type);

  const exportCSV = () =>
    downloadCSV('stock-movements.csv', list, [
      { header: 'Date', value: 'occurred_at' },
      { header: 'Medicine', value: (mv) => (medOf(mv) ? label(medOf(mv)) : '') },
      { header: 'Batch', value: (mv) => batchById.get(mv.batch_id)?.batch_number },
      { header: 'Type', value: (mv) => MOVEMENT_TYPES[mv.type]?.label || mv.type },
      { header: 'Quantity', value: 'quantity' },
      { header: 'Reason', value: 'reason' },
      { header: 'Reference', value: 'reference' },
    ]);

  return (
    <>
      <div className="row between">
        <h1>Stock movement history</h1>
        <button onClick={exportCSV} disabled={!list.length}>Export CSV</button>
      </div>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">All types</option>
        {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <p className="note">Every change is recorded here — balances are never silently overwritten. Showing latest 300.</p>
      <MovementTable movements={list} batches={data.batches} medicineLabel={(mv) => (medOf(mv) ? label(medOf(mv)) : '')} />
    </>
  );
}
