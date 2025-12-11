'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useT } from '@/lib/i18n-provider';
import { applyToAmbassadorProgram } from '@/lib/ambassador';
import { useAuth } from '@/lib/auth';

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

export default function AmbassadorApplicationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const t = useT('ambassadorSection');
    const { user } = useAuth();
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
    const [commissionModel, setCommissionModel] = useState<'turbo' | 'partner'>('turbo');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Check if user already applied
    const hasApplied = user?.ambassador?.status && ['pending', 'approved', 'rejected'].includes(user.ambassador.status);
    const applicationStatus = user?.ambassador?.status;

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

            // Require at least one social link if motivation is weak? No, let strict check handle it.
            // But let's check basic requirement
            if (Object.keys(filteredLinks).length === 0 && !primaryPlatform) {
                // Maybe allow just primary platform
            }

            await applyToAmbassadorProgram({
                socialLinks: filteredLinks,
                motivation,
                audienceSize: audienceSize.trim() || undefined,
                primaryPlatform: primaryPlatform || undefined,
                commissionModel,
            });

            setSuccess(t('applicationSuccess'));
            setSocialLinks({ tiktok: '', instagram: '', youtube: '', newsletter: '', other: '' });
            setMotivation('');
            setPrimaryPlatform('');
            setAudienceSize('');
            setCommissionModel('turbo');

            // Close after 2 seconds
            setTimeout(() => {
                onClose();
                setSuccess('');
            }, 2000);

        } catch (err: any) {
            console.error(err);
            if (err.message && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
                setError(t('modal.errorTitle') + ' Authorization required. Redirecting to login...');
                setTimeout(() => {
                    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + '?openAmbassador=true')}`;
                }, 1500);
            } else {
                setError(t('modal.errorTitle') + ' ' + (err.message || 'Error occurred'));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('modal.title')}>
            {hasApplied ? (
                <div className="text-center py-8 space-y-4">
                    <div className="flex justify-center">
                        {applicationStatus === 'pending' && (
                            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        )}
                        {applicationStatus === 'approved' && (
                            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        )}
                        {applicationStatus === 'rejected' && (
                            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            {applicationStatus === 'pending' && 'Prijava je već poslana'}
                            {applicationStatus === 'approved' && 'Već ste ambasador!'}
                            {applicationStatus === 'rejected' && 'Prijava odbijena'}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {applicationStatus === 'pending' && 'Vaša prijava za ambassador program je trenutno na čekanju. Provjerit ćemo je uskoro i obavijestiti vas putem emaila.'}
                            {applicationStatus === 'approved' && 'Već ste odobreni kao Thesara Ambassador! Možete pristupiti svom dashboardu i početi zarađivati.'}
                            {applicationStatus === 'rejected' && 'Vaša prijava je odbijena. Za više informacija kontaktirajte support@thesara.space'}
                        </p>
                    </div>
                    {applicationStatus === 'approved' && (
                        <Button onClick={() => { onClose(); window.location.href = '/ambassador/dashboard'; }}>
                            Otvori Dashboard
                        </Button>
                    )}
                    <Button variant="secondary" onClick={onClose}>
                        Zatvori
                    </Button>
                </div>
            ) : success ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/30 p-4 mb-4">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">✅ {success}</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium mb-1">{t('modal.confirmTerms')}</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                            <li>{t('modal.term1')}</li>
                            <li>{t('modal.term2')}</li>
                            <li>{t('modal.term3')}</li>
                            <li>{t('modal.term4')}</li>
                        </ul>
                    </div>

                    {/* Commission Model Selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                            Choose Your Earning Model <span className="text-red-500">*</span>
                        </label>
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Turbo Model */}
                            <button
                                type="button"
                                onClick={() => setCommissionModel('turbo')}
                                className={`relative p-4 rounded-xl border-2 text-left transition-all ${commissionModel === 'turbo'
                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                    : 'border-gray-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                                    }`}
                            >
                                {commissionModel === 'turbo' && (
                                    <div className="absolute top-2 right-2">
                                        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">🚀 TURBO</div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                    <div>• 55% (1st month)</div>
                                    <div>• 15% (2nd month)</div>
                                    <div className="text-xs text-gray-500">For influencers & paid ads</div>
                                </div>
                            </button>

                            {/* Partner Model */}
                            <button
                                type="button"
                                onClick={() => setCommissionModel('partner')}
                                className={`relative p-4 rounded-xl border-2 text-left transition-all ${commissionModel === 'partner'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700'
                                    }`}
                            >
                                {commissionModel === 'partner' && (
                                    <div className="absolute top-2 right-2">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">💎 PARTNER</div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                    <div>• 10% (Lifetime)</div>
                                    <div>• On ALL transactions</div>
                                    <div className="text-xs text-gray-500">For educators & communities</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                        <div>
                            <label htmlFor="tiktok" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('modal.tiktokLabel')}
                            </label>
                            <Input
                                id="tiktok"
                                name="tiktok"
                                type="url"
                                value={socialLinks.tiktok}
                                onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })}
                                placeholder={t('modal.tiktokPlaceholder')}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="instagram" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('modal.instagramLabel')}
                            </label>
                            <Input
                                id="instagram"
                                name="instagram"
                                type="url"
                                value={socialLinks.instagram}
                                onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                                placeholder={t('modal.instagramPlaceholder')}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="youtube" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('modal.youtubeLabel')}
                            </label>
                            <Input
                                id="youtube"
                                name="youtube"
                                type="url"
                                value={socialLinks.youtube}
                                onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })}
                                placeholder={t('modal.youtubePlaceholder')}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="newsletter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('modal.newsletterLabel')}
                            </label>
                            <Input
                                id="newsletter"
                                name="newsletter"
                                type="url"
                                value={socialLinks.newsletter}
                                onChange={(e) => setSocialLinks({ ...socialLinks, newsletter: e.target.value })}
                                placeholder={t('modal.newsletterPlaceholder')}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="other" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('modal.otherLabel')}
                            </label>
                            <Input
                                id="other"
                                name="other"
                                type="url"
                                value={socialLinks.other}
                                onChange={(e) => setSocialLinks({ ...socialLinks, other: e.target.value })}
                                placeholder={t('modal.otherPlaceholder')}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="primaryPlatform" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('modal.primaryPlatformLabel')}
                            </label>
                            <Input
                                id="primaryPlatform"
                                name="primaryPlatform"
                                value={primaryPlatform}
                                onChange={(e) => setPrimaryPlatform(e.target.value)}
                                placeholder={t('modal.primaryPlatformPlaceholder')}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="audienceSize" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t('modal.audienceSizeLabel')}
                        </label>
                        <Input
                            id="audienceSize"
                            name="audienceSize"
                            value={audienceSize}
                            onChange={(e) => setAudienceSize(e.target.value)}
                            placeholder={t('modal.audienceSizePlaceholder')}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <label htmlFor="motivation" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t('modal.motivationLabel')} <span className="text-red-500">{t('modal.motivationRequired')}</span>
                        </label>
                        <Textarea
                            id="motivation"
                            name="motivation"
                            rows={4}
                            value={motivation}
                            onChange={(e) => setMotivation(e.target.value)}
                            placeholder={t('modal.motivationPlaceholder')}
                            required
                            className="w-full"
                        />
                    </div>

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/30 p-4 text-sm text-red-600 dark:text-red-400">
                            <p>{error}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors font-medium"
                        >
                            {t('modal.cancelButton')}
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
                                    {t('modal.submittingButton')}
                                </>
                            ) : (
                                t('modal.submitButton')
                            )}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
}
