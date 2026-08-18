// PlanifProf - configuration Supabase
// 1) Va dans Supabase > Project Settings > API
// 2) Remplace les deux valeurs ci-dessous
// 3) Ne mets jamais la service_role key ici. Utilise seulement la anon/public key.
window.PLANIFPROF_SUPABASE_URL = 'https://eibaukeyqwofmosjgngh.supabase.co';
window.PLANIFPROF_SUPABASE_ANON_KEY = 'sb_publishable_O2KcijQ-kxzL5UrRnMbM9w_CP-ZphZe';

if (window.supabase && window.PLANIFPROF_SUPABASE_URL.includes('supabase.co')) {
  window.PlanifProfSupabase = window.supabase.createClient(
    window.PLANIFPROF_SUPABASE_URL,
    window.PLANIFPROF_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
}
