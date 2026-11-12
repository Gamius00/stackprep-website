// StackPrep: theme toggle, visit attribution and the two forms.
// Only textContent and attributes are written, so nothing can inject markup.
(() => {
  'use strict';

  // Theme toggle: overrides the system setting and remembers the choice.

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
    const render = () => toggle.setAttribute('aria-pressed', String(isDark()));

    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        // Storage blocked: the choice lasts until the page is reloaded.
      }
      render();
    });

    systemDark.addEventListener('change', render);
    toggle.hidden = false;
    render();
  }

  // Attribution: where this visit came from, so we can see what a post or link brings.
  // Read from the URL and the referrer only; nothing is stored in the browser.

  const CAMPAIGN_VALUE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
  const cleanCampaignValue = (value) => {
    const normalized = (value ?? '').trim().toLowerCase();
    return CAMPAIGN_VALUE_PATTERN.test(normalized) ? normalized : '';
  };

  const referrerSources = [
    [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
    [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)tiktok\.com$/, 'tiktok'],
    [/(^|\.)(facebook\.com|fb\.me)$/, 'facebook'],
    [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x'],
    [/(^|\.)reddit\.com$/, 'reddit'],
    [/(^|\.)github\.(com|io)$/, 'github'],
    [/(^|\.)google\.[a-z.]+$/, 'google'],
    [/(^|\.)bing\.com$/, 'bing'],
    [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  ];

  const sourceFromReferrer = () => {
    let host;
    try {
      host = new URL(document.referrer).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
    if (host === window.location.hostname.replace(/^www\./, '')) return '';
    const known = referrerSources.find(([pattern]) => pattern.test(host));
    return known ? known[1] : cleanCampaignValue(host);
  };

  const params = new URLSearchParams(window.location.search);
  const attribution = {
    source: cleanCampaignValue(params.get('utm_source')) || sourceFromReferrer(),
    campaign: cleanCampaignValue(params.get('utm_campaign')),
  };

  document.querySelectorAll('[data-attribution]').forEach((input) => {
    input.value = attribution[input.dataset.attribution] ?? '';
  });

  // Count the visit only when it came through a link with a source.
  if (attribution.source && typeof navigator.sendBeacon === 'function') {
    const visit = new FormData();
    visit.append('quelle', attribution.source);
    visit.append('kampagne', attribution.campaign);
    navigator.sendBeacon('/api/besuch', visit);
  }

  // Forms: progressive enhancement. Without JavaScript they post normally.

  const formMessages = {
    waitlist: {
      pending: 'Wird gesendet …',
      success: 'Fast geschafft. Bestätige deine Anmeldung über den Link in der E-Mail, die wir dir gerade geschickt haben.',
      // Until the confirmation e-mail is set up, the server stores the entry without sending one.
      successNoEmail: 'Danke, du bist vorgemerkt. Wir schicken dir noch eine E-Mail, mit der du deine Anmeldung bestätigst.',
      invalid: 'Bitte gib deine E-Mail-Adresse ein und bestätige beide Häkchen.',
      limited: 'Zu viele Versuche. Bitte warte ein paar Minuten und versuch es dann noch einmal.',
      error: 'Die Anmeldung hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.',
    },
    company: {
      pending: 'Wird gesendet …',
      success: 'Danke für eure Anfrage. Wir melden uns in den nächsten Tagen per E-Mail bei euch.',
      invalid: 'Bitte füllt Firmenname, E-Mail-Adresse und Anzahl der Azubis aus und bestätigt das Häkchen.',
      limited: 'Zu viele Versuche. Bitte wartet ein paar Minuten und versucht es dann noch einmal.',
      error: 'Die Anfrage hat nicht geklappt. Prüft eure Verbindung und versucht es noch einmal.',
    },
  };

  const enhanceForm = (form) => {
    const messages = formMessages[form.dataset.leadForm];
    if (!messages) return;

    // Native validation stays on without JavaScript; with it, errors show inline instead.
    form.noValidate = true;

    const status = form.querySelector('[data-status]');
    const button = form.querySelector('button[type="submit"]');
    const profession = form.querySelector('[name="beruf"]');
    const otherProfession = form.querySelector('[data-other-profession]');
    const syncOtherProfession = () => {
      if (!profession || !otherProfession) return;
      const selected = profession.value === 'andere';
      otherProfession.hidden = !selected;
      otherProfession.querySelector('input').disabled = !selected;
    };
    profession?.addEventListener('change', syncOtherProfession);
    window.addEventListener('pageshow', syncOtherProfession);
    syncOtherProfession();

    const setStatus = (state, message = messages[state]) => {
      status.textContent = message;
      status.dataset.state = state;
    };

    // Reset keeps the attribution, which belongs to the visit, not to the entry.
    const resetForm = () => {
      form.reset();
      syncOtherProfession();
      form.querySelectorAll('[data-attribution]').forEach((input) => {
        input.value = attribution[input.dataset.attribution] ?? '';
      });
    };

    form.addEventListener('input', (event) => {
      if (event.target.matches('[aria-invalid="true"]') && event.target.checkValidity()) {
        event.target.removeAttribute('aria-invalid');
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const invalid = [...form.elements].filter((el) => el.willValidate && !el.checkValidity());
      invalid.forEach((el) => el.setAttribute('aria-invalid', 'true'));
      if (invalid.length > 0) {
        setStatus('invalid');
        invalid[0].focus();
        return;
      }

      // Honeypot: people never see this field, bots tend to fill it.
      if (form.elements.website.value !== '') {
        setStatus('success');
        resetForm();
        return;
      }

      button.disabled = true;
      setStatus('pending');

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          redirect: 'error',
        });
        if (response.status === 400) {
          setStatus('invalid');
          return;
        }
        if (response.status === 429) {
          setStatus('limited');
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json().catch(() => ({}));
        resetForm();
        setStatus(
          'success',
          result.confirmationEmail === false && messages.successNoEmail ? messages.successNoEmail : messages.success,
        );
      } catch {
        setStatus('error');
      } finally {
        button.disabled = false;
      }
    });
  };

  document.querySelectorAll('[data-lead-form]').forEach(enhanceForm);
})();
