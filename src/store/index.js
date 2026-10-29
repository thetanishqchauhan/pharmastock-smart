import { localStore } from './localStore.js';
import { createSupabaseStore } from './supabaseStore.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const store = url && key ? createSupabaseStore(url, key) : localStore;
