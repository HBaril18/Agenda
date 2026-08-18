// PlanifProf - configuration Supabase
// Utiliser uniquement la publishable key, jamais la secret key.

window.PLANIFPROF_SUPABASE_URL =
'https://eibaukeyqwofmosjgngh.supabase.co';

window.PLANIFPROF_SUPABASE_ANON_KEY =
'sb_publishable_O2KcijQ-kxzL5UrRnMbM9w_CP-ZphZe';

if (
window.supabase &&
window.PLANIFPROF_SUPABASE_URL.includes('supabase.co')
) {
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
} else {
console.error(
'PlanifProf : la bibliothèque Supabase ou la configuration est introuvable.'
);
}
