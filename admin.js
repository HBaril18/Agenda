let adminPayload = null;
(async function initializeAdmin(){
  const client = window.PlanifProfSupabase;
  if(!client){ return showDenied(); }
  const { data: { session } } = await client.auth.getSession();
  if(!session){ window.location.href = 'login.html'; return; }
  document.getElementById('refreshAdmin').addEventListener('click', loadAdminData);
  document.getElementById('feedbackFilter').addEventListener('change', renderFeedback);
  await loadAdminData();
})();
async function loadAdminData(){
  const button = document.getElementById('refreshAdmin');
  button.disabled = true; button.textContent = 'Chargement...';
  const { data, error } = await window.PlanifProfSupabase.functions.invoke('admin-stats', { body: { action: 'dashboard' } });
  button.disabled = false; button.textContent = 'Actualiser';
  if(error || !data?.success){ console.error(error, data); showDenied(); return; }
  adminPayload = data;
  document.getElementById('adminDenied').hidden = true;
  document.getElementById('adminContent').hidden = false;
  renderStats(); renderBars('statusBars', data.feedback_by_status); renderBars('typeBars', data.feedback_by_type); renderFeedback();
}
function showDenied(){ document.getElementById('adminContent').hidden = true; document.getElementById('adminDenied').hidden = false; }
function renderStats(){
  const s = adminPayload.stats;
  const cards = [
    ['Comptes utilisateurs', s.users_total, '👤'], ['Comptes confirmés', s.users_confirmed, '✓'],
    ['Profils ayant des données', s.users_with_state, '💾'], ['Demandes totales', s.feedback_total, '💡'],
    ['Nouvelles demandes', s.feedback_new, '🔔'], ['Comptes verrouillés', s.locked_accounts, '🔒'],
    ['Inscriptions sur 30 jours', s.signups_30d, '📈'], ['Demandes sur 30 jours', s.feedback_30d, '📬']
  ];
  document.getElementById('statsGrid').innerHTML = cards.map(([label,value,icon]) => `<article class="stat-card"><span>${icon}</span><strong>${value}</strong><small>${label}</small></article>`).join('');
}
function renderBars(id, values){
  const entries = Object.entries(values || {}); const max = Math.max(1, ...entries.map(([,v]) => v));
  document.getElementById(id).innerHTML = entries.map(([label,value]) => `<div class="stat-bar-row"><div><span>${label.replaceAll('_',' ')}</span><strong>${value}</strong></div><div class="stat-bar-track"><span style="width:${Math.round(value/max*100)}%"></span></div></div>`).join('') || '<p class="muted">Aucune donnée.</p>';
}
function renderFeedback(){
  if(!adminPayload) return;
  const filter = document.getElementById('feedbackFilter').value;
  const items = adminPayload.feedback.filter(item => filter === 'all' || item.status === filter);
  document.getElementById('feedbackList').innerHTML = items.map(item => `<article class="feedback-admin-card"><div class="feedback-card-head"><div><span class="request-reference">${item.reference}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.request_type)} · ${escapeHtml(item.page_name)} · ${new Date(item.created_at).toLocaleString('fr-CA')}</p></div><select data-feedback-status="${item.id}"><option value="nouvelle" ${item.status==='nouvelle'?'selected':''}>Nouvelle</option><option value="en_cours" ${item.status==='en_cours'?'selected':''}>En cours</option><option value="planifiee" ${item.status==='planifiee'?'selected':''}>Planifiée</option><option value="terminee" ${item.status==='terminee'?'selected':''}>Terminée</option><option value="refusee" ${item.status==='refusee'?'selected':''}>Refusée</option></select></div><div class="feedback-details"><p><strong>Utilisateur :</strong> ${escapeHtml(item.user_name || item.user_email || 'Inconnu')}</p><p><strong>Priorité :</strong> ${escapeHtml(item.priority)}</p><p><strong>Résultat souhaité :</strong> ${escapeHtml(item.desired_outcome)}</p><p><strong>Description :</strong><br>${escapeHtml(item.description)}</p>${item.reproduction_steps?`<p><strong>Étapes :</strong><br>${escapeHtml(item.reproduction_steps)}</p>`:''}</div></article>`).join('') || '<p class="muted">Aucune demande pour ce filtre.</p>';
  document.querySelectorAll('[data-feedback-status]').forEach(select => select.addEventListener('change', async () => {
    select.disabled = true;
    const { data, error } = await window.PlanifProfSupabase.functions.invoke('admin-stats', { body: { action: 'update_feedback', feedback_id: select.dataset.feedbackStatus, status: select.value } });
    select.disabled = false;
    if(error || !data?.success) alert('La mise à jour a échoué.'); else await loadAdminData();
  }));
}
function escapeHtml(value){ const div=document.createElement('div'); div.textContent=String(value??''); return div.innerHTML.replaceAll('\n','<br>'); }
