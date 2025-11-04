'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DOC_PATH = ['adminSettings', 'accessControl'] as const;
const CACHE_MS = 60_000;

type AdminSettingsDoc = {
  allowedEmails?: string[];
};

let cachedEmails: { value: string[]; fetchedAt: number } | null = null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function fetchAllowedAdminEmails(force = false): Promise<string[]> {
  if (!db) return [];
  const now = Date.now();
  if (!force && cachedEmails && now - cachedEmails.fetchedAt < CACHE_MS) {
    return cachedEmails.value;
  }
  const ref = doc(db, ...DOC_PATH);
  const snap = await getDoc(ref);
  const data = snap.data() as AdminSettingsDoc | undefined;
  const emails = Array.isArray(data?.allowedEmails)
    ? data!.allowedEmails.map((entry) => normalizeEmail(String(entry)))
    : [];
  cachedEmails = { value: emails, fetchedAt: now };
  return emails;
}

export async function saveAllowedAdminEmails(emails: string[]): Promise<void> {
  if (!db) throw new Error('Firestore nije inicijaliziran.');
  const ref = doc(db, ...DOC_PATH);
  const normalized = emails.map((e) => normalizeEmail(e));
  await setDoc(ref, { allowedEmails: normalized }, { merge: true });
  cachedEmails = { value: normalized, fetchedAt: Date.now() };
}
