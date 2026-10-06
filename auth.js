const authForm = document.getElementById('authForm');
const authStatus = document.getElementById('authStatus');
const sessionPanel = document.getElementById('sessionPanel');
const sessionEmail = document.getElementById('sessionEmail');
const signOutButton = document.getElementById('signOutButton');
const client = window.SupabaseApp?.client;
const navigationEntry = performance.getEntriesByType('navigation')[0];

if (!localStorage.getItem('nc_prefs_owner_v1') && navigationEntry?.type === 'reload') {
  sessionStorage.removeItem('nc_guest_prefs_v1');
}

function showAuthMessage(message, isError = false) {
  authStatus.textContent = message;
  authStatus.classList.toggle('text-red-300', isError);
  authStatus.classList.toggle('text-brand-muted', !isError);
}

function renderSession(session) {
  const signedIn = Boolean(session?.user);
  authForm.classList.toggle('hidden', signedIn);
  sessionPanel.classList.toggle('hidden', !signedIn);
  sessionEmail.textContent = session?.user?.email || '';
}

if (!client) {
  showAuthMessage('Could not load Supabase. Check your internet connection and reload.', true);
} else {
  client.auth.getSession().then(({ data, error }) => {
    if (error) showAuthMessage(error.message, true);
    renderSession(data?.session);
  });

  client.auth.onAuthStateChange((_event, session) => {
    renderSession(session);
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const action = submitter?.value;
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const buttons = [...authForm.querySelectorAll('button[type="submit"]')];
    buttons.forEach((button) => { button.disabled = true; });
    showAuthMessage(action === 'signup' ? 'Creating your account…' : 'Signing in…');

    try {
      if (action === 'signup') {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: new URL('auth.html', window.location.href).href },
        });
        if (error) throw error;
        showAuthMessage(data.session
          ? 'Account created and signed in.'
          : 'Account created. Check your email to confirm your address, then sign in.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showAuthMessage('You are signed in.');
      }
    } catch (error) {
      showAuthMessage(error.message || 'Authentication failed. Please try again.', true);
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  });

  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    const { error } = await client.auth.signOut();
    signOutButton.disabled = false;
    if (!error) {
      localStorage.removeItem('nc_prefs_v1');
      localStorage.removeItem('nc_prefs_owner_v1');
      sessionStorage.removeItem('nc_guest_prefs_v1');
    }
    showAuthMessage(error ? error.message : 'You are signed out.', Boolean(error));
  });
}