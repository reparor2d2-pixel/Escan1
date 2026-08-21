(() => {
  const cfg = window.EVALUACAM_CONFIG || {};
  const domain = String(cfg.institutionalDomain || 'nsmquilpue.cl').toLowerCase();
  const adminEmail = String(cfg.adminEmail || 'c.cari@nsmquilpue.cl').toLowerCase();
  const TOKEN_KEY = 'ec_google_id_token';
  const USER_KEY = 'ec_google_user';
  let currentUser = null;
  let idToken = '';
  let googleInitialized = false;
  let readySettled = false;
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const $ = selector => document.querySelector(selector);

  function settleReady() {
    if (!readySettled) {
      readySettled = true;
      readyResolve();
    }
  }
  function setMessage(message, bad = false) {
    const el = $('#authMessage');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', !!bad);
  }
  function showRetry(show = true) {
    const btn = $('#retryGoogleBtn');
    if (btn) btn.hidden = !show;
  }
  function decodeJwt(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(part).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(json);
    } catch (_) { return null; }
  }
  function isConfigured() {
    return !!cfg.googleClientId && !String(cfg.googleClientId).startsWith('PEGAR_');
  }
  function validClaims(claims) {
    if (!claims) return false;
    const email = String(claims.email || '').toLowerCase();
    const hostedDomain = String(claims.hd || '').toLowerCase();
    const audience = String(claims.aud || '');
    const unexpired = Number(claims.exp || 0) * 1000 > Date.now() + 30000;
    return unexpired && claims.email_verified !== false && audience === cfg.googleClientId && hostedDomain === domain && email.endsWith('@' + domain);
  }
  function applyRole(user) {
    currentUser = user || null;
    const admin = !!user && String(user.email || '').toLowerCase() === adminEmail;
    document.body.classList.toggle('is-admin', admin);
    document.body.classList.toggle('is-authenticated', !!user);
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !admin; });
    const name = $('#currentUserName');
    const role = $('#currentUserRole');
    const top = $('#topbarAccount');
    if (name) name.textContent = user ? (user.name || user.email) : '';
    if (role) role.textContent = user ? (admin ? 'Administrador' : 'Docente') : '';
    if (top) top.textContent = user ? user.email : 'Cuenta institucional';
    window.switchEvaluaCamUser?.(user?.uid || 'guest');
    if (user) window.EvaluaCamCloud?.pullInitialData?.();
  }
  function clearSession() {
    idToken = '';
    currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    applyRole(null);
    const gate = $('#authGate');
    if (gate) gate.hidden = false;
  }
  function acceptCredential(credential) {
    const claims = decodeJwt(credential);
    if (!validClaims(claims)) {
      clearSession();
      setMessage(`La cuenta debe pertenecer al dominio @${domain}.`, true);
      return false;
    }
    idToken = credential;
    const user = {
      uid: String(claims.sub || claims.email),
      email: String(claims.email || '').toLowerCase(),
      name: String(claims.name || claims.email || ''),
      picture: String(claims.picture || '')
    };
    localStorage.setItem(TOKEN_KEY, credential);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    applyRole(user);
    const gate = $('#authGate');
    if (gate) gate.hidden = true;
    setMessage('');
    showRetry(false);
    return true;
  }
  function handleCredential(response) {
    if (!response || !response.credential) {
      setMessage('Google no entregó una credencial válida.', true);
      return;
    }
    acceptCredential(response.credential);
  }
  function renderGoogleButton() {
    const host = $('#googleSignInButton');
    if (!host || !window.google?.accounts?.id) return false;
    host.replaceChildren();
    google.accounts.id.renderButton(host, {
      type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
      shape: 'rectangular', width: Math.min(340, Math.max(260, host.clientWidth || 320)),
      logo_alignment: 'left', locale: 'es'
    });
    return true;
  }
  function initializeGoogle() {
    if (googleInitialized) return true;
    if (!isConfigured()) {
      setMessage('El administrador debe completar google-config.js antes de publicar.', true);
      showRetry(false);
      settleReady();
      return false;
    }
    if (!window.google?.accounts?.id) return false;
    google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: false,
      hd: domain,
      context: 'signin',
      ux_mode: 'popup'
    });
    googleInitialized = true;
    renderGoogleButton();
    showRetry(false);
    const saved = localStorage.getItem(TOKEN_KEY) || '';
    if (saved) acceptCredential(saved);
    settleReady();
    return true;
  }
  async function waitForGoogleLibrary(timeoutMs = 15000) {
    if (initializeGoogle()) return true;
    setMessage('Cargando acceso de Google…');
    showRetry(false);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 250));
      if (initializeGoogle()) return true;
    }
    setMessage('No fue posible cargar el acceso de Google. Recargue la página. Si usa un bloqueador de contenido, desactívelo para este sitio.', true);
    showRetry(true);
    settleReady();
    return false;
  }
  async function retryGoogle() {
    googleInitialized = false;
    setMessage('Reintentando conexión con Google…');
    showRetry(false);
    const old = document.querySelector('script[data-evaluacam-gsi]');
    if (old) old.remove();
    if (!window.google?.accounts?.id) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client?hl=es-419';
      script.async = true;
      script.defer = true;
      script.dataset.evaluacamGsi = '1';
      script.onload = () => initializeGoogle();
      script.onerror = () => {
        setMessage('Safari no pudo conectar con accounts.google.com. Revise bloqueadores de contenido o restricciones de red.', true);
        showRetry(true);
      };
      document.head.appendChild(script);
    }
    await waitForGoogleLibrary(15000);
  }
  async function getIdToken() {
    const claims = decodeJwt(idToken);
    if (idToken && validClaims(claims)) return idToken;
    clearSession();
    setMessage('La sesión expiró. Ingrese nuevamente con Google.', true);
    return '';
  }
  function signOut() {
    const email = currentUser?.email || '';
    clearSession();
    try {
      google.accounts.id.disableAutoSelect();
      if (email) google.accounts.id.revoke(email, () => {});
    } catch (_) {}
  }

  window.EvaluaCamAuth = {
    ready,
    getIdToken,
    currentUser: () => currentUser,
    isAdmin: () => String(currentUser?.email || '').toLowerCase() === adminEmail,
    signOut
  };
  window.onGoogleLibraryLoad = initializeGoogle;

  window.addEventListener('DOMContentLoaded', () => {
    $('#logoutBtn')?.addEventListener('click', signOut);
    $('#retryGoogleBtn')?.addEventListener('click', retryGoogle);
    waitForGoogleLibrary();
  });
  window.addEventListener('resize', () => {
    const host = $('#googleSignInButton');
    if (host && googleInitialized && window.google?.accounts?.id) renderGoogleButton();
  });
})();
