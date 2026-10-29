import { useCallback, useEffect, useMemo, useState } from 'react';
import { store } from './store/index.js';
import { buildInventory, DEFAULT_SETTINGS } from './lib/inventory.js';
import { todayISO } from './lib/dates.js';
import Dashboard from './pages/Dashboard.jsx';
import Medicines from './pages/Medicines.jsx';
import MedicineDetail from './pages/MedicineDetail.jsx';
import Expiry from './pages/Expiry.jsx';
import Reorder from './pages/Reorder.jsx';
import Import from './pages/Import.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import { Login, CreatePharmacy } from './pages/Auth.jsx';

const NAV = [
  ['dashboard', 'Dashboard'],
  ['medicines', 'Medicines'],
  ['expiry', 'Expiry'],
  ['reorder', 'Reorder'],
  ['import', 'Import CSV'],
  ['history', 'History'],
  ['settings', 'Settings'],
];

export default function App() {
  const [session, setSession] = useState(store.mode === 'demo' ? 'demo' : undefined);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState('dashboard');
  const [medicineId, setMedicineId] = useState(null);
  const today = todayISO();

  const reload = useCallback(async () => {
    try {
      setData(await store.load());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (store.mode !== 'supabase') return;
    store.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = store.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) reload();
    else setData(null);
  }, [session, reload]);

  const settings = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) };
  const inventory = useMemo(
    () => (data?.pharmacy ? buildInventory({ ...data, settings }, today) : []),
    [data, today],
  );

  const run = async (fn, successMessage) => {
    setError('');
    try {
      await fn();
      await reload();
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (e) {
      setError(e.message || String(e));
      return false;
    }
  };

  if (store.mode === 'supabase' && session === undefined) return <div className="center">Loading…</div>;
  if (!session) return <Login />;
  if (!data) return <div className="center">{error || 'Loading inventory…'}</div>;
  if (!data.pharmacy) return <CreatePharmacy onDone={reload} />;

  const go = (p, { keepNotice = false } = {}) => {
    setPage(p);
    if (!keepNotice) setNotice('');
    setError('');
  };
  const ctx = {
    data,
    inventory,
    settings,
    today,
    run,
    store,
    go,
    openMedicine: (id) => {
      setMedicineId(id);
      go('medicine');
    },
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          💊 PharmaStock <b>Smart</b>
          <small>{data.pharmacy.name}</small>
        </div>
        <nav>
          {NAV.map(([id, text]) => (
            <button key={id} className={page === id || (page === 'medicine' && id === 'medicines') ? 'active' : ''} onClick={() => go(id)}>
              {text}
            </button>
          ))}
        </nav>
        {store.mode === 'demo' && <div className="demo-tag">Demo mode · data stays in this browser</div>}
      </aside>
      <main>
        {error && (
          <div className="alert danger" onClick={() => setError('')}>
            {error} <span className="dismiss">✕</span>
          </div>
        )}
        {notice && (
          <div className="alert success" onClick={() => setNotice('')}>
            {notice} <span className="dismiss">✕</span>
          </div>
        )}
        {page === 'dashboard' && <Dashboard {...ctx} />}
        {page === 'medicines' && <Medicines {...ctx} />}
        {page === 'medicine' && <MedicineDetail {...ctx} medicineId={medicineId} />}
        {page === 'expiry' && <Expiry {...ctx} />}
        {page === 'reorder' && <Reorder {...ctx} />}
        {page === 'import' && <Import {...ctx} />}
        {page === 'history' && <History {...ctx} />}
        {page === 'settings' && <Settings {...ctx} />}
      </main>
    </div>
  );
}
