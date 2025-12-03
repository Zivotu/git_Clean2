import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';

export default async function partnershipRoutes(app: FastifyInstance) {
  const handler = async (req: any, reply: any) => {
    const body = (req.body as any) || {};
    const fullName = String(body.fullName ?? body.name ?? '').trim();
    const company = String(body.company ?? '').trim();
    const email = String(body.email ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const message = String(body.message ?? '').trim();

    if (!message || message.length < 5) {
      return reply.code(400).send({ ok: false, error: 'message_too_short' });
    }
    if (!email) {
      return reply.code(400).send({ ok: false, error: 'email_required' });
    }

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

    const subjectLine = 'PARTNERSHIP';
    const lines = [
      'New partnership inquiry from Thesara',
      fullName ? `Name: ${fullName}` : null,
      company ? `Company: ${company}` : null,
      email ? `Email: ${email}` : null,
      phone ? `Phone: ${phone}` : null,
      '---',
      message,
    ]
      .filter(Boolean)
      .join('\n\n');

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
      req.log.error({ err }, 'partnership_send_failed');
      return reply.code(500).send({ ok: false, error: 'send_failed' });
    }
  };

  app.route({
    method: 'POST',
    url: '/partnership',
    schema: {
      body: {
        type: 'object',
        required: ['email', 'message'],
        properties: {
          fullName: { type: 'string' },
          name: { type: 'string' },
          company: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    handler,
  });

  app.route({
    method: 'POST',
    url: '/api/partnership',
    schema: {
      body: {
        type: 'object',
        required: ['email', 'message'],
        properties: {
          fullName: { type: 'string' },
          name: { type: 'string' },
          company: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    handler,
  });
}

