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
  const overlayInput = widget.querySelector('[data-askchaira-input-overlay]');
  const suggestionsEl = widget.querySelector('[data-askchaira-suggestions]');
  const clearButton = widget.querySelector('[data-askchaira-clear]');

  console.log('Widget elements found:', {
    widget: !!widget,
    toggleInput: !!toggleInput,
    overlay: !!overlay,
    closeButton: !!closeButton,
    messagesEl: !!messagesEl,
    statusEl: !!statusEl
  });

  // Cycling placeholders
  // const placeholders = [
  //   "What work has Chaira done related to financial tech?",
  //   "What is Chaira's primary stack?",
  //   "What is Chaira's experience with educational technology?",
  //   "How long has Chaira been coding?",
  //   "How many countries has Chaira lived in?",
  //   "What are some of Chaira's major projects?",
  //   "What are some awards or recognitions Chaira has received?"
  // ];

  const placeholders = [
    "What type of apps can Chaira build?",
    "Can Chaira manage full-stack apps",
    "Has Chaira led developer teams?",
    "What tools does she work with?",
    "Where did Chaira study CS?",
    "What projects has Chaira built?",
    "What startups has Chaira founded?",
    "How long has Chaira been coding?"
  ];
  
  let placeholderIndex = 0;
  
  function cyclePlaceholder() {
    if (toggleInput && !toggleInput.value) {
      toggleInput.placeholder = placeholders[placeholderIndex];
      placeholderIndex = (placeholderIndex + 1) % placeholders.length;
    }
  }
  
  // Start cycling placeholders every 3 seconds
  setInterval(cyclePlaceholder, 3000);

  // All suggestion questions for cycling
  const allSuggestions = [
    "How can I get in touch with Chaira?",
    "Is Chaira more experienced in PM or SWE?",
    "What is Chaira's latest work?",
    "What type of projects does Chaira enjoy most?",
    "What tech stack does Chaira use now?",
    "Has Chaira worked with startups before?",
    "What kind of roles interest Chaira most?",
    "Can Chaira lead a development team?",
    "What industries has Chaira built for?",
    "Where can I learn more about Chaira's work?",
    "What is Chaira currently building?",
    "Does Chaira have experience in fintech?",
    "Has Chaira launched any products?",
    "What are Chaira's strongest technical skills?",
    "How does Chaira approach problem solving?",
    "What inspires Chaira's project ideas?",
    "Has Chaira collaborated internationally?",
    "What impact-focused work has she done?",
    "How does Chaira stay up to date with tech?",
    "What motivates Chaira as a developer?",
    "How does Chaira approach system design?",
    "What tradeoffs has she faced when scaling projects?",
    "How does Chaira prioritize between speed and quality?",
    "What's Chaira's philosophy on product-market fit?",
    "How does she decide what features to build first?",
    "Has Chaira managed technical debt in past builds?",
    "How does Chaira align engineering with user needs?",
    "What's a technical challenge she recently solved?",
    "How does Chaira handle cross-functional collaboration?",
    "What's Chaira's approach to validating new ideas?",
    "Has she led a product from concept to launch?",
    "How does Chaira measure success in her projects?",
    "What frameworks does Chaira use for decision-making?",
    "Has she worked with data-driven product strategy?",
    "How does she balance innovation with reliability?"
  ];
  
  
  let suggestionSetIndex = 0;
  
  function cycleSuggestions() {
    if (!suggestionsEl) return;
    
    // Get 4 suggestions for current set
    const startIndex = suggestionSetIndex * 4;
    const currentSuggestions = allSuggestions.slice(startIndex, startIndex + 4);
    
    // If we don't have 4 suggestions from current position, wrap around
    if (currentSuggestions.length < 4) {
      const remaining = 4 - currentSuggestions.length;
      currentSuggestions.push(...allSuggestions.slice(0, remaining));
    }
    
    // Update the suggestion boxes
    const suggestionBoxes = suggestionsEl.querySelectorAll('.askchaira-suggestion');
    suggestionBoxes.forEach((box, index) => {
      if (currentSuggestions[index]) {
        box.textContent = currentSuggestions[index];
        box.setAttribute('data-suggestion', currentSuggestions[index]);
      }
    });
    
    // Move to next set
    suggestionSetIndex = (suggestionSetIndex + 1) % Math.ceil(allSuggestions.length / 4);
  }

  const supabaseUrl = (widget.getAttribute('data-supabase-url') || '').trim();
  const anonKey = (widget.getAttribute('data-anon-key') || '').trim();
  const SESSION_KEY = 'askkai_session_id';
  const CHAT_KEY = 'askkai_chat_v1';
  const DEFAULT_SOURCES = ['website', 'resume', 'about'];
  let chatTranscript = [];

  function supabaseFunctionUrl() {
    if (!supabaseUrl) {
      return '';
    }
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ask`;
  }

  function getSessionId() {
    try {
      const existing = localStorage.getItem(SESSION_KEY);
      if (existing) {
        return existing;
      }
      const generated = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, generated);
      return generated;
    } catch (error) {
      console.warn('Unable to access session storage, generating ephemeral session', error);
      return crypto.randomUUID();
    }
  }

  function loadChat() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Unable to load stored chat history', error);
      return [];
    }
  }

  function saveChat() {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(chatTranscript));
    } catch (error) {
      console.warn('Unable to save chat history', error);
    }
  }

  function clearChat() {
    chatTranscript = [];
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch (error) {
      console.warn('Unable to clear chat history', error);
    }
    renderChat();
  }

  function appendTurn(userText, assistantText) {
    const timestamp = Date.now();
    chatTranscript.push({ role: 'user', content: userText, ts: timestamp });
    chatTranscript.push({ role: 'assistant', content: assistantText, ts: Date.now() });
    saveChat();
    renderChat();
  }

  function getSelectedSources() {
    const toggles = widget.querySelectorAll('[data-askchaira-source]');
    if (!toggles.length) {
      return DEFAULT_SOURCES;
    }
    const selected = [];
    toggles.forEach((toggle) => {
      const source = toggle.getAttribute('data-askchaira-source');
      const isActive = toggle.matches('input, textarea, select')
        ? toggle.checked
        : toggle.getAttribute('aria-pressed') === 'true' || toggle.classList.contains('is-active');
      if (isActive && source) {
        selected.push(source);
      }
    });
    return selected.length ? selected : DEFAULT_SOURCES;
  }

  function renderChat() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    chatTranscript.forEach((entry, index) => {
      appendMessage(entry.role, entry.content, index === chatTranscript.length - 1);
    });
  }

  function appendMessage(role, text, shouldScroll = true) {
    if (!messagesEl) {
      return;
    }
    const bubble = document.createElement('div');
    bubble.className = `askchaira-bubble ${role}`;
    
    const htmlContent = role === 'assistant'
      ? mdToHtml(text)
      : escapeHtml(text).replace(/\n/g, '<br>');
    bubble.innerHTML = htmlContent;
    
    messagesEl.appendChild(bubble);
    if (shouldScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function escapeHtml(input) {
    return (input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mdToHtml(text) {
    const escaped = escapeHtml(text);
    if (!escaped) {
      return '<p></p>';
    }

    let html = escaped;

    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
    });

    html = html.replace(/(^|[\s>])(https?:\/\/[^\s<]+)/g, (_match, prefix, url) => {
      return `${prefix}<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
    });

    html = html.replace(/\[#(\d+)\]\s*([^,\n]+)/g, (_match, num, text) => `<sup class="cite">[${num}] ${text}</sup>`);

    const paragraphs = html.split(/\n{2,}/);
    const withParagraphs = paragraphs
      .map((paragraph) => paragraph.replace(/\n/g, '<br>'))
      .map((paragraph) => `<p>${paragraph}</p>`);

    return withParagraphs.join('') || '<p></p>';
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
    if (overlayInput) {
      overlayInput.readOnly = isLoading;
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
      renderChat();
    } else {
      overlay.setAttribute('hidden', '');
      toggleInput.setAttribute('aria-expanded', 'false');
      toggleInput.value = '';
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
    } else if (event.key === 'Tab') {
      event.preventDefault();
      // Type out the current placeholder text
      const currentPlaceholder = toggleInput.placeholder;
      if (currentPlaceholder && !toggleInput.value) {
        toggleInput.value = currentPlaceholder;
        // Position cursor at the end
        setTimeout(() => {
          toggleInput.setSelectionRange(currentPlaceholder.length, currentPlaceholder.length);
        }, 0);
      }
    }
  });

  overlayInput?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const question = overlayInput.value.trim();
      if (question) {
        await submitQuestion(question);
        overlayInput.value = '';
      }
    }
  });

  // Add click listeners to all suggestion boxes
  suggestionsEl?.addEventListener('click', async (event) => {
    const suggestion = event.target.closest('.askchaira-suggestion');
    if (suggestion) {
      const question = suggestion.getAttribute('data-suggestion');
      if (question) {
        await submitQuestion(question);
      }
    }
  });

  closeButton?.addEventListener('click', () => {
    togglePanel(false);
  });

  clearButton?.addEventListener('click', () => {
    clearChat();
    setStatus('');
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

  chatTranscript = loadChat();
  renderChat();
  getSessionId();

  async function submitQuestion(question) {
    appendMessage('user', question);

    if (!supabaseFunctionUrl()) {
      appendTurn(question, 'The chat service is not configured yet. Please add your Supabase URL (and anon key if required).');
      return;
    }

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
        body: JSON.stringify({
          query: question,
          sources: getSelectedSources(),
          session_id: getSessionId(),
          user_label: 'guest'
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = payload.error || `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      const rawAnswer =
        payload.answer ||
        payload.result ||
        (Array.isArray(payload.choices) && payload.choices[0]?.message?.content) ||
        'I couldn&apos;t find an answer to that just yet.';
      const matches = Array.isArray(payload.matches) ? payload.matches : [];
      const citationLines = matches
        .map((match, index) => {
          const label = match?.title || match?.source || `Source ${index + 1}`;
          const url = match?.url ? ` - ${match.url}` : '';
          return `[#${index + 1}] ${label}${url}`;
        })
        .join('\n');
      const answer = citationLines ? `${rawAnswer}\n\n${citationLines}` : rawAnswer;
      appendTurn(question, answer);
      setStatus('');
      
      // Cycle suggestions after assistant response
      cycleSuggestions();
    } catch (error) {
      console.error(error);
      appendTurn(question, `Sorry, something went wrong. ${error.message}`);
      setStatus('Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }
});
