document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('admin-login-form');

  if (loginForm) {
    const loginMessage = document.getElementById('admin-login-message');
    const loginButton = document.getElementById('admin-login-btn');
    const loginStatus = document.getElementById('admin-login-status');

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.getElementById('admin-username').value.trim();
      const password = document.getElementById('admin-password').value;

      if (!username || !password) {
        showMessage(loginMessage, 'Username and password are required.', 'error');
        return;
      }

      loginButton.disabled = true;
      loginButton.textContent = 'Logging in...';
      loginStatus.textContent = 'Preparing secure sign-in…';

      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch('/api/admin/login', {
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
          throw new Error(data.message || 'Login failed.');
        }

        window.location.href = '/admin/dashboard';
      } catch (error) {
        showMessage(loginMessage, error.message || 'Could not log in.', 'error');
        loginButton.disabled = false;
        loginButton.textContent = 'Log in';
        loginStatus.textContent = '';
      }
    });

    return;
  }

  const state = {
    page: 1,
    limit: 10,
    status: '',
    category: '',
    search: '',
    sort: 'newest',
  };

  const filters = {
    status: document.getElementById('status-filter'),
    category: document.getElementById('category-filter'),
    search: document.getElementById('search-input'),
    sort: document.getElementById('sort-filter'),
    apply: document.getElementById('apply-filters'),
    prev: document.getElementById('prev-page'),
    next: document.getElementById('next-page'),
    pageLabel: document.getElementById('page-indicator'),
    logout: document.getElementById('logout-btn'),
    refresh: document.getElementById('refresh-dashboard'),
  };

  try {
    await checkAuthentication();
    await loadDashboard();
  } catch (error) {
    if (error.authRequired) {
      window.location.href = '/admin-login.html';
    } else {
      showDashboardMessage(error.message || 'Unable to load the dashboard.', 'error');
    }
    return;
  }

  filters.apply.addEventListener('click', () => {
    state.status = filters.status.value;
    state.category = filters.category.value;
    state.search = filters.search.value.trim();
    state.sort = filters.sort.value;
    state.page = 1;
    refreshDashboard();
  });

  filters.refresh.addEventListener('click', async () => {
    filters.refresh.disabled = true;
    filters.refresh.textContent = 'Refreshing…';
    try {
      await refreshDashboard();
    } finally {
      filters.refresh.disabled = false;
      filters.refresh.textContent = 'Refresh';
    }
  });

  filters.prev.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      refreshDashboard();
    }
  });

  filters.next.addEventListener('click', () => {
    state.page += 1;
    refreshDashboard();
  });

  filters.logout.addEventListener('click', async () => {
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
      });

      if (!response.ok) {
        throw new Error('Logout failed.');
      }

      window.location.href = '/admin-login.html';
    } catch (error) {
      showDashboardMessage(error.message || 'Logout failed.', 'error');
    }
  });

  async function loadDashboard() {
    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
    });

    if (state.status) params.set('status', state.status);
    if (state.category) params.set('category', state.category);
    if (state.search) params.set('search', state.search);
    params.set('sort', state.sort);

    const response = await fetch(`/api/admin/reports?${params.toString()}`, { credentials: 'same-origin' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Unable to load reports.');
    }

    const statsResponse = await fetch('/api/admin/stats', { credentials: 'same-origin' });
    const statsData = await statsResponse.json();

    if (!statsResponse.ok) {
      throw new Error(statsData.message || 'Unable to load statistics.');
    }

    renderStats(statsData.stats);
    renderReports(data.reports, data.pagination);
    showDashboardMessage('', '');
  }

  function renderStats(stats) {
    document.getElementById('total-reports').textContent = stats.totalReports;
    document.getElementById('new-count').textContent = getStatusValue(stats.statusCounts, 'New');
    document.getElementById('review-count').textContent = getStatusValue(stats.statusCounts, 'Under Review');
    document.getElementById('resolved-count').textContent = getStatusValue(stats.statusCounts, 'Resolved');

    const categoryStats = document.getElementById('category-stats');
    categoryStats.replaceChildren();
    if (stats.categoryCounts.length === 0) {
      categoryStats.textContent = 'No reports have been submitted.';
    } else {
      stats.categoryCounts.forEach((item) => {
        const entry = document.createElement('div');
        entry.className = 'category-stat';
        const label = document.createElement('span');
        label.textContent = item.category;
        const count = document.createElement('strong');
        count.textContent = String(item.count);
        entry.append(label, count);
        categoryStats.appendChild(entry);
      });
    }

    const recentReports = document.getElementById('recent-reports');
    recentReports.replaceChildren();
    if (stats.recentReports.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = 'No reports have been submitted.';
      recentReports.appendChild(empty);
    } else {
      stats.recentReports.forEach((report) => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `${report.report_ref} · ${report.category}`;
        const meta = document.createElement('small');
        meta.textContent = `${report.status} · ${new Date(report.created_at).toLocaleString()}`;
        item.append(label, meta);
        recentReports.appendChild(item);
      });
    }
  }

  function renderReports(reports, pagination) {
    const body = document.getElementById('reports-table-body');
    body.replaceChildren();

    if (!reports.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No reports found.';
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      reports.forEach((report) => {
        const row = document.createElement('tr');
        const referenceCell = document.createElement('td');
        referenceCell.textContent = report.report_ref;
        row.appendChild(referenceCell);

        const categoryCell = document.createElement('td');
        categoryCell.textContent = report.category;
        row.appendChild(categoryCell);

        const descriptionCell = document.createElement('td');
        descriptionCell.className = 'description-preview';
        descriptionCell.textContent = report.description.length > 140
          ? `${report.description.slice(0, 137)}…`
          : report.description;
        descriptionCell.title = report.description;
        row.appendChild(descriptionCell);

        const anonymousCell = document.createElement('td');
        anonymousCell.textContent = report.anonymous ? 'Yes' : 'No';
        row.appendChild(anonymousCell);

        const statusCell = document.createElement('td');
        const statusSelect = document.createElement('select');
        statusSelect.dataset.reportId = String(report.id);
        statusSelect.className = 'status-select';
        statusSelect.dataset.currentStatus = report.status;
        ['New', 'Under Review', 'Resolved'].forEach((status) => {
          const option = document.createElement('option');
          option.value = status;
          option.textContent = status;
          option.selected = report.status === status;
          statusSelect.appendChild(option);
        });
        statusCell.appendChild(statusSelect);
        row.appendChild(statusCell);

        const createdCell = document.createElement('td');
        createdCell.textContent = new Date(report.created_at).toLocaleString();
        row.appendChild(createdCell);

        const actionCell = document.createElement('td');
        const viewButton = document.createElement('button');
        viewButton.className = 'button secondary small-btn';
        viewButton.dataset.reportId = String(report.id);
        viewButton.type = 'button';
        viewButton.textContent = 'View';
        actionCell.appendChild(viewButton);
        row.appendChild(actionCell);
        body.appendChild(row);
      });
    }

    filters.pageLabel.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
    filters.prev.disabled = pagination.page <= 1;
    filters.next.disabled = pagination.page >= pagination.totalPages;

    document.querySelectorAll('.status-select').forEach((select) => {
      select.addEventListener('change', async (event) => {
        const statusSelect = event.currentTarget;
        const previousStatus = statusSelect.dataset.currentStatus;
        const selectedStatus = statusSelect.value;
        if (!window.confirm(`Change this report's status from "${previousStatus}" to "${selectedStatus}"?`)) {
          statusSelect.value = previousStatus;
          return;
        }

        statusSelect.disabled = true;
        const reportId = statusSelect.dataset.reportId;
        try {
          const token = await getCsrfToken();
          const response = await fetch(`/api/admin/reports/${reportId}/status`, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': token,
            },
            body: JSON.stringify({ status: selectedStatus }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.message || 'Unable to update status.');
          }

          showDashboardMessage(data.message, 'success');
          await refreshDashboard();
        } catch (error) {
          showDashboardMessage(error.message || 'Unable to update status.', 'error');
          await refreshDashboard();
        }
      });
    });

    document.querySelectorAll('.small-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const reportId = button.dataset.reportId;
          const reportResponse = await fetch(`/api/admin/reports/${reportId}`, { credentials: 'same-origin' });
          const reportData = await reportResponse.json();

          if (!reportResponse.ok) {
            throw new Error(reportData.message || 'Report not found.');
          }

          showReportDetails(reportData.report);
        } catch (error) {
          showDashboardMessage(error.message || 'Unable to load report details.', 'error');
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  const reportDialog = document.getElementById('report-dialog');
  const closeReportDialog = document.getElementById('close-report-dialog');
  if (reportDialog && closeReportDialog) {
    closeReportDialog.addEventListener('click', () => reportDialog.close());
  }

  async function checkAuthentication() {
    const response = await fetch('/api/admin/me', { credentials: 'same-origin' });
    if (response.status === 401) {
      const error = new Error('Not authenticated');
      error.authRequired = true;
      throw error;
    }
    if (!response.ok) {
      throw new Error('Could not confirm administrator access.');
    }
  }

  async function refreshDashboard() {
    try {
      await loadDashboard();
    } catch (error) {
      showDashboardMessage(error.message || 'Unable to load the dashboard.', 'error');
    }
  }

  function getStatusValue(statusCounts, statusName) {
    const item = statusCounts.find((entry) => entry.status === statusName);
    return item ? item.count : 0;
  }

  async function getCsrfToken() {
    const response = await fetch('/api/csrf-token', { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok || !data.success || !data.csrfToken) {
      throw new Error(data.message || 'Could not obtain a security token. Reload the page and try again.');
    }
    return data.csrfToken;
  }

  function showReportDetails(report) {
    if (!reportDialog) {
      showDashboardMessage('The report details view is unavailable.', 'error');
      return;
    }

    document.getElementById('detail-reference').textContent = report.report_ref;
    document.getElementById('detail-category').textContent = report.category;
    document.getElementById('detail-status').textContent = report.status;
    document.getElementById('detail-created').textContent = new Date(report.created_at).toLocaleString();
    document.getElementById('detail-updated').textContent = new Date(report.updated_at).toLocaleString();
    document.getElementById('detail-anonymous').textContent = report.anonymous ? 'Yes' : 'No';
    document.getElementById('detail-description').textContent = report.description;
    reportDialog.showModal();
  }

  function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `form-message ${type}`;
  }

  function showDashboardMessage(message, type) {
    const element = document.getElementById('dashboard-message');
    if (!element) {
      return;
    }
    element.textContent = message;
    element.className = type ? `form-message ${type}` : 'form-message';
  }
});
