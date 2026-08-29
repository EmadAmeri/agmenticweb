const root = document.documentElement;
const form = document.querySelector('[data-invite-form]');
const email = document.querySelector('#email');
const status = document.querySelector('#form-status');
const submit = form?.querySelector('button[type="submit"]');
const honeypot = form?.querySelector('[name="website"]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-ready')));

function respondToPointer(event) {
  if (reduceMotion.matches) return;
  root.style.setProperty('--px', ((event.clientX / innerWidth) - .5).toFixed(3));
  root.style.setProperty('--py', ((event.clientY / innerHeight) - .5).toFixed(3));
}

function setStatus(message = '', state = '') {
  if (!status) return;
  status.textContent = message;
  state ? status.dataset.state = state : status.removeAttribute('data-state');
}

function setLoading(isLoading) {
  if (!submit) return;
  submit.disabled = isLoading;
  submit.setAttribute('aria-busy', String(isLoading));
  const accessibleLabel = isLoading ? 'Submitting email…' : 'Submit email for invitation';
  submit.setAttribute('aria-label', accessibleLabel);
  submit.querySelector('.button-label').textContent = accessibleLabel;
}

window.addEventListener('pointermove', respondToPointer, { passive: true });

email?.addEventListener('input', () => {
  email.closest('.field')?.classList.remove('is-invalid');
  if (status?.dataset.state === 'error') setStatus();
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const endpoint = form.dataset.endpoint?.trim();

  if (!email.validity.valid) {
    email.closest('.field')?.classList.add('is-invalid');
    setStatus('Enter a valid email address.', 'error');
    email.focus();
    return;
  }

  if (!endpoint) {
    setStatus('The invite list is not connected yet. Please try again soon.', 'error');
    return;
  }

  setLoading(true);
  setStatus('Sending your request…');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value.trim(),
        website: honeypot?.value || '',
        page_url: location.href
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    form.classList.add('is-success');
    setStatus('Check your inbox to confirm your email.', 'success');
  } catch {
    setStatus('That didn’t go through. Please try again.', 'error');
  } finally {
    setLoading(false);
  }
});
