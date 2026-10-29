import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS } from '../lib/inventory.js';

const PAGE = 1000;

export function createSupabaseStore(url, anonKey) {
  const sb = createClient(url, anonKey);
  let pharmacyId = null;

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const withPharmacy = (rows) => rows.map((r) => ({ ...r, pharmacy_id: pharmacyId }));

  async function fetchAll(table, order = 'id') {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(await sb.from(table).select('*').eq('pharmacy_id', pharmacyId).order(order).range(from, from + PAGE - 1));
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  return {
    mode: 'supabase',
    newId: () => crypto.randomUUID(),
    auth: sb.auth,

    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password) {
      return check(await sb.auth.signUp({ email, password }));
    },
    async signOut() {
      await sb.auth.signOut();
      pharmacyId = null;
    },
    async getPharmacy() {
      const rows = check(await sb.from('pharmacy_members').select('role, pharmacies(id, name)').limit(1));
      if (!rows.length) return null;
      pharmacyId = rows[0].pharmacies.id;
      return { ...rows[0].pharmacies, role: rows[0].role };
    },
    async createPharmacy(name) {
      pharmacyId = check(await sb.rpc('create_pharmacy', { p_name: name }));
    },

    async load() {
      const pharmacy = await this.getPharmacy();
      if (!pharmacy) return { pharmacy: null };
      const [medicines, batches, movements, settingsRows] = await Promise.all([
        fetchAll('medicines', 'name'),
        fetchAll('batches', 'expiry_date'),
        fetchAll('stock_movements', 'occurred_at'),
        fetchAll('settings', 'pharmacy_id'),
      ]);
      return { pharmacy, medicines, batches, movements, settings: { ...DEFAULT_SETTINGS, ...(settingsRows[0] || {}) } };
    },
    async insertMedicines(rows) {
      if (rows.length) check(await sb.from('medicines').insert(withPharmacy(rows)));
    },
    async updateMedicine({ id, created_at, pharmacy_id, ...fields }) {
      check(await sb.from('medicines').update(fields).eq('id', id));
    },
    async insertBatches(rows) {
      for (let i = 0; i < rows.length; i += PAGE) check(await sb.from('batches').insert(withPharmacy(rows.slice(i, i + PAGE))));
    },
    async insertMovements(rows) {
      for (let i = 0; i < rows.length; i += PAGE) {
        check(await sb.from('stock_movements').insert(withPharmacy(rows.slice(i, i + PAGE))));
      }
    },
    async saveSettings({ expiry_window_days, lookback_days, cover_days, default_lead_time_days }) {
      check(
        await sb
          .from('settings')
          .upsert({ pharmacy_id: pharmacyId, expiry_window_days, lookback_days, cover_days, default_lead_time_days }),
      );
    },
  };
}
