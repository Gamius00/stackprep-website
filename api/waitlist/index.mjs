// POST /api/waitlist: the waitlist form on the landing page.
import {
  CONSENT_TEXT_VERSION,
  PROFESSIONS,
  callConvex,
  createToken,
  hashToken,
  isAllowedOrigin,
  isBodyTooLarge,
  isConfirmationEmailEnabled,
  isValidEmail,
  jsonResponse,
  normalizeEmail,
  pageResponse,
  rateLimitKey,
  readAttribution,
  sendConfirmationEmail,
} from '../_lib/waitlist.mjs';

// Answers for browsers without JavaScript, which post the form directly.
const pages = {
  success: () =>
    isConfirmationEmailEnabled()
      ? { title: 'Fast geschafft', message: 'Bestätige deine Anmeldung über den Link in der E-Mail, die wir dir gerade geschickt haben.' }
      : { title: 'Danke für deine Anmeldung', message: 'Du bist vorgemerkt. Wir schicken dir noch eine E-Mail, mit der du deine Anmeldung bestätigst.' },
  invalid: () => ({ title: 'Das hat nicht geklappt', message: 'Bitte gib deine E-Mail-Adresse ein und bestätige beide Häkchen.' }),
  limited: () => ({ title: 'Zu viele Versuche', message: 'Bitte warte ein paar Minuten und versuch es dann noch einmal.' }),
  error: () => ({ title: 'Das hat nicht geklappt', message: 'Die Anmeldung hat nicht geklappt. Bitte versuch es später noch einmal.' }),
};

const statusCodes = { success: 200, invalid: 400, forbidden: 403, limited: 429, error: 502 };

export async function POST(request) {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const respond = (state) => {
    const status = statusCodes[state];
    if (wantsJson) {
      return jsonResponse(status, {
        ok: state === 'success',
        state,
        confirmationEmail: isConfirmationEmailEnabled(),
      });
    }
    return pageResponse(status, (pages[state] ?? pages.error)());
  };

  if (!isAllowedOrigin(request)) return respond('forbidden');
  if (isBodyTooLarge(request)) return respond('invalid');

  let form;
  try {
    form = await request.formData();
  } catch {
    return respond('invalid');
  }

  // Honeypot: bots get the same answer as people, but nothing is stored.
  if (form.get('website')) return respond('success');

  const email = normalizeEmail(form.get('email'));
  // The profession is optional; an empty choice means "not given".
  const profession = form.get('beruf') || undefined;
  const otherValue = form.get('berufAndere');
  const professionOther = profession === 'andere' && typeof otherValue === 'string'
    ? otherValue.trim().replace(/\s+/g, ' ') || undefined
    : undefined;
  if (
    !isValidEmail(email) ||
    form.get('alter') !== '16plus' ||
    form.get('einwilligung') !== 'ja' ||
    (profession !== undefined && !PROFESSIONS.has(profession)) ||
    (profession === 'andere' && otherValue !== null &&
      (typeof otherValue !== 'string' || otherValue.length > 120))
  ) {
    return respond('invalid');
  }

  try {
    const token = createToken();
    const result = await callConvex('/waitlist/signup', {
      email,
      consentTextVersion: CONSENT_TEXT_VERSION,
      rateLimitKey: rateLimitKey(request),
      confirmationTokenHash: hashToken(token),
      profession,
      professionOther,
      ...readAttribution(form),
    });

    if (result.status === 'rate_limited') return respond('limited');

    // Already confirmed or a link was sent minutes ago: answer the same way,
    // so the form does not reveal which addresses are on the list.
    if (result.sendConfirmation && isConfirmationEmailEnabled()) {
      await sendConfirmationEmail(email, token);
    }
    return respond('success');
  } catch (error) {
    console.error('[waitlist] signup failed', error instanceof Error ? error.message : error);
    return respond('error');
  }
}
