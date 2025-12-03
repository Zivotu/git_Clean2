import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';

export default async function feedbackRoutes(app: FastifyInstance) {
  // Central handler shared by both '/feedback' and '/api/feedback' to be compatible
  const handler = async (req: any, reply: any) => {
    const body = (req.body as any) || {};
    const message = String(body.message || '').trim();
    if (!message || message.length < 5) {
      return reply.code(400).send({ ok: false, error: 'message_too_short' });
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const subject = String(body.subject || 'Prijedlog za Thesara').trim();
    const page = String(body.page || '').trim();

    // Read SMTP config from env
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 0) || undefined;
    const user = process.env.SMTP_USER || process.env.REPORTS_SMTP_USER || process.env.REPORTS_SMTP_USER;
    const pass = process.env.SMTP_PASS || process.env.REPORTS_SMTP_PASS;
    const from = process.env.REPORTS_EMAIL_FROM || process.env.ADMIN_EMAIL_FROM || user || 'reports@thesara.space';
    const to = 'activity@thesara.space';

    if (!host || !user || !pass) {
      req.log.error({ host, user }, 'smtp_config_missing');
      return reply.code(500).send({ ok: false, error: 'smtp_config_missing' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: port || 465,
      secure: Boolean(port === 465),
      auth: { user, pass },
    });

    const subjectLine = `[Prijedlog] ${subject}`;
    const lines = [
      'Nova poruka prijedloga iz Thesara',
      page ? `Stranica: ${page}` : null,
      name ? `Ime: ${name}` : null,
      email ? `Email: ${email}` : null,
      '---',
      message,
    ].filter(Boolean).join('\n\n');

    try {
      await transporter.sendMail({
        from,
        to,
        subject: subjectLine,
        text: lines,
        replyTo: email || undefined,
      });
      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'feedback_send_failed');
      return reply.code(500).send({ ok: false, error: 'send_failed' });
    }
  };

  // Register both paths: '/feedback' and '/api/feedback' to be robust against proxy prefixes
  app.route({ method: 'POST', url: '/feedback', schema: { body: {
    type: 'object', required: ['message'], properties: {
      name: { type: 'string' }, email: { type: 'string' }, subject: { type: 'string' }, message: { type: 'string' }, page: { type: 'string' }
    }
  } }, handler });

  app.route({ method: 'POST', url: '/api/feedback', schema: { body: {
    type: 'object', required: ['message'], properties: {
      name: { type: 'string' }, email: { type: 'string' }, subject: { type: 'string' }, message: { type: 'string' }, page: { type: 'string' }
    }
  } }, handler });
}
