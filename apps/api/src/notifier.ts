import 'dotenv/config';
import nodemailer from 'nodemailer';
import { getConfig } from './config.js';
import { db } from './db.js';

// Simple in-memory cache for templates to avoid repeated Firestore reads.
const templateCache: Map<string, { subject?: string; body?: string; updatedAt?: number }> = new Map();
const TEMPLATE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

type MailboxKey = 'admin' | 'welcome' | 'reports';

type Mailbox = {
  key: MailboxKey;
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
  to?: string;
};

export type NotifyUserOptions = {
  email?: string | null;
  mailbox?: MailboxKey;
  context?: string;
};

const cfg = (() => {
  try {
    return getConfig();
  } catch {
    return {
      ADMIN_NOTIFIER: {} as any,
      WELCOME_NOTIFIER: {} as any,
      REPORTS_NOTIFIER: {} as any,
    };
  }
})();

const adminDefaults = cfg.ADMIN_NOTIFIER || {};
const welcomeDefaults = cfg.WELCOME_NOTIFIER || {};
const reportsDefaults = cfg.REPORTS_NOTIFIER || {};

function sanitize(value: unknown): string | undefined {
  if (value == null) return undefined;
  const result = String(value).trim();
  return result ? result : undefined;
}

function coercePort(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const mailboxes: Record<MailboxKey, Mailbox> = {
  admin: {
    key: 'admin',
    host: sanitize(process.env.SMTP_HOST) ?? sanitize(adminDefaults.smtpHost),
    port: coercePort(process.env.SMTP_PORT ?? adminDefaults.smtpPort),
    user: sanitize(process.env.SMTP_USER) ?? sanitize(adminDefaults.smtpUser),
    pass: sanitize(process.env.SMTP_PASS) ?? sanitize(adminDefaults.smtpPass),
    from: sanitize(process.env.ADMIN_EMAIL_FROM) ?? sanitize(adminDefaults.emailFrom),
    to:
      sanitize(process.env.ADMIN_EMAIL_TO) ??
      sanitize(adminDefaults.emailTo) ??
      'activity@thesara.space',
  },
  welcome: {
    key: 'welcome',
    host:
      sanitize(process.env.WELCOME_SMTP_HOST) ??
      sanitize(welcomeDefaults.smtpHost) ??
      sanitize(process.env.SMTP_HOST) ??
      sanitize(adminDefaults.smtpHost),
    port: coercePort(
      process.env.WELCOME_SMTP_PORT ??
      welcomeDefaults.smtpPort ??
      process.env.SMTP_PORT ??
      adminDefaults.smtpPort,
    ),
    user:
      sanitize(process.env.WELCOME_SMTP_USER) ??
      sanitize(welcomeDefaults.smtpUser) ??
      sanitize(process.env.SMTP_USER) ??
      sanitize(adminDefaults.smtpUser),
    pass:
      sanitize(process.env.WELCOME_SMTP_PASS) ??
      sanitize(welcomeDefaults.smtpPass) ??
      sanitize(process.env.SMTP_PASS) ??
      sanitize(adminDefaults.smtpPass),
    from:
      sanitize(process.env.WELCOME_EMAIL_FROM) ??
      sanitize(welcomeDefaults.emailFrom) ??
      'welcome@thesara.space',
  },
  reports: {
    key: 'reports',
    host:
      sanitize(process.env.REPORTS_SMTP_HOST) ??
      sanitize(reportsDefaults.smtpHost) ??
      sanitize(process.env.SMTP_HOST) ??
      sanitize(adminDefaults.smtpHost),
    port: coercePort(
      process.env.REPORTS_SMTP_PORT ??
      reportsDefaults.smtpPort ??
      process.env.SMTP_PORT ??
      adminDefaults.smtpPort,
    ),
    user:
      sanitize(process.env.REPORTS_SMTP_USER) ??
      sanitize(reportsDefaults.smtpUser) ??
      sanitize(process.env.SMTP_USER) ??
      sanitize(adminDefaults.smtpUser),
    pass:
      sanitize(process.env.REPORTS_SMTP_PASS) ??
      sanitize(reportsDefaults.smtpPass) ??
      sanitize(process.env.SMTP_PASS) ??
      sanitize(adminDefaults.smtpPass),
    from:
      sanitize(process.env.REPORTS_EMAIL_FROM) ??
      sanitize(reportsDefaults.emailFrom) ??
      'reports@thesara.space',
    to:
      sanitize(process.env.REPORTS_EMAIL_TO) ??
      sanitize(reportsDefaults.emailTo) ??
      'reports@thesara.space',
  },
};

if (!mailboxes.admin.user && mailboxes.admin.from) {
  mailboxes.admin.user = mailboxes.admin.from;
}
if (!mailboxes.welcome.user && mailboxes.welcome.from) {
  mailboxes.welcome.user = mailboxes.welcome.from;
}
if (!mailboxes.reports.user && mailboxes.reports.from) {
  mailboxes.reports.user = mailboxes.reports.from;
}

function missingFields(mailbox: Mailbox, requireTo: boolean): string[] {
  const miss: string[] = [];
  if (!mailbox.host) miss.push('smtpHost');
  if (!mailbox.port) miss.push('smtpPort');
  if (!mailbox.user) miss.push('smtpUser');
  if (!mailbox.pass) miss.push('smtpPass');
  if (!mailbox.from) miss.push('emailFrom');
  if (requireTo && !mailbox.to) miss.push('emailTo');
  return miss;
}

function prepareMailbox(
  key: MailboxKey,
  context: string,
  requireTo = false,
): { key: MailboxKey; mailbox: Mailbox } | null {
  const selected = mailboxes[key];
  const missing = missingFields(selected, requireTo);
  if (!missing.length) return { key, mailbox: selected };

  if (key !== 'admin') {
    const fallback = mailboxes.admin;
    const fallbackMissing = missingFields(fallback, requireTo);
    if (!fallbackMissing.length) {
      console.warn(
        { context, mailbox: key, missing, fallback: 'admin' },
        'mailbox_config_missing_fallback',
      );
      return { key: 'admin', mailbox: fallback };
    }
  }

  console.warn({ context, mailbox: key, missing }, 'mailbox_not_configured');
  return null;
}

function createTransportOptions(mailbox: Mailbox) {
  return {
    host: mailbox.host!,
    port: mailbox.port!,
    secure: mailbox.port === 465,
    auth: {
      user: mailbox.user!,
      pass: mailbox.pass!,
    },
  };
}

function sanitizeEmailAddress(value: string | null | undefined): string | undefined {
  const trimmed = sanitize(value);
  if (!trimmed) return undefined;
  if (!trimmed.includes('@')) return undefined;
  return trimmed;
}

async function lookupUserEmail(uid: string): Promise<string | undefined> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return undefined;
    const data = snap.data() as any;
    const primary = sanitizeEmailAddress(data?.email);
    if (primary) return primary;
    const nested =
      sanitizeEmailAddress(data?.contactEmail) ??
      sanitizeEmailAddress(data?.emails?.primary);
    return nested ?? undefined;
  } catch (err) {
    console.error(err, 'lookup_user_email_failed');
    return undefined;
  }
}

async function dispatchMail(
  mailboxKey: MailboxKey,
  to: string,
  subject: string,
  body: string,
  context: string,
): Promise<void> {
  const prepared = prepareMailbox(mailboxKey, context, false);
  if (!prepared) return;
  const { mailbox, key } = prepared;

  try {
    const transporter = nodemailer.createTransport(createTransportOptions(mailbox));
    await transporter.sendMail({ from: mailbox.from!, to, subject, text: body });
  } catch (err) {
    console.error({ err, to, context, mailbox: key }, 'mail_send_failed');
  }
}

export async function notifyAdmins(subject: string, body: string): Promise<void> {
  const prepared = prepareMailbox('admin', 'notifyAdmins', true);
  if (!prepared) return;
  const { mailbox } = prepared;
  const to = mailbox.to;
  if (!to) {
    console.warn({ context: 'notifyAdmins' }, 'admin_mailbox_missing_recipient');
    return;
  }
  try {
    const transporter = nodemailer.createTransport(createTransportOptions(mailbox));
    await transporter.sendMail({ from: mailbox.from!, to, subject, text: body });
  } catch (err) {
    console.error({ err, to, subject }, 'notify_admins_failed');
  }
}

export async function notifyReports(subject: string, body: string): Promise<void> {
  const prepared = prepareMailbox('reports', 'notifyReports', true);
  if (!prepared) return;
  const { mailbox } = prepared;
  const to = mailbox.to;
  if (!to) {
    console.warn({ context: 'notifyReports' }, 'reports_mailbox_missing_recipient');
    return;
  }
  try {
    const transporter = nodemailer.createTransport(createTransportOptions(mailbox));
    await transporter.sendMail({ from: mailbox.from!, to, subject, text: body });
  } catch (err) {
    console.error({ err, to, subject }, 'notify_reports_failed');
  }
}

export async function notifyUser(
  uid: string,
  subject: string,
  body: string,
  options: NotifyUserOptions = {},
): Promise<void> {
  const mailboxKey = options.mailbox ?? 'admin';
  const context = options.context ?? `notifyUser:${mailboxKey}`;
  const email =
    sanitizeEmailAddress(options.email ?? undefined) ?? (await lookupUserEmail(uid));

  if (!email) {
    console.warn({ uid, subject, mailbox: mailboxKey }, 'notify_user_missing_email');
    return;
  }

  await dispatchMail(mailboxKey, email, subject, body, context);
}

async function fetchTemplate(id: string) {
  const now = Date.now();
  const cached = templateCache.get(id);
  if (cached && cached.updatedAt && now - cached.updatedAt < TEMPLATE_CACHE_TTL) return cached;
  try {
    const doc = await db.collection('emailTemplates').doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as any;
    const next = { subject: data?.subject, body: data?.body, updatedAt: Date.now() };
    templateCache.set(id, next);
    return next;
  } catch (err) {
    console.error({ err, id }, 'fetch_template_failed');
    return null;
  }
}

function escapePlainText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplate(tmpl: string | undefined, data: Record<string, unknown> = {}): string {
  if (!tmpl) return '';
  return tmpl.replace(/{{\s*([a-zA-Z0-9_:-]+)\s*}}/g, (_m, key) => {
    const v = data?.[key];
    return escapePlainText(v);
  });
}

function getMailboxForTemplate(id: string): MailboxKey {
  if (!id) return 'admin';
  if (id.startsWith('welcome')) return 'welcome';
  if (id.startsWith('review:') || id.startsWith('publish:') || id.startsWith('reports')) return 'reports';
  return 'admin';
}

// Known fallback templates used when no stored template exists. Keep minimal safe text.
function getFallbackTemplate(id: string, locale?: string): { subject: string; body: string } | null {
  const lang = locale?.toLowerCase().slice(0, 2) || 'en';

  switch (id) {
    case 'welcome':
      if (lang === 'hr') {
        return {
          subject: 'Dobrodošli u Thesaru',
          body: 'Bok {{displayName}},\n\nDobrodošli u Thesaru! Spremni smo pomoći vam u stvaranju i objavi vaših aplikacija.\n\n🎉 ČESTITAMO! 🎉\nJedan ste od prvih 100 registriranih korisnika!\n\nKao dio naše Early Access kampanje, imate priliku dobiti 3 MJESECA BESPLATNOG GOLD PLANA!\n\nŠto trebate učiniti:\n✓ Objavite jednu aplikaciju unutar 15 dana od registracije\n✓ To je sve! Nakon što objavite aplikaciju, automatski ćete dobiti Gold plan na 3 mjeseca\n\nNapomena: Ako ne objavite aplikaciju unutar 15 dana, to mjesto će biti dodijeljeno drugom korisniku.\n\nAko trebate pomoć, javite nam se na {{supportEmail}}.\n\nSretno!\nTHESARA tim',
        };
      } else if (lang === 'de') {
        return {
          subject: 'Willkommen bei Thesara',
          body: 'Hallo {{displayName}},\n\nWillkommen bei Thesara! Wir sind bereit, Ihnen beim Erstellen und Veröffentlichen Ihrer Anwendungen zu helfen.\n\n🎉 HERZLICHEN GLÜCKWUNSCH! 🎉\nSie gehören zu den ersten 100 registrierten Benutzern!\n\nAls Teil unserer Early Access-Kampagne haben Sie die Möglichkeit, 3 MONATE KOSTENLOSEN GOLD-PLAN zu erhalten!\n\nWas Sie tun müssen:\n✓ Veröffentlichen Sie eine Anwendung innerhalb von 15 Tagen nach der Registrierung\n✓ Das ist alles! Nach der Veröffentlichung Ihrer Anwendung erhalten Sie automatisch den Gold-Plan für 3 Monate\n\nHinweis: Wenn Sie innerhalb von 15 Tagen keine Anwendung veröffentlichen, wird dieser Platz einem anderen Benutzer zugewiesen.\n\nWenn Sie Hilfe benötigen, kontaktieren Sie uns unter {{supportEmail}}.\n\nViel Erfolg!\nTHESARA Team',
        };
      } else {
        // Default to English
        return {
          subject: 'Welcome to Thesara',
          body: 'Hi {{displayName}},\n\nWelcome to Thesara! We\'re ready to help you create and publish your applications.\n\n🎉 CONGRATULATIONS! 🎉\nYou are one of the first 100 registered users!\n\nAs part of our Early Access campaign, you have the opportunity to get 3 MONTHS OF FREE GOLD PLAN!\n\nWhat you need to do:\n✓ Publish one application within 15 days of registration\n✓ That\'s it! After you publish your application, you\'ll automatically receive the Gold plan for 3 months\n\nNote: If you don\'t publish an application within 15 days, that spot will be given to another user.\n\nIf you need help, contact us at {{supportEmail}}.\n\nGood luck!\nTHESARA team',
        };
      }
    case 'review:approval_notification':
      return {
        subject: 'Vaša aplikacija "{{appTitle}}" je odobrena',
        body: 'Bok {{displayName}},\n\nVaša aplikacija "{{appTitle}}" (ID: {{appId}}) je odobrena i objavljena.\n\nLink za upravljanje: {{manageUrl}}\n\nTHESARA tim',
      };
    case 'review:reject_notification':
      return {
        subject: 'Aplikacija "{{appTitle}}" nije prihvaćena',
        body: 'Bok {{displayName}},\n\nNažalost, Vaša aplikacija "{{appTitle}}" (ID: {{appId}}) nije prošla pregled.\nRazlog: {{reason}}\n\nMožete urediti aplikaciju i ponovno je poslati.\n\nTHESARA tim',
      };
    case 'publish:pending_notification':
      return {
        subject: 'Vaša aplikacija "{{appTitle}}" čeka odobrenje',
        body: 'Bok {{displayName}},\n\nZaprimili smo vaš zahtjev za objavu aplikacije "{{appTitle}}". Naš tim će pregledati sadržaj i obavijestiti vas o odluci.\n\nTHESARA tim',
      };
    default:
      return null;
  }
}

export async function sendTemplate(
  templateId: string,
  to: string,
  data: Record<string, unknown> = {},
  mailboxKey?: MailboxKey,
  locale?: string,
): Promise<void> {
  const tmpl = (await fetchTemplate(templateId)) ?? getFallbackTemplate(templateId, locale);
  if (!tmpl) {
    console.warn({ templateId }, 'template_not_found');
    return;
  }
  const subject = renderTemplate(tmpl.subject, data);
  const body = renderTemplate(tmpl.body, data);
  const mailbox = mailboxKey ?? getMailboxForTemplate(templateId);
  await dispatchMail(mailbox, to, subject, body, `template:${templateId}`);
}

export async function sendTemplateToUser(
  templateId: string,
  uid: string,
  data: Record<string, unknown> = {},
  options: Omit<NotifyUserOptions, 'mailbox'> & { locale?: string } = {},
): Promise<void> {
  const email = sanitizeEmailAddress(options.email ?? undefined) ?? (await lookupUserEmail(uid));
  if (!email) return;
  // Merge user data (lookup) into data if available
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const u = snap.data() as any;
      if (u?.displayName && !data.displayName) data.displayName = u.displayName;
      if (u?.email && !data.email) data.email = u.email;
    }
  } catch (err) {
    // ignore
  }
  const mailbox = getMailboxForTemplate(templateId);
  await sendTemplate(templateId, email, data, mailbox, options.locale);
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  mailbox: MailboxKey = 'admin',
): Promise<void> {
  const email = sanitizeEmailAddress(to);
  if (!email) {
    console.warn({ to }, 'send_email_invalid_recipient');
    return;
  }
  await dispatchMail(mailbox, email, subject, body, 'sendEmail');
}

export async function sendWelcomeEmail(
  uid: string,
  subject: string,
  body: string,
  options: Omit<NotifyUserOptions, 'mailbox'> = {},
): Promise<void> {
  await notifyUser(uid, subject, body, {
    ...options,
    mailbox: 'welcome',
    context: options.context ?? 'sendWelcomeEmail',
  });
}

export async function notifyUserModeration(
  uid: string,
  subject: string,
  body: string,
  options: Omit<NotifyUserOptions, 'mailbox'> = {},
): Promise<void> {
  await notifyUser(uid, subject, body, {
    ...options,
    mailbox: 'reports',
    context: options.context ?? 'notifyUserModeration',
  });
}
