import { buildDashboard } from '../lib/inventory.js';
import { inr } from '../lib/csv.js';
import { Card, Empty } from '../components/ui.jsx';

export default function Dashboard({ inventory, settings, go, openMedicine, store, run }) {
  const d = buildDashboard(inventory);

  if (!inventory.length) {
    return (
      <>
        <h1>Dashboard</h1>
        <Empty>
          <p>No medicines yet. Start by importing your stock from a CSV/Excel export, or add medicines manually.</p>
          <button className="primary" onClick={() => go('import')}>Import stock CSV</button>{' '}
          <button onClick={() => go('medicines')}>Add a medicine</button>{' '}
          {store.mode === 'demo' && (
            <button onClick={() => run(() => store.loadSample(), 'Fictional sample data loaded.')}>Load sample data</button>
          )}
        </Empty>
      </>
    );
  }

  return (
    <>
      <h1>Dashboard</h1>
      <div className="cards">
        <Card title="Products" value={d.products} onClick={() => go('medicines')} />
        <Card title="Low-stock items" value={d.lowStock} tone={d.lowStock ? 'warning' : ''} onClick={() => go('reorder')} />
        <Card
          title={`Near-expiry batches (≤${settings.expiry_window_days}d)`}
          value={d.nearExpiry}
          sub={`Cost exposure ${inr(d.nearExpiryExposure)}`}
          tone={d.nearExpiry ? 'warning' : ''}
          onClick={() => go('expiry')}
        />
        <Card
          title="Expired batches in stock"
          value={d.expired}
          sub={d.expired ? `Cost exposure ${inr(d.expiredExposure)}` : ''}
          tone={d.expired ? 'danger' : ''}
          onClick={() => go('expiry')}
        />
        <Card title="Suggested orders" value={d.suggestedOrders} onClick={() => go('reorder')} />
      </div>

      <h2>Today's action list</h2>
      {d.actions.length === 0 ? (
        <Empty>Nothing needs attention right now. ✅</Empty>
      ) : (
        <ul className="actions">
          {d.actions.slice(0, 40).map((a, i) => (
            <li key={i} className={a.level} onClick={() => openMedicine(a.medicineId)}>
              {a.text}
            </li>
          ))}
          {d.actions.length > 40 && <li className="muted">…and {d.actions.length - 40} more</li>}
        </ul>
      )}
      <p className="note">
        Exposure is the purchase cost of stock, not a guaranteed loss. Reorder suggestions are estimates based on recorded
        sales — authorised staff should review before purchasing.
      </p>
    </>
  );
}
