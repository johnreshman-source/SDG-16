document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('user-login-form');
  const registerForm = document.getElementById('user-register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.getElementById('user-login-username').value.trim();
      const password = document.getElementById('user-login-password').value;
      const button = document.getElementById('user-login-button');
      const status = document.getElementById('user-login-status');
      const message = document.getElementById('user-login-message');

      if (!username || !password) {
        showMessage(message, 'Enter your username and password.', 'error');
        return;
      }

      button.disabled = true;
      button.textContent = 'Signing in...';
      status.textContent = 'Preparing secure sign-in…';

      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch('/api/users/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Sign-in failed.');
        }

        window.location.assign('/account.html');
      } catch (error) {
        showMessage(message, error.message || 'Could not sign in. Try again.', 'error');
        status.textContent = '';
        button.disabled = false;
        button.textContent = 'Sign in';
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.getElementById('user-register-username').value.trim();
      const password = document.getElementById('user-register-password').value;
      const confirmPassword = document.getElementById('user-register-confirm').value;
      const button = document.getElementById('user-register-button');
      const status = document.getElementById('user-register-status');
      const message = document.getElementById('user-register-message');

      if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
        showMessage(message, 'Username must be 3–32 characters using letters, numbers, dot, underscore, or hyphen.', 'error');
        return;
      }

      if (password.length < 12 || password.length > 128) {
        showMessage(message, 'Password must be between 12 and 128 characters.', 'error');
        return;
      }

      if (password !== confirmPassword) {
        showMessage(message, 'The passwords do not match.', 'error');
        return;
      }

      button.disabled = true;
      button.textContent = 'Creating account...';
      status.textContent = 'Creating your account securely…';

      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch('/api/users/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Could not create the account.');
        }

        showMessage(message, 'Account created successfully. You can now sign in.', 'success');
        status.textContent = '';
        registerForm.reset();
      } catch (error) {
        showMessage(message, error.message || 'Could not create the account. Try again.', 'error');
        status.textContent = '';
      } finally {
        button.disabled = false;
        button.textContent = 'Create account';
      }
    });
  }

  async function getCsrfToken() {
    const response = await fetch('/api/csrf-token', { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok || !data.success || !data.csrfToken) {
      throw new Error(data.message || 'Could not obtain a security token. Reload the page and try again.');
    }
    return data.csrfToken;
  }

  function showMessage(element, text, type) {
    element.textContent = text;
    element.className = `form-message ${type}`;
  }
});
