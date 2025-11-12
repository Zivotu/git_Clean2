"use client";

import { useCallback } from "react";
import { REQUIRED_FIREBASE_KEYS, getMissingFirebaseEnv } from "@/lib/env";
import { useI18n } from "@/lib/i18n-provider";

export default function SetupPage() {
  const missing = getMissingFirebaseEnv();
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`Setup.${key}`] || key,
    [messages]
  );

  return (
    <main className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      {missing.length > 0 && (
        <>
          <p>{t("missingIntro")}</p>
          <ul className="list-disc list-inside">
            {missing.map((k) => (
              <li key={k}>
                <code>{k}</code>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        {t("addPrefix")} <code>.env.local</code> {t("addSuffix")}
      </p>
      <pre className="bg-gray-100 p-2 rounded text-sm">
        {REQUIRED_FIREBASE_KEYS.map((k) => `${k}=\n`).join("")}
      </pre>
    </main>
  );
}
