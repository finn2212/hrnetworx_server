// config.js
import { createClient } from '@supabase/supabase-js';

// Die Umgebungs-Vars hier sind die Supabase-URL und dein anon-/serviceRole-Key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Lädt alle Settings als key→value Map */
export async function loadSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value');
  if (error) throw error;
  return Object.fromEntries(data.map(({ key, value }) => [key, value]));
}