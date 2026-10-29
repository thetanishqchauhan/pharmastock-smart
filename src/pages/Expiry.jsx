import { useState } from 'react';
import { label } from '../lib/inventory.js';
import { formatDate } from '../lib/dates.js';
import { downloadCSV, inr } from '../lib/csv.js';
import { Empty, StatusBadge } from '../components/ui.jsx';

export default function Expiry({ inventory, settings, openMedicine }) {
  const [windowDays, setWindowDays] = useState(settings.expiry_window_days);
  const rows = inventory
    .flatMap((r) => r.batches.filter((b) => b.quantity > 0 && b.daysToExpiry <= windowDays).map((b) => ({ ...b, m: r.medicine })))
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  const expired = rows.filter((r) => r.daysToExpiry < 0);
  const total = rows.reduce((t, r) => t + r.exposure, 0);

  const exportCSV = () =>
    downloadCSV(`expiry-report-${windowDays}d.csv`, rows, [
      { header: 'Medicine', value: (r) => label(r.m) },
      { header: 'Manufacturer', value: (r) => r.m.manufacturer },
      { header: 'Batch', value: 'batch_number' },
      { header: 'Expiry', value: 'expiry_date' },
      { header: 'Days to expiry', value: 'daysToExpiry' },
      { header: 'Quantity', value: 'quantity' },
      { header: 'Purchase price', value: 'purchase_price' },
      { header: 'Cost exposure', value: (r) => r.exposure.toFixed(2) },
    ]);

  return (
    <>
      <div className="row between">
        <h1>Expiry report</h1>
        <button onClick={exportCSV} disabled={!rows.length}>Export CSV</button>
      </div>
      <div className="row">
        <span>Show batches expiring within</span>
        {[30, 60, 90, 180].map((d) => (
          <button key={d} className={windowDays === d ? 'active' : ''} onClick={() => setWindowDays(d)}>{d} days</button>
        ))}
      </div>
      <p>
        <b>{rows.length}</b> batches · <b>{expired.length}</b> already expired · total purchase-cost exposure <b>{inr(total)}</b>
      </p>
      {expired.length > 0 && (
        <div className="alert danger">Expired stock must be kept out of sale. Record its removal or supplier return from the medicine page.</div>
      )}
      {rows.length === 0 ? (
        <Empty>No stock expiring in this window.</Empty>
      ) : (
        <table>
          <thead>
            <tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Status</th><th className="num">Days</th><th className="num">Qty</th><th className="num">Exposure</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => openMedicine(r.m.id)}>
                <td>{label(r.m)}</td>
                <td>{r.batch_number}</td>
                <td>{formatDate(r.expiry_date)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="num">{r.daysToExpiry}</td>
                <td className="num">{r.quantity}</td>
                <td className="num">{r.purchase_price != null ? inr(r.exposure) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="note">Exposure = quantity × purchase price. It is not a guaranteed loss — stock may still sell or be returnable under supplier terms.</p>
    </>
  );
}
