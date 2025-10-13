document.addEventListener('DOMContentLoaded', function() {
  const widget = document.querySelector('.askchaira-widget');
  if (!widget) {
    console.log('AskChaira widget not found');
    return;
  }

  const toggleInput = widget.querySelector('.askchaira-toggle');
  const overlay = widget.querySelector('.askchaira-overlay');
  const closeButton = widget.querySelector('.askchaira-close');
  const messagesEl = widget.querySelector('[data-askchaira-messages]');
  const statusEl = widget.querySelector('[data-askchaira-status]');

  console.log('Widget elements found:', {
    widget: !!widget,
    toggleInput: !!toggleInput,
    overlay: !!overlay,
    closeButton: !!closeButton,
    messagesEl: !!messagesEl,
    statusEl: !!statusEl
  });

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
    if (toggleInput) {
      toggleInput.readOnly = isLoading;
    }
  }

  function togglePanel(expand) {
    if (!overlay || !toggleInput) {
      return;
    }

    const shouldOpen = typeof expand === 'boolean' ? expand : overlay.hasAttribute('hidden');
    if (shouldOpen) {
      overlay.removeAttribute('hidden');
      toggleInput.setAttribute('aria-expanded', 'true');
    } else {
      overlay.setAttribute('hidden', '');
      toggleInput.setAttribute('aria-expanded', 'false');
      toggleInput.value = '';
      // Clear messages when closing
      if (messagesEl) {
        messagesEl.innerHTML = '';
      }
    }
  }

  toggleInput?.addEventListener('keydown', async (event) => {
    console.log('Key pressed:', event.key); // Debug log
    if (event.key === 'Enter') {
      event.preventDefault();
      const question = toggleInput.value.trim();
      console.log('Question:', question); // Debug log
      if (question) {
        console.log('Submitting question...'); // Debug log
        togglePanel(true);
        await submitQuestion(question);
      }
    }
  });

  closeButton?.addEventListener('click', () => {
    togglePanel(false);
  });

  // Close overlay when clicking outside the panel
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) {
      togglePanel(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      togglePanel(false);
    }
    
    // Command + K (or Ctrl + K on Windows/Linux) to focus the input
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      if (toggleInput) {
        toggleInput.focus();
      }
    }
  });

  async function submitQuestion(question) {
    if (!supabaseFunctionUrl()) {
      appendMessage('assistant', 'The chat service is not configured yet. Please add your Supabase URL (and anon key if required).');
      return;
    }

    appendMessage('user', question);
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
        'I couldn&apos;t find an answer to that just yet.';
      appendMessage('assistant', answer);
      setStatus('');
    } catch (error) {
      console.error(error);
      appendMessage('assistant', `Sorry, something went wrong. ${error.message}`);
      setStatus('Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }
});
