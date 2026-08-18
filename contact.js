(async function initializeContactForm(){
  const client = window.PlanifProfSupabase;
  const form = document.getElementById('contactForm');
  const message = document.getElementById('contactMessage');
  const button = document.getElementById('contactSubmit');
  if(!client || !form) return;
  const { data: { session } } = await client.auth.getSession();
  if(!session){ window.location.href = 'login.html'; return; }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Envoi...';
    message.className = 'form-message';
    message.textContent = '';
    const payload = {
      request_type: document.getElementById('requestType').value,
      priority: document.getElementById('requestPriority').value,
      title: document.getElementById('requestTitle').value.trim(),
      page_name: document.getElementById('requestPage').value,
      desired_outcome: document.getElementById('desiredOutcome').value.trim(),
      description: document.getElementById('requestDescription').value.trim(),
      reproduction_steps: document.getElementById('reproductionSteps').value.trim(),
      source_url: window.location.href,
      user_agent: navigator.userAgent
    };
    const { data, error } = await client.functions.invoke('submit-feedback', { body: payload });
    button.disabled = false;
    button.textContent = 'Envoyer la demande';
    if(error || !data?.success){
      console.error('Erreur envoi demande', error, data);
      message.className = 'form-message is-error';
      message.textContent = 'La demande n’a pas pu être envoyée. Réessayez dans quelques instants.';
      return;
    }
    form.reset();
    message.className = 'form-message is-success';
    message.textContent = `Demande ${data.reference} envoyée. Merci pour votre contribution.`;
  });
})();
