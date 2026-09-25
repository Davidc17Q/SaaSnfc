'use strict';

const $ = (s) => document.querySelector(s);

// Mostrar / ocultar contraseña
const togglePw = $('#togglePw');
if (togglePw) {
  togglePw.addEventListener('click', () => {
    const input = $('#password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    togglePw.setAttribute('data-icon', show ? 'eye-off' : 'eye');
    if (window.hydrateIcons) window.hydrateIcons(togglePw.parentElement);
  });
}

async function doLogin() {
  const user = $('#user').value.trim();
  const password = $('#password').value;
  const remember = $('#remember') ? $('#remember').checked : true;
  const msg = $('#loginMsg');
  msg.textContent = '';

  if (!user || !password) {
    msg.style.color = '#dc2626';
    msg.textContent = 'Ingresa usuario y contraseña.';
    return;
  }

  const btn = $('#loginBtn');
  btn.disabled = true;
  btn.textContent = 'Ingresando…';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ user, password, remember }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      msg.style.color = '#dc2626';
      msg.textContent = err.error || 'No se pudo iniciar sesión.';
      btn.disabled = false;
      btn.textContent = 'Ingresar';
      return;
    }
    // Éxito: ir al panel
    window.location.href = '/';
  } catch {
    msg.style.color = '#dc2626';
    msg.textContent = 'Error de conexión.';
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

$('#loginBtn').addEventListener('click', doLogin);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
