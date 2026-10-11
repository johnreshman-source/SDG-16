document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('open');
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('open');
      });
    });
  }

  const descriptionField = document.getElementById('description');
  const charCount = document.getElementById('char-count');

  if (descriptionField && charCount) {
    const updateCounter = () => {
      const count = descriptionField.value.length;
      charCount.textContent = `${count} / 5000`;
    };

    descriptionField.addEventListener('input', updateCounter);
    updateCounter();
  }

  const reportForm = document.getElementById('report-form');
  const reportMessage = document.getElementById('report-message');
  const submitButton = document.getElementById('submit-report-btn');

  if (reportForm) {
    let isSubmitting = false;

    reportForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (isSubmitting) {
        return;
      }

      const category = document.getElementById('category').value.trim();
      const description = descriptionField.value.trim();
      const anonymous = document.getElementById('anonymous').checked;

      if (!category) {
        showMessage('Please select a category before submitting a report.', 'error');
        return;
      }

      if (description.length < 20 || description.length > 5000) {
        showMessage('Description must be between 20 and 5,000 characters.', 'error');
        return;
      }

      isSubmitting = true;
      setSubmitState(true, 'Submitting...');

      try {
        const tokenResponse = await fetch('/api/csrf-token', { credentials: 'same-origin' });
        const tokenData = await tokenResponse.json();

        if (!tokenData.success || !tokenData.csrfToken) {
          throw new Error('Unable to prepare secure form submission.');
        }

        const response = await fetch('/api/reports', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': tokenData.csrfToken,
          },
          body: JSON.stringify({
            category,
            description,
            anonymous,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to submit report.');
        }

        showMessage(`Report submitted successfully. Reference ID: ${data.reportRef}`, 'success');
        reportForm.reset();
        descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
        setSubmitState(false, 'Submit report');
      } catch (error) {
        showMessage(error.message || 'Unable to submit your report. Please try again.', 'error');
        setSubmitState(false, 'Submit report');
      } finally {
        isSubmitting = false;
      }
    });
  }

  function showMessage(message, type) {
    if (!reportMessage) {
      return;
    }

    reportMessage.textContent = message;
    reportMessage.className = `form-message ${type}`;
  }

  function setSubmitState(isLoading, label) {
    if (!submitButton) {
      return;
    }

    submitButton.disabled = isLoading;
    submitButton.textContent = label;
  }
});
