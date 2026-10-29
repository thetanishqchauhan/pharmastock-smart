import { useState } from 'react';
import { label } from '../lib/inventory.js';
import { downloadCSV, inr } from '../lib/csv.js';
import { Empty } from '../components/ui.jsx';

export default function Reorder({ inventory, settings, openMedicine, today }) {
  const rows = inventory
    .filter((r) => r.needsReorder)
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  const [qty, setQty] = useState({});
  const [excluded, setExcluded] = useState({});
  const orderQty = (r) => (qty[r.medicine.id] ?? r.suggestedQty);
  const selected = rows.filter((r) => !excluded[r.medicine.id] && Number(orderQty(r)) > 0);
  const estCost = selected.reduce((t, r) => t + Number(orderQty(r)) * (r.lastPrice || 0), 0);

  const exportList = () =>
    downloadCSV(`draft-purchase-list-${today}.csv`, selected, [
      { header: 'Medicine', value: (r) => r.medicine.name },
      { header: 'Strength', value: (r) => r.medicine.strength },
      { header: 'Manufacturer', value: (r) => r.medicine.manufacturer },
      { header: 'Unit', value: (r) => r.medicine.unit },
      { header: 'Current stock', value: 'available' },
      { header: 'Avg daily sales', value: (r) => r.avgDaily.toFixed(2) },
      { header: 'Reorder point', value: 'reorderPoint' },
      { header: 'Order quantity', value: (r) => orderQty(r) },
      { header: 'Last purchase price', value: 'lastPrice' },
    ]);

  return (
    <>
      <div className="row between">
        <h1>Reorder suggestions</h1>
        <button className="primary" onClick={exportList} disabled={!selected.length}>Export draft purchase list</button>
      </div>
      <p className="note">
        Reorder point = (avg. daily sales over last {settings.lookback_days} days × lead time) + safety stock, and never below the
        minimum stock. Suggested qty covers lead time + {settings.cover_days} days. These are estimates — review and edit
        quantities before ordering. Nothing is ordered automatically.
      </p>
      {rows.length === 0 ? (
        <Empty>No products are at or below their reorder point.</Empty>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th></th><th>Medicine</th><th className="num">Stock</th><th className="num">Avg/day</th><th className="num">Days left</th>
                <th className="num">Lead time</th><th className="num">Reorder pt</th><th className="num">Order qty</th><th className="num">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.medicine.id}>
                  <td><input type="checkbox" checked={!excluded[r.medicine.id]} onChange={(e) => setExcluded({ ...excluded, [r.medicine.id]: !e.target.checked })} /></td>
                  <td className="clickable" onClick={() => openMedicine(r.medicine.id)}><b>{label(r.medicine)}</b></td>
                  <td className="num">{r.available}</td>
                  <td className="num">{r.avgDaily.toFixed(1)}</td>
                  <td className="num">{r.daysLeft == null ? '—' : r.daysLeft.toFixed(1)}</td>
                  <td className="num">{r.leadTimeDays} d</td>
                  <td className="num">{r.reorderPoint}</td>
                  <td className="num">
                    <input className="qty" type="number" min="0" step="1" value={orderQty(r)} onChange={(e) => setQty({ ...qty, [r.medicine.id]: e.target.value })} />
                  </td>
                  <td className="num">{r.lastPrice ? inr(Number(orderQty(r)) * r.lastPrice) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Selected: <b>{selected.length}</b> items · estimated cost <b>{inr(estCost)}</b> (based on last purchase price)</p>
        </>
      )}
    </>
  );
}
