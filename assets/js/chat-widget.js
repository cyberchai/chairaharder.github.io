(function () {
  const widget = document.querySelector('.askchaira-widget');
  if (!widget) {
    return;
  }

  const toggleButton = widget.querySelector('.askchaira-toggle');
  const panel = widget.querySelector('.askchaira-panel');
  const closeButton = widget.querySelector('.askchaira-close');
  const messagesEl = widget.querySelector('[data-askchaira-messages]');
  const statusEl = widget.querySelector('[data-askchaira-status]');
  const form = widget.querySelector('[data-askchaira-form]');
  const input = widget.querySelector('.askchaira-input');
  const submitButton = widget.querySelector('[data-askchaira-submit]');

  const supabaseUrl = (widget.getAttribute('data-supabase-url') || '').trim();
  const anonKey = (widget.getAttribute('data-anon-key') || '').trim();

  function supabaseFunctionUrl() {
    if (!supabaseUrl) {
      return '';
    }
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ask`;
  }

  function appendMessage(role, text) {
    if (!messagesEl) {
      return;
    }
    const bubble = document.createElement('div');
    bubble.className = `askchaira-bubble ${role}`;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setStatus(text) {
    if (statusEl) {
      statusEl.textContent = text || '';
    }
  }

  function setLoading(isLoading) {
    if (submitButton) {
      submitButton.disabled = isLoading;
    }
    if (input) {
      input.readOnly = isLoading;
    }
  }

  function togglePanel(expand) {
    if (!panel || !toggleButton) {
      return;
    }

    const shouldOpen = typeof expand === 'boolean' ? expand : panel.hasAttribute('hidden');
    if (shouldOpen) {
      panel.removeAttribute('hidden');
      toggleButton.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        if (input) {
          input.focus();
        }
      }, 0);
    } else {
      panel.setAttribute('hidden', '');
      toggleButton.setAttribute('aria-expanded', 'false');
    }
  }

  toggleButton?.addEventListener('click', () => {
    togglePanel();
  });

  closeButton?.addEventListener('click', () => {
    togglePanel(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      togglePanel(false);
    }
  });

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input) {
        return;
      }

      const question = input.value.trim();
      if (!question) {
        return;
      }

      if (!supabaseFunctionUrl()) {
        appendMessage('assistant', 'The chat service is not configured yet. Please add your Supabase URL (and anon key if required).');
        return;
      }

      appendMessage('user', question);
      input.value = '';
      setLoading(true);
      setStatus('Thinking…');

      try {
        const headers = {
          'Content-Type': 'application/json'
        };
        if (anonKey) {
          headers.Authorization = `Bearer ${anonKey}`;
        }

        const response = await fetch(supabaseFunctionUrl(), {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: question })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const errorMessage = payload.error || `Request failed with status ${response.status}`;
          throw new Error(errorMessage);
        }

        const answer =
          payload.answer ||
          payload.result ||
          (Array.isArray(payload.choices) && payload.choices[0]?.message?.content) ||
          'I couldn’t find an answer to that just yet.';
        appendMessage('assistant', answer);
        setStatus('');
      } catch (error) {
        console.error(error);
        appendMessage('assistant', `Sorry, something went wrong. ${error.message}`);
        setStatus('Something went wrong — try again.');
      } finally {
        setLoading(false);
      }
    });
  }
})();
