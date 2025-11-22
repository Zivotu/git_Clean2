'use client';

import Image from 'next/image';
import { useTheme } from '@/components/ThemeProvider';
import { useAppDetails } from '../hooks/useAppDetails';
import { PREVIEW_PRESET_PATHS } from '@/lib/previewClient';

type AppGalleryProps = {
    details: ReturnType<typeof useAppDetails>;
};

export default function AppGallery({ details }: AppGalleryProps) {
    const { isDark } = useTheme();
    const {
        item,
        canEdit,
        activePreviewSrc,
        previewDisplayFailed,
        setPreviewDisplayFailed,
        useEditorPreview,
        activeOverlayLabel,
        playListing,
        user,
        setShowLoginPrompt,
        tApp,
        // Preview Editor props
        previewInputRef,
        handleCustomPreview,
        previewChoice,
        selectedPreset,
        handlePresetSelect,
        presetOverlay,
        setPresetOverlay,
        setPreviewApplied,
        setPreviewError,
        overlayMaxChars,
        previewBusy,
        customPreview,
        resetCustomPreview,
        applySelectedPreview,
        previewApplied,
        previewError,
        maxPreviewMb,
        presetOverlayLabel,
    } = details;

    if (!item) return null;

    return (
        <div className="space-y-6">
            {/* Main Preview Card */}
            <div className={`rounded-2xl border overflow-hidden shadow-lg ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'
                }`}>
                <div className="relative aspect-video group">
                    {activePreviewSrc && !previewDisplayFailed ? (
                        <Image
                            src={activePreviewSrc}
                            alt={item.title}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            sizes="(min-width: 1024px) 50vw, 100vw"
                            unoptimized
                            onError={useEditorPreview ? undefined : () => setPreviewDisplayFailed(true)}
                        />
                    ) : (
                        <div className={`flex h-full w-full items-center justify-center text-sm font-medium ${isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-slate-100 text-slate-500'
                            }`}>
                            {tApp('previewGraphicHint')}
                        </div>
                    )}

                    {activeOverlayLabel && (
                        <div className="absolute inset-x-0 bottom-0 bg-black/80 text-white text-sm font-semibold text-center leading-snug py-3 px-4 break-words backdrop-blur-sm">
                            {activeOverlayLabel}
                        </div>
                    )}

                    {/* Hover Overlay with Play Button */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-10 backdrop-blur-[2px]">
                        <button
                            type="button"
                            onClick={user ? playListing : () => setShowLoginPrompt(true)}
                            className="px-8 py-4 rounded-full bg-white/90 backdrop-blur text-gray-900 font-bold shadow-2xl hover:bg-white transform hover:scale-105 transition-all flex items-center gap-3"
                        >
                            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            {tApp('playInNewTab')}
                        </button>
                    </div>
                </div>

                {/* Editor Controls (Owner Only) */}
                {canEdit && (
                    <div className={`border-t ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50/50'}`}>
                        <input
                            ref={previewInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCustomPreview}
                        />
                        <div className="p-5 space-y-5">
                            <div>
                                <h3 className={`text-sm font-semibold ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>
                                    {tApp('previewGraphic')}
                                </h3>
                                <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                                    {tApp('previewGraphicHint')}
                                </p>
                            </div>

                            <div className="grid gap-3 grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                                {PREVIEW_PRESET_PATHS.map((preset) => {
                                    const isSelected = previewChoice === 'preset' && selectedPreset === preset;
                                    return (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => handlePresetSelect(preset)}
                                            className={`relative rounded-lg overflow-hidden border transition-all shadow-sm group ${isSelected
                                                ? 'border-emerald-500 ring-2 ring-emerald-500/50'
                                                : isDark
                                                    ? 'border-zinc-700 hover:border-emerald-500/50'
                                                    : 'border-gray-200 hover:border-emerald-300'
                                                }`}
                                        >
                                            <Image
                                                src={preset}
                                                alt=""
                                                width={320}
                                                height={180}
                                                className="w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                unoptimized
                                            />
                                            {isSelected && <div className="absolute inset-0 bg-emerald-500/20 pointer-events-none" />}
                                            {presetOverlayLabel && (
                                                <div className="absolute inset-x-0 bottom-0 bg-black/80 text-white text-xs font-semibold text-center leading-snug py-1.5 px-3 break-words">
                                                    {presetOverlayLabel}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {previewChoice === 'preset' && (
                                <div>
                                    <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                                        {tApp('previewTitleLabel')}{' '}
                                        <span className={`font-normal ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                            ({overlayMaxChars} {tApp('characters')})
                                        </span>
                                    </label>
                                    <input
                                        value={presetOverlay}
                                        onChange={(e) => {
                                            setPresetOverlay(e.target.value.slice(0, overlayMaxChars));
                                            setPreviewApplied(false);
                                            setPreviewError('');
                                        }}
                                        maxLength={overlayMaxChars}
                                        className={`w-full border rounded-lg px-3 py-2 text-sm transition-colors ${isDark
                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 focus:border-emerald-500 placeholder:text-zinc-600'
                                            : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500 placeholder:text-gray-400'
                                            } focus:ring-2 focus:ring-emerald-500/20 outline-none`}
                                        placeholder={tApp('previewTitlePlaceholder')}
                                    />
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => previewInputRef.current?.click()}
                                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${isDark
                                        ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
                                        : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    disabled={previewBusy}
                                >
                                    {tApp('chooseCustomGraphic')}
                                </button>
                                {customPreview && (
                                    <button
                                        type="button"
                                        onClick={resetCustomPreview}
                                        className={`text-sm underline disabled:opacity-60 ${isDark ? 'text-zinc-400 hover:text-zinc-300' : 'text-gray-600 hover:text-gray-800'
                                            }`}
                                        disabled={previewBusy}
                                    >
                                        {tApp('removeCustomGraphic')}
                                    </button>
                                )}
                                <span className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                    {tApp('customGraphicHint')} {maxPreviewMb}MB
                                </span>
                            </div>

                            <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
                                {previewChoice === 'custom' && customPreview?.dataUrl ? (
                                    <div className="relative aspect-video bg-zinc-900">
                                        <Image
                                            src={customPreview.dataUrl}
                                            alt="Custom preview"
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                ) : activePreviewSrc ? (
                                    <div className="relative aspect-video bg-zinc-900">
                                        <Image
                                            src={activePreviewSrc}
                                            alt="Current preview"
                                            fill
                                            className="object-cover opacity-50 grayscale"
                                            sizes="(min-width: 1024px) 50vw, 100vw"
                                            unoptimized
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-white font-medium drop-shadow-md">Current Preview</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`relative aspect-video flex flex-col items-center justify-center text-xs uppercase tracking-wide border-2 border-dashed ${isDark
                                        ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500'
                                        : 'bg-slate-50 border-slate-300 text-slate-500'
                                        }`}>
                                        <span className="font-semibold">{tApp('previewGraphicHint')}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={applySelectedPreview}
                                    disabled={
                                        previewBusy ||
                                        !canEdit ||
                                        (previewChoice === 'custom' && !customPreview?.file)
                                    }
                                    className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20"
                                >
                                    {previewBusy ? tApp('savingGraphic') : tApp('saveGraphic')}
                                </button>
                                {!previewBusy && previewApplied && !previewError && (
                                    <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        {tApp('previewUploadSuccess')}
                                    </span>
                                )}
                                {previewBusy && (
                                    <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                        {tApp('previewUploading')}
                                    </span>
                                )}
                            </div>
                            {previewError && <p className="text-sm text-red-500 font-medium">{previewError}</p>}
                        </div>
                        <div className={`px-5 pb-5 ${isDark ? 'bg-zinc-900/30' : 'bg-gray-50/30'}`}>
                            <div className="flex items-center justify-between text-sm">
                                <span className={`font-medium ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>App ID:</span>
                                <code className={`font-mono px-3 py-1 rounded border text-xs ${isDark
                                    ? 'bg-zinc-950 border-zinc-800 text-emerald-400'
                                    : 'bg-white border-gray-200 text-emerald-600'
                                    }`}>
                                    {item.slug}
                                </code>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Tags Display */}
            {item.tags && item.tags.length > 0 && (
                <div className={`rounded-xl border p-5 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                    <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>
                        Categories
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {item.tags.map(tag => (
                            <span
                                key={tag}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-default ${isDark
                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-400'
                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-emerald-300 hover:text-emerald-700'
                                    }`}
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
