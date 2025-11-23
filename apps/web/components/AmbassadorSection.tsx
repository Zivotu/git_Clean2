'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { applyToAmbassadorProgram } from '@/lib/ambassador';

// A simple modal component
const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-zinc-800 animate-slideUp">
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

type ProfileAmbassadorInfo = {
  status?: 'pending' | 'approved' | 'rejected';
  promoCode?: string;
  socialLinks?: Record<string, string>;
  motivation?: string;
  earnings?: {
    currentBalance: number;
    totalEarned: number;
  };
  marketingKitUrl?: string;
  dashboardUrl?: string;
  payoutEmail?: string;
  primaryPlatform?: string;
  audienceSize?: string;
};

export default function AmbassadorSection({ userInfo }: { userInfo: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [socialLinks, setSocialLinks] = useState({
    tiktok: '',
    instagram: '',
    youtube: '',
    newsletter: '',
    other: '',
  });
  const [primaryPlatform, setPrimaryPlatform] = useState('');
  const [audienceSize, setAudienceSize] = useState('');
  const [motivation, setMotivation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [localUserInfo, setLocalUserInfo] = useState(userInfo);

  useEffect(() => {
    setLocalUserInfo(userInfo);
  }, [userInfo]);

  const ambassadorInfo = useMemo(() => {
    return (localUserInfo?.ambassador || {}) as ProfileAmbassadorInfo;
  }, [localUserInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const filteredLinks = Object.fromEntries(
        Object.entries(socialLinks)
          .filter(([, value]) => value && value.trim().length > 0)
          .map(([key, value]) => [key, value.trim()])
      );

      await applyToAmbassadorProgram({
        socialLinks: filteredLinks,
        motivation,
        audienceSize: audienceSize.trim() || undefined,
        primaryPlatform: primaryPlatform || undefined,
      });

      setLocalUserInfo({
        ...localUserInfo,
        ambassador: {
          ...(ambassadorInfo || {}),
          status: 'pending',
        },
      });
      setSuccess('Zahtjev je poslan! Obavijestit ćemo te čim ga pregledamo.');
      setIsModalOpen(false);
      setSocialLinks({ tiktok: '', instagram: '', youtube: '', newsletter: '', other: '' });
      setMotivation('');
      setPrimaryPlatform('');
      setAudienceSize('');

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    const ambassadorStatus = ambassadorInfo?.status;

    if (ambassadorStatus === 'approved') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            🎉 Čestitamo! Odobren si kao Thesara ambasador.
          </p>
          {ambassadorInfo?.promoCode ? (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl p-5 shadow-sm">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Tvoj kod</p>
              <p className="text-3xl font-bold tracking-wide text-emerald-700 dark:text-emerald-400">{ambassadorInfo.promoCode}</p>
              <button
                className="mt-4 px-4 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-emerald-200 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors font-medium text-sm shadow-sm"
                onClick={() => {
                  navigator.clipboard
                    .writeText(ambassadorInfo.promoCode || '')
                    .catch(() => { });
                }}
              >
                📋 Kopiraj kod
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link href="/ambassador/dashboard" className="inline-flex">
              <button className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm hover:shadow-md">
                📊 Otvori dashboard
              </button>
            </Link>
            <a
              href={ambassadorInfo?.marketingKitUrl || 'https://thesara.space/ambassador-kit'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex">
              <button className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors font-medium shadow-sm">
                🎨 Marketing kit
              </button>
            </a>
          </div>
        </div>
      );
    }

    if (ambassadorStatus === 'pending') {
      return (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/30 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            ⏳ Tvoja prijava je u obradi. Javit ćemo ti se e-mailom čim donesemo odluku.
          </p>
        </div>
      );
    }

    if (ambassadorStatus === 'rejected') {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/30 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Prethodna prijava nije odobrena, ali možeš se ponovno prijaviti kad osjetiš da je tvoja
              zajednica spremna.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm hover:shadow-md"
          >
            Nova prijava
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Postani Thesara ambasador i zaradi proviziju dijeleći svoj jedinstveni kod s publikom.
        </p>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm hover:shadow-md"
        >
          🚀 Prijavi se
        </button>
      </div>
    );
  };

  return (
    <>
      <Card className="rounded-3xl p-6 space-y-4 border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
            <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Thesara Ambassador Program</h2>
          </div>
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
          <p>
            Zaradi kao partner: <span className="font-semibold text-emerald-600 dark:text-emerald-400">80% provizije od prve uplate</span>
            {' '}korisnika koji iskoristi tvoj kod.
          </p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Prednost za tvoju publiku: <span className="font-medium">30 dana besplatnog Gold plana</span>.</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Isplata: prag <span className="font-medium">50 €</span>, isplata <span className="font-medium">mjesečno (net 30)</span> preko PayPala.</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Jednostavno dijeljenje: jedinstveni promo kod i link.</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Transparentnost: dashboard s uvidom u iskorištenja, konverzije i zaradu.</span>
            </li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-gray-200 dark:border-zinc-800">
            💡 Napomena: provizija se obračunava na <span className="font-medium">prvu uplatu</span> korisnika unutar 60 dana od aktivacije koda.
          </p>
        </div>
        {success ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/30 p-4">
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">✅ {success}</p>
          </div>
        ) : null}
        {renderContent()}
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Prijava za Ambassador program">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/30 p-4 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium mb-1">📋 Prije slanja, potvrdi da razumiješ uvjete:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>80% provizije na prvu uplatu</li>
              <li>30 dana Gold trial tvojoj publici</li>
              <li>Prag isplate 50 €</li>
              <li>Isplata mjesečno (net 30)</li>
            </ul>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="tiktok" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                TikTok profil
              </label>
              <Input
                id="tiktok"
                name="tiktok"
                type="url"
                value={socialLinks.tiktok}
                onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })}
                placeholder="https://www.tiktok.com/@username"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="instagram" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Instagram profil
              </label>
              <Input
                id="instagram"
                name="instagram"
                type="url"
                value={socialLinks.instagram}
                onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                placeholder="https://www.instagram.com/username"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="youtube" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                YouTube kanal
              </label>
              <Input
                id="youtube"
                name="youtube"
                type="url"
                value={socialLinks.youtube}
                onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })}
                placeholder="https://www.youtube.com/@username"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="newsletter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Newsletter ili blog
              </label>
              <Input
                id="newsletter"
                name="newsletter"
                type="url"
                value={socialLinks.newsletter}
                onChange={(e) => setSocialLinks({ ...socialLinks, newsletter: e.target.value })}
                placeholder="https://newsletter.example.com"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="other" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Ostali kanali (link)
              </label>
              <Input
                id="other"
                name="other"
                type="url"
                value={socialLinks.other}
                onChange={(e) => setSocialLinks({ ...socialLinks, other: e.target.value })}
                placeholder="https://"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="primaryPlatform" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Primarna platforma
              </label>
              <Input
                id="primaryPlatform"
                name="primaryPlatform"
                value={primaryPlatform}
                onChange={(e) => setPrimaryPlatform(e.target.value)}
                placeholder="npr. TikTok, YouTube, Instagram"
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label htmlFor="audienceSize" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Veličina publike
            </label>
            <Input
              id="audienceSize"
              name="audienceSize"
              value={audienceSize}
              onChange={(e) => setAudienceSize(e.target.value)}
              placeholder="npr. 12.5k pratitelja"
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="motivation" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Zašto želiš biti ambasador? <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="motivation"
              name="motivation"
              rows={4}
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Volim Thesara jer..."
              required
              className="w-full"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/30 p-4 text-sm text-red-600 dark:text-red-400">
              <p className="font-medium">❌ Greška:</p>
              <p>{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors font-medium"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Slanje...
                </>
              ) : (
                'Pošalji prijavu'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
