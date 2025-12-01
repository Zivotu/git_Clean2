import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function teamApplicationsRoutes(app: FastifyInstance) {
  const handler = async (req: any, reply: any) => {
    const body = (req.body as Record<string, unknown>) || {};

    const firstName = String(body.firstName ?? body.name ?? '').trim();
    const lastName = String(body.lastName ?? body.surname ?? '').trim();
    const faculty = String(body.faculty ?? '').trim();
    const birthYear = String(body.birthYear ?? body.yearOfBirth ?? '').trim();
    const studyYear = String(body.studyYear ?? body.yearOfStudy ?? '').trim();
    const firstImpression = String(body.firstImpression ?? '').trim();
    const contribution = String(body.contribution ?? body.howCanYouContribute ?? '').trim();
    const extraComment = String(body.extraComment ?? body.additionalNotes ?? '').trim();
    const contactEmail = String(body.contactEmail ?? body.email ?? '').trim();
    const phone = String(body.phone ?? body.phoneNumber ?? '').trim();
    const sourcePage = String(body.page ?? body.source ?? '').trim();

    if (!firstName) {
      return reply.code(400).send({ ok: false, error: 'first_name_required' });
    }
    if (!lastName) {
      return reply.code(400).send({ ok: false, error: 'last_name_required' });
    }
    if (!faculty) {
      return reply.code(400).send({ ok: false, error: 'faculty_required' });
    }
    if (!birthYear) {
      return reply.code(400).send({ ok: false, error: 'birth_year_required' });
    }
    if (!studyYear) {
      return reply.code(400).send({ ok: false, error: 'study_year_required' });
    }
    if (!firstImpression || firstImpression.length < 5) {
      return reply.code(400).send({ ok: false, error: 'first_impression_required' });
    }
    if (!contribution || contribution.length < 5) {
      return reply.code(400).send({ ok: false, error: 'contribution_required' });
    }
    if (!contactEmail || !EMAIL_REGEX.test(contactEmail)) {
      return reply.code(400).send({ ok: false, error: 'invalid_email' });
    }
    const digitsOnly = phone.replace(/\D+/g, '');
    if (!phone || digitsOnly.length < 6) {
      return reply.code(400).send({ ok: false, error: 'invalid_phone' });
    }

    const host =
      process.env.WELCOME_SMTP_HOST ||
      process.env.SMTP_HOST ||
      process.env.REPORTS_SMTP_HOST;
    const port =
      Number(process.env.WELCOME_SMTP_PORT || process.env.SMTP_PORT || process.env.REPORTS_SMTP_PORT || 0) || undefined;
    const user =
      process.env.WELCOME_SMTP_USER ||
      process.env.SMTP_USER ||
      process.env.REPORTS_SMTP_USER;
    const pass =
      process.env.WELCOME_SMTP_PASS ||
      process.env.SMTP_PASS ||
      process.env.REPORTS_SMTP_PASS;
    const from =
      process.env.WELCOME_EMAIL_FROM ||
      process.env.ADMIN_EMAIL_FROM ||
      user ||
      'welcome@thesara.space';
    const to = 'welcome@thesara.space';

    if (!host || !user || !pass) {
      req.log.error({ host, user }, 'team_application_smtp_missing');
      return reply.code(500).send({ ok: false, error: 'smtp_config_missing' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: port || 465,
      secure: Boolean(port === 465),
      auth: { user, pass },
    });

    const lines = [
      'Nova prijava za Thesara tim',
      `Ime: ${firstName}`,
      `Prezime: ${lastName}`,
      `Fakultet: ${faculty}`,
      `Godište: ${birthYear}`,
      `Godina studija: ${studyYear}`,
      `Prvi dojam: ${firstImpression}`,
      `Kako može doprinijeti: ${contribution}`,
      extraComment ? `Dodatni komentar/pitanje: ${extraComment}` : null,
      `Kontakt e-mail: ${contactEmail}`,
      `Broj mobitela: ${phone}`,
      sourcePage ? `Izvor: ${sourcePage}` : null,
      `Primljeno: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'Nova prijava za Thesara tim',
        text: lines,
        replyTo: contactEmail || undefined,
      });
      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'team_application_send_failed');
      return reply.code(500).send({ ok: false, error: 'send_failed' });
    }
  };

  const schema = {
    body: {
      type: 'object',
      required: [
        'firstName',
        'lastName',
        'faculty',
        'birthYear',
        'studyYear',
        'firstImpression',
        'contribution',
        'contactEmail',
        'phone',
      ],
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        faculty: { type: 'string' },
        birthYear: { type: 'string' },
        studyYear: { type: 'string' },
        firstImpression: { type: 'string' },
        contribution: { type: 'string' },
        extraComment: { type: 'string' },
        contactEmail: { type: 'string' },
        phone: { type: 'string' },
        page: { type: 'string' },
      },
    },
  };

  app.route({
    method: 'POST',
    url: '/team-application',
    schema,
    handler,
  });

  app.route({
    method: 'POST',
    url: '/api/team-application',
    schema,
    handler,
  });
}
