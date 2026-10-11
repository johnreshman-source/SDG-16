document.addEventListener('DOMContentLoaded', async () => {
  const welcome = document.getElementById('account-welcome');
  const reportsList = document.getElementById('user-reports-list');
  const message = document.getElementById('account-message');

  try {
    const meResponse = await fetch('/api/users/me', { credentials: 'same-origin' });
    if (meResponse.status === 401) {
      window.location.replace('/user-login.html');
      return;
    }
    const meData = await meResponse.json();
    if (!meResponse.ok) {
      throw new Error(meData.message || 'Could not load your account.');
    }
    welcome.textContent = `Signed in as ${meData.user.username}`;

    const reportsResponse = await fetch('/api/users/reports', { credentials: 'same-origin' });
    const reportsData = await reportsResponse.json();
    if (!reportsResponse.ok) {
      if (reportsResponse.status === 401) {
        window.location.replace('/user-login.html');
        return;
      }
      throw new Error(reportsData.message || 'Could not load your reports.');
    }

    renderReports(reportsData.reports);
  } catch (error) {
    showMessage(error.message || 'Could not load your account.', 'error');
  }

  document.getElementById('user-logout-button').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;

    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Could not sign out.');
      }
      window.location.replace('/user-login.html');
    } catch (error) {
      showMessage(error.message || 'Could not sign out.', 'error');
      button.disabled = false;
    }
  });

  function renderReports(reports) {
    reportsList.replaceChildren();
    if (reports.length === 0) {
      const empty = document.createElement('article');
      empty.className = 'empty-state card';
      const heading = document.createElement('h3');
      heading.textContent = 'No linked reports yet';
      const text = document.createElement('p');
      text.textContent = 'Reports submitted anonymously are not linked to your account. To track a report here, sign in before submitting and turn off anonymous reporting.';
      const link = document.createElement('a');
      link.href = '/report.html';
      link.className = 'button primary';
      link.textContent = 'Submit a report';
      empty.append(heading, text, link);
      reportsList.appendChild(empty);
      return;
    }

    reports.forEach((report) => {
      const card = document.createElement('article');
      card.className = 'user-report-card card';

      const header = document.createElement('div');
      header.className = 'user-report-header';
      const reference = document.createElement('h3');
      reference.textContent = report.report_ref;
      const status = document.createElement('span');
      status.className = 'status-badge';
      status.textContent = report.status;
      header.append(reference, status);

      const category = document.createElement('p');
      category.className = 'report-category';
      category.textContent = report.category;

      const created = document.createElement('p');
      created.className = 'report-date';
      created.textContent = `Submitted ${new Date(report.created_at).toLocaleString()}`;

      const description = document.createElement('p');
      description.className = 'user-report-description';
      description.textContent = report.description;

      card.append(header, category, created, description);
      reportsList.appendChild(card);
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

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `form-message ${type}`;
  }
});
