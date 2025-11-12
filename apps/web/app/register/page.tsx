"use client";

import { useState, useCallback, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  UserCredential,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureUserDoc } from "@/lib/ensureUserDoc";
import { useTerms } from "@/components/terms/TermsProvider";
import TermsPreviewModal from "@/components/terms/TermsPreviewModal";
import { TERMS_POLICY } from "@thesara/policies/terms";
import { useI18n } from "@/lib/i18n-provider";

export default function RegisterPage() {
  const router = useRouter();
  const { accept: acceptTerms } = useTerms();
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`Register.${key}`] || key,
    [messages]
  );
  const field = useCallback((key: string) => t(`fields.${key}`), [t]);
  const beforeTerms = t("terms.beforeLink");
  const afterTerms = t("terms.afterLink");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    birthYear: "",
    password: "",
    confirmPassword: "",
    phone: "",
    gender: "",
    bio: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setTermsError(null);
    if (form.password !== form.confirmPassword) {
      setError(t("errors.passwordMismatch"));
      return;
    }
    if (!agreed) {
      setTermsError(t("errors.mustAcceptTerms"));
      return;
    }

    const collection = "users";
    let cred: UserCredential | null = null;
    try {
      if (!auth) throw new Error("Auth not initialized");
      cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const displayName =
        `${form.firstName} ${form.lastName}`.trim() || form.email.split("@")[0];
      await updateProfile(cred.user, { displayName });
      await ensureUserDoc({
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName,
        photoURL: cred.user.photoURL,
      });
      if (!db) throw new Error("DB not initialized");
      await setDoc(
        doc(db, collection, cred.user.uid),
        {
          firstName: form.firstName,
          lastName: form.lastName,
          username: form.username,
          email: form.email,
          birthYear: form.birthYear,
          phone: form.phone || null,
          gender: form.gender || null,
          bio: form.bio || null,
        },
        { merge: true }
      );
      await auth.currentUser?.getIdToken(true);
      try {
        await acceptTerms("manual-register");
      } catch (acceptErr) {
        console.warn("terms_accept_failed", acceptErr);
      }
      router.push("/?welcome=1");
    } catch (err: any) {
      console.error(`Error writing to ${collection} for user ${cred?.user?.uid}`, err);
      const fallback = err?.message || t("errors.generic");
      const hint = t("errors.firestoreHint");
      setError(hint ? `${fallback} ${hint}` : fallback);
    }
  };

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-3xl font-bold mt-8">{t("title")}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="flex gap-4">
          <input
            required
            name="firstName"
            placeholder={field("firstName")}
            value={form.firstName}
            onChange={handleChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <input
            required
            name="lastName"
            placeholder={field("lastName")}
            value={form.lastName}
            onChange={handleChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <input
          required
          name="username"
          placeholder={field("username")}
          value={form.username}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          required
          type="email"
          name="email"
          placeholder={field("email")}
          value={form.email}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          required
          name="birthYear"
          placeholder={field("birthYear")}
          value={form.birthYear}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <div className="flex gap-4">
          <input
            required
            type="password"
            name="password"
            placeholder={field("password")}
            value={form.password}
            onChange={handleChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <input
            required
            type="password"
            name="confirmPassword"
            placeholder={field("confirmPassword")}
            value={form.confirmPassword}
            onChange={handleChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <input
          name="phone"
          placeholder={field("phone")}
          value={form.phone}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <select
          name="gender"
          value={form.gender}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">{field("gender")}</option>
          <option value="male">{field("genderMale")}</option>
          <option value="female">{field("genderFemale")}</option>
          <option value="other">{field("genderOther")}</option>
        </select>
        <textarea
          name="bio"
          placeholder={field("bio")}
          value={form.bio}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-gray-800">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
                if (event.target.checked) setTermsError(null);
              }}
              className="mt-1 h-4 w-4 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500"
              required
            />
            <span>
              {beforeTerms}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-emerald-700 underline underline-offset-2"
              >
                {TERMS_POLICY.shortLabel}
              </button>{" "}
              {afterTerms}
            </span>
          </label>
          {termsError && <p className="mt-2 text-xs text-red-600">{termsError}</p>}
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2"
        >
          {t("cta.submit")}
        </button>
      </form>
      <TermsPreviewModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        title={TERMS_POLICY.shortLabel}
      />
    </main>
  );
}
