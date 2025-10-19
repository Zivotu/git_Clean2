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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">&times;</button>
        </div>
        {children}
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
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Čestitamo! Odobren si kao Thesara ambasador.
          </p>
          {ambassadorInfo?.promoCode ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500 mb-1">Tvoj kod</p>
              <p className="text-2xl font-semibold tracking-wide">{ambassadorInfo.promoCode}</p>
              <Button
                className="mt-3"
                onClick={() => {
                  navigator.clipboard
                    .writeText(ambassadorInfo.promoCode || '')
                    .catch(() => {});
                }}
              >
                Kopiraj kod
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link href="/ambassador/dashboard" className="inline-flex">
              <Button variant="default">Otvori dashboard</Button>
            </Link>
            <a
              href={ambassadorInfo?.marketingKitUrl || 'https://thesara.space/ambassador-kit'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button variant="secondary">Marketing kit</Button>
            </a>
          </div>
        </div>
      );
    }

    if (ambassadorStatus === 'pending') {
      return (
        <p className="text-sm text-gray-600">
          Tvoja prijava je u obradi. Javit ćemo ti se e-mailom čim donesemo odluku.
        </p>
      );
    }

    if (ambassadorStatus === 'rejected') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Prethodna prijava nije odobrena, ali možeš se ponovno prijaviti kad osjetiš da je tvoja
            zajednica spremna.
          </p>
          <Button onClick={() => setIsModalOpen(true)}>Nova prijava</Button>
        </div>
      );
    }

    return (
      <div>
        <p className="text-sm text-gray-600 mb-4">
          Postani Thesara ambasador i zaradi proviziju dijeleći svoj jedinstveni kod s publikom.
        </p>
        <Button onClick={() => setIsModalOpen(true)}>Prijavi se</Button>
      </div>
    );
  };

  return (
    <>
      <Card className="rounded-3xl p-6 space-y-3">
        <h2 className="text-xl font-semibold mb-2">Thesara Ambassador Program</h2>
        {success ? <p className="text-sm text-green-600">{success}</p> : null}
        {renderContent()}
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Apply to be an Ambassador">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tiktok" className="block text-sm font-medium text-gray-700">TikTok profil</label>
            <Input
              id="tiktok"
              name="tiktok"
              type="url"
              value={socialLinks.tiktok}
              onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })}
              placeholder="https://www.tiktok.com/@username"
            />
          </div>
          <div>
            <label htmlFor="instagram" className="block text-sm font-medium text-gray-700">Instagram profil</label>
            <Input
              id="instagram"
              name="instagram"
              type="url"
              value={socialLinks.instagram}
              onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
              placeholder="https://www.instagram.com/username"
            />
          </div>
          <div>
            <label htmlFor="youtube" className="block text-sm font-medium text-gray-700">YouTube kanal</label>
            <Input
              id="youtube"
              name="youtube"
              type="url"
              value={socialLinks.youtube}
              onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })}
              placeholder="https://www.youtube.com/@username"
            />
          </div>
          <div>
            <label htmlFor="newsletter" className="block text-sm font-medium text-gray-700">Newsletter ili blog</label>
            <Input
              id="newsletter"
              name="newsletter"
              type="url"
              value={socialLinks.newsletter}
              onChange={(e) => setSocialLinks({ ...socialLinks, newsletter: e.target.value })}
              placeholder="https://newsletter.example.com"
            />
          </div>
          <div>
            <label htmlFor="other" className="block text-sm font-medium text-gray-700">Ostali kanali (link)</label>
            <Input
              id="other"
              name="other"
              type="url"
              value={socialLinks.other}
              onChange={(e) => setSocialLinks({ ...socialLinks, other: e.target.value })}
              placeholder="https://"
            />
          </div>
          <div>
            <label htmlFor="primaryPlatform" className="block text-sm font-medium text-gray-700">
              Primarna platforma
            </label>
            <Input
              id="primaryPlatform"
              name="primaryPlatform"
              value={primaryPlatform}
              onChange={(e) => setPrimaryPlatform(e.target.value)}
              placeholder="npr. TikTok, YouTube, Instagram"
            />
          </div>
          <div>
            <label htmlFor="audienceSize" className="block text-sm font-medium text-gray-700">
              Veličina publike
            </label>
            <Input
              id="audienceSize"
              name="audienceSize"
              value={audienceSize}
              onChange={(e) => setAudienceSize(e.target.value)}
              placeholder="npr. 12.5k pratitelja"
            />
          </div>
          <div>
            <label htmlFor="motivation" className="block text-sm font-medium text-gray-700">Why do you want to be an ambassador?</label>
            <Textarea
              id="motivation"
              name="motivation"
              rows={4}
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="I love Thesara because..."
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">Greška: {error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Slanje...' : 'Pošalji prijavu'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
