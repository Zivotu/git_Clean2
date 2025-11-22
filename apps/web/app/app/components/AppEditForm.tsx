'use client';

import Image from 'next/image';
import { useTheme } from '@/components/ThemeProvider';
import { useAppDetails, SCREENSHOT_FIELD_COUNT, MAX_CUSTOM_ASSET_COUNT, ALLOWED_CUSTOM_ASSET_TYPES } from '../hooks/useAppDetails';
import type { RoomsMode, AccessMode } from '@/lib/types';

type AppEditFormProps = {
    details: ReturnType<typeof useAppDetails>;
};

export default function AppEditForm({ details }: AppEditFormProps) {
    const { isDark } = useTheme();
    const {
        item,
        canEdit,
        title, setTitle,
        description, setDescription,
        longDescription, handleLongDescriptionChange,
        roomsMode, setRoomsMode,
        screenshotUrls, screenshotStates, screenshotVersions, handleScreenshotRemove, screenshotInputRefs, handleScreenshotFileInput,
        customAssetDrafts, customAssetLoading, customAssetError, customAssetSaving, customAssetProgress, customAssetInputRef, handleCustomAssetInput, loadCustomAssets, handleCustomAssetRemove, handleCustomAssetNameChange, assetFileInputRefs, handleCustomAssetReplace, handleCustomAssetSave, resetCustomAssets,
        trEn, setTrEn, trDe, setTrDe, trHr, setTrHr,
        tags, setTags,
        price, setPrice, priceMin, priceMax, canMonetize, startStripeOnboarding, user, authorHandle,
        visibility, setVisibility,
        accessMode, setAccessMode,
        pin, setPin,
        maxPins, setMaxPins,
        rotatePin, rotatingPin,
        sessions, refreshingSessions, loadSessions, lastSessionsRefresh, revokeSession,
        onSave, saving, onToggleVisibility,
        setShowSoftDialog, setShowHardDialog, deleting,
        tApp,
        screenshotMaxMb,
        maxCustomAssetKb,
    } = details;

    if (!item || !canEdit) return null;

    const longDescriptionLabel = tApp('creator.longDescriptionLabel', undefined, 'Detailed overview');
    const longDescriptionHelper = tApp('creator.longDescriptionHelper', { min: 20 }, 'Add at least 20 characters so visitors get enough context.');
    const longDescriptionPlaceholder = tApp('creator.longDescriptionPlaceholder', undefined, 'Share the story, features, and benefits of your app...');
    const longDescriptionCounterLabel = tApp('creator.longDescriptionCounter', { used: longDescription.length, limit: 4000 }, `${longDescription.length}/4000 characters`);
    const screenshotsLabel = tApp('creator.screenshotsLabel', undefined, 'Screenshots');
    const screenshotsHint = tApp('creator.screenshotsHint', undefined, 'Upload up to two screenshots (PNG/JPG/WebP, max 1MB each). They appear on the public listing alongside the hero preview.');

    const inputClass = `w-full border-2 rounded-lg px-4 py-2.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isDark
            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 focus:border-emerald-500 placeholder:text-zinc-600'
            : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500 placeholder:text-gray-400'
        } focus:ring-4 focus:ring-emerald-500/10`;

    const labelClass = `block text-sm font-semibold mb-2 ${isDark ? 'text-zinc-200' : 'text-gray-900'}`;
    const sectionClass = `rounded-2xl border shadow-lg p-6 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`;

    return (
        <div className="space-y-8">
            {/* Edit Form */}
            <div className={sectionClass}>
                <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    App Details
                </h2>

                <div className="space-y-6">
                    {/* Title */}
                    <div>
                        <label className={labelClass}>
                            Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={inputClass}
                            disabled={!canEdit}
                            placeholder="Enter app title..."
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className={labelClass}>
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={`${inputClass} resize-none`}
                            rows={4}
                            disabled={!canEdit}
                            placeholder="Describe your app..."
                        />
                        <p className={`mt-1 text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>
                            {description.length}/500 characters
                        </p>
                    </div>

                    <div>
                        <label className={labelClass}>
                            Rooms (beta)
                        </label>
                        <select
                            value={roomsMode}
                            onChange={(event) => setRoomsMode(event.target.value as RoomsMode)}
                            disabled={!canEdit}
                            className={inputClass}
                        >
                            <option value="off">No rooms</option>
                            <option value="optional">Optional rooms</option>
                            <option value="required">Rooms required</option>
                        </select>
                        <p className={`mt-1 text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>
                            Change the PIN room experience without republishing the bundle. Optional keeps the demo ready; Required forces players to start their own room.
                        </p>
                    </div>

                    {/* Long Description */}
                    <div>
                        <label className={labelClass}>
                            {longDescriptionLabel}
                        </label>
                        <textarea
                            value={longDescription}
                            onChange={(e) => handleLongDescriptionChange(e.target.value)}
                            className={inputClass}
                            rows={6}
                            disabled={!canEdit}
                            placeholder={longDescriptionPlaceholder}
                        />
                        <p className={`mt-1 text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>{longDescriptionHelper}</p>
                        <p className={`text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>{longDescriptionCounterLabel}</p>
                    </div>

                    {/* Screenshots */}
                    <div>
                        <label className={labelClass}>
                            {screenshotsLabel}
                        </label>
                        <p className={`text-xs mb-3 ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>
                            {screenshotsHint}
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                            {Array.from({ length: SCREENSHOT_FIELD_COUNT }).map((_, index) => {
                                const value = screenshotUrls[index] ?? '';
                                const state = screenshotStates[index] || { uploading: false, error: '' };
                                const version = screenshotVersions[index] || 0;
                                const fieldLabel = tApp('creator.screenshotsPreviewAlt', { index: index + 1 }, `Screenshot ${index + 1}`);
                                const displaySrc = value
                                    ? value.includes('/uploads/')
                                        ? `${value}${value.includes('?') ? '&' : '?'}v=${version}`
                                        : value
                                    : '';
                                return (
                                    <div key={index} className={`rounded-2xl border p-4 space-y-3 ${isDark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-gray-200 shadow-sm/5'}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className={`text-xs font-semibold ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>{fieldLabel}</p>
                                                <p className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                                    {tApp('creator.screenshotsFileHint', { size: screenshotMaxMb }, `PNG/JPG/WebP up to ${screenshotMaxMb}MB`)}
                                                </p>
                                            </div>
                                            {value && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleScreenshotRemove(index)}
                                                    className="text-xs font-semibold text-rose-500 hover:text-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    disabled={!canEdit || state.uploading}
                                                >
                                                    {tApp('creator.screenshotsRemoveButton', undefined, 'Remove')}
                                                </button>
                                            )}
                                        </div>
                                        <div className={`relative aspect-video rounded-xl border border-dashed overflow-hidden ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-gray-50 border-gray-300'}`}>
                                            {value ? (
                                                <Image
                                                    src={displaySrc}
                                                    alt={fieldLabel}
                                                    fill
                                                    sizes="(max-width: 768px) 100vw, 50vw"
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className={`text-[11px] uppercase tracking-wide ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                                                        {tApp('creator.screenshotsEmptyPlaceholder', undefined, 'Upload screenshot')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!canEdit) return;
                                                    screenshotInputRefs.current[index]?.click();
                                                }}
                                                className={`px-3 py-1.5 text-sm font-semibold rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed ${isDark
                                                        ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
                                                        : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'
                                                    }`}
                                                disabled={!canEdit || state.uploading}
                                            >
                                                {value
                                                    ? tApp('creator.screenshotsReplaceButton', undefined, 'Replace screenshot')
                                                    : tApp('creator.screenshotsUploadButton', undefined, 'Upload screenshot')}
                                            </button>
                                            {state.uploading && (
                                                <span className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                                    {tApp('creator.screenshotsUploading', undefined, 'Uploading…')}
                                                </span>
                                            )}
                                        </div>
                                        {state.error && <p className="text-xs text-red-500">{state.error}</p>}
                                        <input
                                            ref={(el) => {
                                                screenshotInputRefs.current[index] = el;
                                            }}
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp,image/gif"
                                            className="hidden"
                                            onChange={(e) => handleScreenshotFileInput(index, e.target.files)}
                                            disabled={!canEdit}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom graphics */}
                    <div className={`rounded-2xl border p-5 ${isDark ? 'bg-zinc-800/30 border-zinc-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h3 className={`text-base font-semibold ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>
                                    {tApp('customAssets.title', undefined, 'Custom graphics')}
                                </h3>
                                <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                                    {tApp(
                                        'customAssets.subtitle',
                                        { size: maxCustomAssetKb },
                                        `Upload PNG/JPG/GIF up to ${maxCustomAssetKb}KB each. We rebuild automatically without extra approval.`
                                    )}
                                </p>
                                <p className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                    {tApp(
                                        'customAssets.countLabel',
                                        { used: customAssetDrafts.length, limit: MAX_CUSTOM_ASSET_COUNT },
                                        `${customAssetDrafts.length}/${MAX_CUSTOM_ASSET_COUNT} used`
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => customAssetInputRef.current?.click()}
                                    disabled={
                                        customAssetSaving || customAssetDrafts.length >= MAX_CUSTOM_ASSET_COUNT
                                    }
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${customAssetDrafts.length >= MAX_CUSTOM_ASSET_COUNT
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-emerald-600 hover:bg-emerald-700'
                                        }`}
                                >
                                    {tApp('customAssets.add', undefined, 'Upload graphics')}
                                </button>
                                <button
                                    type="button"
                                    onClick={loadCustomAssets}
                                    disabled={customAssetLoading || customAssetSaving}
                                    className={`text-sm underline decoration-dotted disabled:opacity-50 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}
                                >
                                    {tApp('customAssets.refresh', undefined, 'Refresh')}
                                </button>
                            </div>
                        </div>
                        <input
                            ref={customAssetInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/gif"
                            className="hidden"
                            multiple
                            onChange={handleCustomAssetInput}
                        />
                        {customAssetLoading ? (
                            <p className={`mt-4 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                {tApp('customAssets.loading', undefined, 'Loading custom graphics…')}
                            </p>
                        ) : customAssetDrafts.length ? (
                            <div className="mt-4 grid gap-4">
                                {customAssetDrafts.map((asset) => (
                                    <div key={asset.localId} className={`rounded-xl border p-4 ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex flex-wrap gap-4">
                                            <div className={`h-16 w-16 overflow-hidden rounded-lg border ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
                                                {asset.dataUrl ? (
                                                    <Image
                                                        src={asset.dataUrl}
                                                        alt={tApp(
                                                            'customAssets.previewAlt',
                                                            { name: asset.name },
                                                            `Custom asset ${asset.name}`
                                                        )}
                                                        width={64}
                                                        height={64}
                                                        className="h-full w-full object-cover"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="flex h-full items-center justify-center text-[11px] text-gray-400">
                                                        N/A
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <label className={`text-xs font-semibold ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                                                    {tApp('customAssets.nameLabel', undefined, 'Filename')}
                                                </label>
                                                <input
                                                    value={asset.name}
                                                    onChange={(e) =>
                                                        handleCustomAssetNameChange(asset.localId, e.target.value)
                                                    }
                                                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${isDark
                                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                                                            : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500 focus:ring-emerald-200'
                                                        }`}
                                                    disabled={customAssetSaving}
                                                />
                                                <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                                    {Math.round(asset.size / 1024)}KB • {asset.mimeType}
                                                    {asset.hasLocalData && (
                                                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                                            {tApp('customAssets.pendingBadge', undefined, 'Pending upload')}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCustomAssetRemove(asset.localId)}
                                                className="text-sm font-semibold text-rose-500 hover:text-rose-600"
                                                disabled={customAssetSaving}
                                            >
                                                {tApp('customAssets.remove', undefined, 'Remove')}
                                            </button>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                onClick={() => assetFileInputRefs.current[asset.localId]?.click()}
                                                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                                                disabled={customAssetSaving}
                                            >
                                                {tApp('customAssets.replace', undefined, 'Replace')}
                                            </button>
                                        </div>
                                        <input
                                            ref={(el) => {
                                                assetFileInputRefs.current[asset.localId] = el;
                                            }}
                                            type="file"
                                            className="hidden"
                                            accept="image/png,image/jpeg,image/jpg,image/gif"
                                            onChange={(e) => handleCustomAssetReplace(asset.localId, e.target.files)}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className={`mt-4 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                {tApp('customAssets.empty', undefined, 'No custom graphics yet.')}
                            </p>
                        )}
                        {customAssetError && (
                            <p className="mt-3 text-sm text-red-500">{customAssetError}</p>
                        )}
                        {(customAssetSaving || customAssetProgress > 0) && (
                            <div className="mt-4">
                                <div className={`h-2 w-full overflow-hidden rounded-full ${isDark ? 'bg-zinc-700' : 'bg-gray-100'}`}>
                                    <div
                                        className="h-full bg-emerald-500 transition-all duration-300"
                                        style={{ width: `${Math.min(customAssetProgress, 100)}%` }}
                                    />
                                </div>
                                <p className={`mt-2 text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                    {tApp(
                                        'customAssets.progressNote',
                                        undefined,
                                        'Hang tight—processing takes a few seconds.'
                                    )}
                                </p>
                            </div>
                        )}
                        <div className="mt-5 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handleCustomAssetSave}
                                disabled={customAssetSaving}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${customAssetSaving
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                            >
                                {customAssetSaving
                                    ? tApp('customAssets.saving', undefined, 'Saving…')
                                    : tApp('customAssets.save', undefined, 'Save graphics')}
                            </button>
                            <button
                                type="button"
                                onClick={resetCustomAssets}
                                disabled={customAssetSaving}
                                className={`px-4 py-2 rounded-lg border text-sm font-semibold disabled:opacity-50 ${isDark
                                        ? 'border-zinc-600 text-zinc-300 hover:bg-zinc-700'
                                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {tApp('customAssets.reset', undefined, 'Reset changes')}
                            </button>
                        </div>
                    </div>

                    {/* Translations (optional) */}
                    <div>
                        <label className={labelClass}>Translations (optional)</label>
                        <p className={`text-xs mb-2 ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>If you leave these blank, the system will auto-translate after approval.</p>
                        <div className="grid md:grid-cols-3 gap-3">
                            {[
                                { lang: 'English', flag: '🇬🇧', state: trEn, setter: setTrEn },
                                { lang: 'Deutsch', flag: '🇩🇪', state: trDe, setter: setTrDe },
                                { lang: 'Hrvatski', flag: '🇭🇷', state: trHr, setter: setTrHr },
                            ].map(({ lang, flag, state, setter }) => (
                                <div key={lang} className={`border rounded-lg p-3 ${isDark ? 'border-zinc-700 bg-zinc-800/30' : 'border-gray-200'}`}>
                                    <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}><span className="mr-1" aria-hidden>{flag}</span>{lang}</div>
                                    <input
                                        value={state.title}
                                        onChange={(e) => setter(p => ({ ...p, title: e.target.value }))}
                                        disabled={!canEdit}
                                        className={`${inputClass} text-sm mb-2 px-2 py-1`}
                                        placeholder="Title"
                                    />
                                    <textarea
                                        value={state.description}
                                        onChange={(e) => setter(p => ({ ...p, description: e.target.value }))}
                                        disabled={!canEdit}
                                        className={`${inputClass} text-sm px-2 py-1 resize-none`}
                                        rows={3}
                                        placeholder="Description"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className={labelClass}>
                            Tags <span className={`font-normal ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>(comma-separated)</span>
                        </label>
                        <input
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className={inputClass}
                            disabled={!canEdit}
                            placeholder="e.g., game, puzzle, education"
                        />
                        <p className={`mt-1 text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>Add tags to help users discover your app</p>
                    </div>

                    {/* Price */}
                    <div>
                        <label className={labelClass}>
                            Price (€)
                        </label>
                        {!canMonetize && (
                            <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800">
                                <p className="text-sm mb-2">
                                    Postavljanje cijena je zaključano dok ne dovršiš Stripe onboarding.
                                </p>
                                {user && (
                                    <button
                                        onClick={() => authorHandle && startStripeOnboarding(user.uid, authorHandle)}
                                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                    >
                                        Podesi isplate (Stripe)
                                    </button>
                                )}
                            </div>
                        )}
                        <input
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className={inputClass}
                            disabled={!canEdit || !canMonetize}
                            type="number"
                            min={priceMin}
                            max={priceMax}
                            step="0.01"
                        />
                    </div>

                    {/* Visibility */}
                    <div>
                        <label className={labelClass}>
                            Visibility
                        </label>
                        <div className={`flex items-center gap-4 p-4 rounded-lg border ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
                            <button
                                onClick={() => canEdit && setVisibility('public')}
                                disabled={!canEdit}
                                className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all duration-200 ${visibility === 'public'
                                        ? 'bg-white text-emerald-700 shadow-sm border-2 border-emerald-500'
                                        : `text-gray-700 hover:bg-white/50 border border-transparent ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : ''}`
                                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Public
                                </span>
                            </button>
                            <button
                                onClick={() => canEdit && setVisibility('unlisted')}
                                disabled={!canEdit}
                                className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all duration-200 ${visibility === 'unlisted'
                                        ? `bg-white text-gray-900 shadow-sm border-2 border-gray-500 ${isDark ? 'bg-zinc-700 text-white border-zinc-500' : ''}`
                                        : `text-gray-700 hover:bg-white/50 border border-transparent ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : ''}`
                                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                    Unlisted
                                </span>
                            </button>
                        </div>
                        <p className={`mt-2 text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>
                            {visibility === 'public'
                                ? '✅ Your app will appear in the marketplace and search results'
                                : '🔐 Your app will be hidden from the marketplace but accessible via direct link'}
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className={`flex items-center justify-between pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-gray-200'}`}>
                        <button
                            onClick={onToggleVisibility}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${isDark
                                    ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            Quick Toggle: {visibility === 'public' ? 'Make Unlisted' : 'Make Public'}
                        </button>

                        <button
                            onClick={() => onSave()}
                            disabled={saving}
                            className={`px-6 py-2.5 rounded-full font-medium transition-all duration-200 shadow-md hover:shadow-lg ${saving
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800'
                                }`}
                        >
                            {saving ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Save Changes
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* PIN Settings */}
            <div className={sectionClass}>
                <h2 className={`text-lg font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>PIN Settings</h2>

                <div className="mb-4 flex items-end gap-2">
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                            Access mode
                        </label>
                        <select
                            value={accessMode}
                            onChange={(e) => setAccessMode(e.target.value as AccessMode)}
                            className={`${inputClass} py-1 px-2`}
                        >
                            <option value="public">public</option>
                            <option value="pin">pin</option>
                            <option value="invite">invite</option>
                            <option value="private">private</option>
                        </select>
                    </div>
                    <button
                        onClick={() => onSave({ accessMode })}
                        disabled={saving}
                        className="px-4 py-2 rounded bg-emerald-600 text-white text-sm mt-5 hover:bg-emerald-700"
                    >
                        Save
                    </button>
                </div>

                {accessMode === 'pin' && (
                    <div className="mb-4 flex items-end gap-2">
                        <div>
                            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>PIN</label>
                            <input
                                type="text"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className={`${inputClass} w-32 py-1 px-2`}
                            />
                        </div>
                        <button
                            onClick={() => onSave({ pin })}
                            disabled={saving}
                            className="px-4 py-2 rounded bg-emerald-600 text-white text-sm mt-5 hover:bg-emerald-700"
                        >
                            Set
                        </button>
                        <button
                            onClick={() => onSave({ pin: null })}
                            disabled={saving}
                            className={`px-4 py-2 rounded text-sm mt-5 ${isDark ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                        >
                            Clear
                        </button>
                    </div>
                )}

                <div className="mb-4 flex items-end gap-2">
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                            Max concurrent PINs
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={maxPins}
                            onChange={(e) => setMaxPins(parseInt(e.target.value) || 0)}
                            className={`${inputClass} w-32 py-1 px-2`}
                        />
                    </div>
                    <button
                        onClick={() => onSave({ maxConcurrentPins: maxPins })}
                        disabled={saving}
                        className="px-4 py-2 rounded bg-emerald-600 text-white text-sm mt-5 hover:bg-emerald-700"
                    >
                        Save
                    </button>
                    <button
                        onClick={rotatePin}
                        disabled={rotatingPin}
                        className="px-4 py-2 rounded bg-blue-600 text-white text-sm mt-5 hover:bg-blue-700"
                    >
                        {rotatingPin ? 'Rotating…' : 'Rotate PIN'}
                    </button>
                </div>
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <h3 className={`font-medium ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>Active PIN sessions</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-gray-100'}`}>
                            {sessions.length}
                        </span>
                        <button
                            onClick={loadSessions}
                            disabled={refreshingSessions}
                            className={`text-xs px-2 py-1 border rounded disabled:opacity-50 ${isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'hover:bg-gray-50'}`}
                        >
                            {refreshingSessions ? 'Refreshing…' : 'Refresh'}
                        </button>
                        {lastSessionsRefresh && (
                            <span className={`text-xs ml-auto ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                Updated {new Date(lastSessionsRefresh).toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                    <table className={`w-full text-sm ${isDark ? 'text-zinc-300' : ''}`}>
                        <thead>
                            <tr className={`text-left border-b ${isDark ? 'border-zinc-800' : ''}`}>
                                <th className="py-1 pr-2">Anon ID</th>
                                <th className="py-1 pr-2">IP</th>
                                <th className="py-1 pr-2">Created</th>
                                <th className="py-1 pr-2">Last seen</th>
                                <th className="py-1 pr-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.length === 0 && (
                                <tr>
                                    <td colSpan={5} className={`py-2 text-center ${isDark ? 'text-zinc-600' : 'text-gray-500'}`}>
                                        No active sessions
                                    </td>
                                </tr>
                            )}
                            {sessions.map((s) => (
                                <tr key={s.sessionId} className={`border-b ${isDark ? 'border-zinc-800' : ''}`}>
                                    <td className="py-1 pr-2">{s.anonId || '-'}</td>
                                    <td className="py-1 pr-2">{s.ipHash?.slice(0, 8)}</td>
                                    <td className="py-1 pr-2">{new Date(s.createdAt).toLocaleTimeString()}</td>
                                    <td className="py-1 pr-2">{new Date(s.lastSeenAt).toLocaleTimeString()}</td>
                                    <td className="py-1 pr-2 text-right">
                                        <button
                                            onClick={() => revokeSession(s.sessionId)}
                                            className="text-xs text-red-500 hover:underline"
                                        >
                                            Revoke
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Danger Zone */}
            <div className={`rounded-2xl border shadow-lg p-6 ${isDark ? 'bg-zinc-900 border-red-900/30' : 'bg-white border-red-200'}`}>
                <h2 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Danger Zone
                </h2>

                <div className="space-y-4">
                    <div className={`p-4 rounded-lg border ${isDark ? 'bg-red-900/10 border-red-900/30' : 'bg-red-50 border-red-200'}`}>
                        <h3 className={`font-medium mb-1 ${isDark ? 'text-red-400' : 'text-red-900'}`}>Remove from Marketplace</h3>
                        <p className={`text-sm mb-3 ${isDark ? 'text-red-300/70' : 'text-red-700'}`}>
                            This will hide your app from the marketplace but keep the play URL active.
                        </p>
                        <button
                            onClick={() => setShowSoftDialog(true)}
                            disabled={deleting}
                            className={`px-4 py-2 rounded-lg border font-medium transition-all duration-200 ${isDark
                                    ? 'bg-zinc-900 border-red-900/50 text-red-400 hover:bg-red-900/20'
                                    : 'bg-white border-red-300 text-red-700 hover:bg-red-50'
                                }`}
                        >
                            Remove from Marketplace
                        </button>
                    </div>

                    <div className={`p-4 rounded-lg border ${isDark ? 'bg-red-900/20 border-red-900/50' : 'bg-red-50 border-red-300'}`}>
                        <h3 className={`font-medium mb-1 ${isDark ? 'text-red-400' : 'text-red-900'}`}>Delete App Permanently</h3>
                        <p className={`text-sm mb-3 ${isDark ? 'text-red-300/70' : 'text-red-700'}`}>
                            <strong>This action cannot be undone.</strong> This will permanently delete your app and all associated files.
                        </p>
                        <button
                            onClick={() => setShowHardDialog(true)}
                            disabled={deleting}
                            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all duration-200 font-medium"
                        >
                            Delete Permanently
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
