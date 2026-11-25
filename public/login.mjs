import { apiRequest } from '/api.mjs';

const form = document.getElementById('login-form');
const button = document.getElementById('login-button');
const status = document.getElementById('login-status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.classList.add('hidden');
  try {
    await apiRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: document.getElementById('password').value }),
    });
    window.location.assign('/');
  } catch (error) {
    status.textContent = error.message;
    status.classList.remove('hidden');
    button.disabled = false;
    document.getElementById('password').select();
  }
});
