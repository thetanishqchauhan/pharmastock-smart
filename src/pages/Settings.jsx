import { useState } from 'react';
import { Field } from '../components/ui.jsx';

export default function Settings({ settings, store, run }) {
  const [f, setF] = useState(settings);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const clean = {};
      for (const [k, [min, max]] of Object.entries({
        expiry_window_days: [1, 730],
        lookback_days: [1, 365],
        cover_days: [0, 180],
        default_lead_time_days: [0, 90],
      })) {
        const v = Number(f[k]);
        if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${k.replace(/_/g, ' ')} must be between ${min} and ${max}`);
        clean[k] = v;
      }
      await store.saveSettings(clean);
    }, 'Settings saved.');
  };

  return (
    <>
      <h1>Settings</h1>
      <form className="panel" onSubmit={save}>
        <div className="grid">
          <Field label="Expiry warning window (days)" hint="Batches expiring within this many days are flagged">
            <input type="number" value={f.expiry_window_days} onChange={set('expiry_window_days')} />
          </Field>
          <Field label="Sales look-back (days)" hint="Period used to calculate average daily sales">
            <input type="number" value={f.lookback_days} onChange={set('lookback_days')} />
          </Field>
          <Field label="Order cover (days)" hint="Extra days of stock a suggested order should cover">
            <input type="number" value={f.cover_days} onChange={set('cover_days')} />
          </Field>
          <Field label="Default supplier lead time (days)" hint="Used when a medicine has no lead time set">
            <input type="number" value={f.default_lead_time_days} onChange={set('default_lead_time_days')} />
          </Field>
        </div>
        <button className="primary">Save settings</button>
      </form>

      {store.mode === 'demo' ? (
        <div className="panel">
          <h2>Demo data</h2>
          <p>You are in demo mode: data is stored only in this browser. Connect Supabase (see README) for login and cloud backup.</p>
          <button onClick={() => run(() => store.loadSample(), 'Fictional sample data loaded.')}>Load fictional sample data</button>{' '}
          <button
            className="danger"
            onClick={() => window.confirm('Delete ALL demo data in this browser?') && run(() => store.reset(), 'Demo data cleared.')}
          >
            Clear all demo data
          </button>
        </div>
      ) : (
        <div className="panel">
          <button onClick={() => store.signOut()}>Sign out</button>
        </div>
      )}
    </>
  );
}
