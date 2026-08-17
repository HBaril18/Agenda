// PlanifProf - configuration Supabase
// 1) Va dans Supabase > Project Settings > API
// 2) Remplace les deux valeurs ci-dessous
// 3) Ne mets jamais la service_role key ici. Utilise seulement la anon/public key.
window.PLANIFPROF_SUPABASE_URL = 'https://TON-PROJET.supabase.co';
window.PLANIFPROF_SUPABASE_ANON_KEY = 'TON_ANON_PUBLIC_KEY';

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
