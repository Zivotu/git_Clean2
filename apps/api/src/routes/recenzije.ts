import type { FastifyInstance } from 'fastify';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { Recenzija } from '../models/Recenzija.js';

async function getUidFromRequest(req: any): Promise<string | undefined> {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    try {
      const decoded = await getAuth().verifyIdToken(token);
      return decoded.uid;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export default async function recenzijeRoutes(app: FastifyInstance) {
  const db = getFirestore();

  // Create a review — allow any authenticated user, but only one review per user per oglas
  app.post('/recenzije', async (req, reply) => {
    const uid = await getUidFromRequest(req);
    if (!uid) return reply.code(401).send({ ok: false, error: 'unauthenticated' });

    const { oglas, ocjena, komentar } = (req.body as any) || {};
    if (typeof oglas !== 'number' || typeof ocjena !== 'number') {
      return reply.code(400).send({ ok: false, error: 'invalid_input' });
    }

    // Enforce single review per user per oglas
    const existing = await db
      .collection('recenzije')
      .where('oglas', '==', oglas)
      .where('korisnik', '==', uid)
      .limit(1)
      .get();
    if (!existing.empty) {
      return reply.code(403).send({ ok: false, error: 'already_reviewed' });
    }

    const rec: Recenzija = {
      oglas,
      korisnik: uid,
      ocjena,
      komentar: komentar || '',
      datum: new Date().toISOString(),
    };
    await db.collection('recenzije').add(rec);
    return { ok: true };
  });

  // Fetch reviews for an oglas. Returns reviews with ids and whether the
  // current user can post (hasn't posted yet). Also indicates if the
  // requester is the owner of the oglas so frontend can show delete UI.
  app.get('/recenzije/:oglasId', async (req) => {
    const oglasId = Number((req.params as any).oglasId);
    const snap = await db
      .collection('recenzije')
      .where('oglas', '==', oglasId)
      .get();
    const recenzije = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Recenzija) }));
    const prosjek =
      recenzije.length > 0
        ? recenzije.reduce((s, r) => s + r.ocjena, 0) / recenzije.length
        : 0;

    const uid = await getUidFromRequest(req);

    // Determine whether requester has already left a review
    let hasReviewed = false;
    if (uid) {
      hasReviewed = recenzije.some((r) => r.korisnik === uid);
    }

    // Determine if requester is owner of the oglas (creator)
    let isOwner = false;
    try {
      const oglasDoc = await db.collection('oglasi').doc(String(oglasId)).get();
      if (oglasDoc.exists) {
        const data = oglasDoc.data() as any;
        if (uid && data?.ownerUid && String(data.ownerUid) === String(uid)) isOwner = true;
      }
    } catch {
      // ignore; isOwner remains false
    }

    // Attach canDelete flag to each review when requester is owner
    const decorated = recenzije.map((r) => ({ ...r, canDelete: isOwner }));

    const canReview = Boolean(uid && !hasReviewed);

    return { recenzije: decorated, prosjek, canReview, isOwner };
  });

  // Delete a review by id. Allowed for the oglas owner (creator) or the review author.
  app.delete('/recenzije/:id', async (req, reply) => {
    const uid = await getUidFromRequest(req);
    if (!uid) return reply.code(401).send({ ok: false, error: 'unauthenticated' });

    const id = (req.params as any).id;
    const ref = db.collection('recenzije').doc(String(id));
    const doc = await ref.get();
    if (!doc.exists) return reply.code(404).send({ ok: false, error: 'not_found' });
    const data = doc.data() as any;
    const oglasId = data?.oglas;

    // Fetch oglas to check owner
    let ownerUid: string | undefined;
    try {
      const oglasDoc = await db.collection('oglasi').doc(String(oglasId)).get();
      if (oglasDoc.exists) ownerUid = (oglasDoc.data() as any)?.ownerUid;
    } catch {
      // ignore
    }

    const authorUid = data?.korisnik;
    if (String(uid) !== String(ownerUid) && String(uid) !== String(authorUid)) {
      return reply.code(403).send({ ok: false, error: 'forbidden' });
    }

    await ref.delete();
    return { ok: true };
  });
}
