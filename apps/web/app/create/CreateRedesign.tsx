'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useState } from 'react';
import { useLoginHref } from '@/hooks/useLoginHref';

const StatusChip = ({ label, completed }: { label: string, completed: boolean }) => (
  <span className={`text-[10px] px-2 py-1 rounded border flex items-center gap-1 ${completed ? 'bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-600'}`}>
    {completed && <span>✔️</span>}
    {label}
  </span>
);

const Badge = ({ text }: { text: string }) => <span className="bg-gray-100 dark:bg-[#161616] border border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 text-[9px] font-bold px-1.5 py-0.5 rounded">{text}</span>;

export default function CreateRedesign(props: any) {
  const {
    step,
    setStep,
    submissionType = 'code',
    onSubmissionTypeChange,
    code = '',
    onCodeChange,
    bundleFile,
    onBundleClick,
    onBundleChange,
    clearBundleSelection,
    handleNext,
    handleBack,
    manifestName = '',
    manifestDescription = '',
    setManifestName,
    setManifestDescription,
    longDescription = '',
    onLongDescription,
    overlayTitle = '',
    setOverlayTitle,
    previewUrl,
    onPreviewUploadClick,
    onPreviewChange,
    selectedPreset,
    onPresetSelect,
    publish,
    publishing,
    allReady,
    bundleInputRef,
    previewInputRef,
    screenshotInputRefs,
    screenshots = [],
    screenshotErrors = [],
    onScreenshotChange,
    onScreenshotRemove,
    screenshotMaxMb,
    overlayMaxChars = 22,
    previewUploading = false,
    customPreview = null,
    resetCustomPreview,
    previewChoice = 'preset',
    needsTermsConsent = false,
    publishTermsChecked,
    setPublishTermsChecked,
    onOpenTerms,
    publishTermsError,
    roomsMode,
    setRoomsMode,
    trEn, setTrEn,
    trDe, setTrDe,
    trHr, setTrHr,
    PREVIEW_PRESET_PATHS = [],
    showAdvancedOptions,
    setShowAdvancedOptions,
    customAssets = [],
    removeCustomAsset,
    customAssetError,
    customAssetInputRef,
    handleCustomAssetInput,
    customAssetMaxKb,
    MAX_CUSTOM_ASSET_COUNT,
    llmApiKey,
    setLlmApiKey,
    tCreate = (key: string) => key,
    bundleError,
    localPreviewUrl,
    localJobLog,
    authError,
    publishError,
    isSignedIn,
    termsLabel,
    selectedTags = [],
    setSelectedTags,
  } = props;
  const loginHref = useLoginHref();

  const [showRooms, setShowRooms] = useState(false);
  const [showTrans, setShowTrans] = useState(false);
  const [expandedLang, setExpandedLang] = useState<string | null>(null);

  const languages = [
    { code: 'en', label: 'English', data: trEn, handler: setTrEn },
    { code: 'de', label: 'Deutsch', data: trDe, handler: setTrDe },
    { code: 'hr', label: 'Hrvatski', data: trHr, handler: setTrHr },
  ];

  const handleTranslationChange = (setter: Function, field: 'title' | 'description', value: string) => {
    setter((prev: any) => ({ ...prev, [field]: value }));
  };

  // Tag translations fallback map
  const getTagTranslation = (tagId: string): string => {
    const translations: Record<string, Record<string, string>> = {
      'games': { hr: 'Igre', en: 'Games', de: 'Spiele' },
      'quiz': { hr: 'Kvizovi', en: 'Quizzes', de: 'Quiz' },
      'learning': { hr: 'Učenje', en: 'Learning', de: 'Lernen' },
      'tools': { hr: 'Alati', en: 'Tools', de: 'Werkzeuge' },
      'business': { hr: 'Posao', en: 'Business', de: 'Geschäft' },
      'entertainment': { hr: 'Zabava', en: 'Entertainment', de: 'Unterhaltung' },
      'other': { hr: 'Ostalo', en: 'Other', de: 'Sonstiges' },
    };

    // Try to get from tCreate first
    const translated = tCreate(`tag_${tagId}`);
    if (translated && translated !== `tag_${tagId}`) {
      return translated;
    }

    // Fallback to built-in translations
    const locale = tCreate('_locale') || 'hr';
    return translations[tagId]?.[locale] || translations[tagId]?.['hr'] || tagId;
  };

  const goNext = () => handleNext();

  const hasCode = (submissionType === 'code' && code.trim().length > 0) || (submissionType === 'bundle' && bundleFile);
  const hasContent = hasCode;
  const canProceed = hasContent;

  const hasTitle = manifestName.length > 0;
  const hasDesc = manifestDescription.length > 0;
  const hasDetailed = longDescription.length > 20;
  const hasGraphic = !!customPreview || !!selectedPreset;

  const completionCount = [hasTitle, hasCode, hasDesc, hasDetailed, hasGraphic].filter(Boolean).length;
  const completionTotal = 5;
  const progress = (completionCount / completionTotal) * 100;

  const finalPreviewUrl = previewUrl;
  const gradientClass = !finalPreviewUrl && previewChoice === 'preset' ? selectedPreset : 'bg-gray-800';

  const steps = [
    { id: 0, label: tCreate('sourceSection') },
    { id: 1, label: tCreate('basicsAndVisuals') },
  ];

  return (
    <div className="min-h-screen text-black dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b dark:border-white/10 bg-white/80 dark:bg-[#050505]/80 backdrop-blur mb-8">
        <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30 text-black font-bold text-sm">T</div>
            <h1 className="text-lg font-semibold tracking-tight">{tCreate('publishAppHeading')}</h1>
          </div>
          <nav className="flex items-center gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-full border border-gray-200 dark:border-white/5">
            {steps.map((stepInfo) => {
              const isActive = step === stepInfo.id;
              const isCompleted = step > stepInfo.id;
              return (
                <button
                  key={stepInfo.id}
                  onClick={() => setStep(stepInfo.id)}
                  className={`relative flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${isActive ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30' : isCompleted ? 'text-emerald-400 hover:bg-gray-200 dark:hover:bg-white/5' : 'text-gray-500 hover:text-gray-600 dark:hover:text-gray-200'}`}
                >
                  {isCompleted ? '✔️' : '•'}
                  {stepInfo.label}
                </button>
              );
            })}
          </nav>
          <div className="w-24 flex justify-end text-gray-400 dark:text-gray-500">
            <span className="text-xs text-gray-500 font-mono">v1.0</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 pb-16">
        {step === 0 ? (
          /* SourceStep Content */
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold mb-2">{tCreate('sourceSection')}</h2>
              <p className="text-gray-400">{tCreate('sourceHint')}</p>
            </div>

            <div className="bg-[#121212] border border-white/10 rounded-2xl p-1.5 flex w-full max-w-md mx-auto mb-8">
              <button onClick={() => onSubmissionTypeChange('code')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${submissionType === 'code' ? 'bg-[#1E1E1E] text-white shadow-sm border border-white/5' : 'text-gray-500 hover:text-gray-300'}`}>
                <span>{'</>'}</span>
                <span>{tCreate('optionPasteCode')}</span>
              </button>
              <button onClick={() => onSubmissionTypeChange('bundle')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${submissionType === 'bundle' ? 'bg-[#1E1E1E] text-white shadow-sm border border-white/5' : 'text-gray-500 hover:text-gray-300'}`}>
                <span>📦</span>
                <span>{tCreate('optionUploadBundle')}</span>
              </button>
            </div>

            <div className="flex gap-8 items-start flex-col lg:flex-row ">
              <div className="flex-1 w-full">
                <div className="bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/50 h-[400px] relative w-full">
                  {submissionType === 'code' ? (
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between px-4 py-2 bg-[#161616] border-b border-white/5">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500/80"></div>
                          <div className="w-3 h-3 rounded-full bg-yellow-500/40 border border-yellow-500/80"></div>
                          <div className="w-3 h-3 rounded-full bg-green-500/40 border border-green-500/80"></div>
                        </div>
                        <span className="text-xs text-gray-500 font-mono">index.html</span>
                        <div className="w-10"></div>
                      </div>
                      <div className="relative flex-1">
                        <textarea value={code} onChange={onCodeChange} placeholder="<!DOCTYPE html>..." className="w-full h-full bg-gray-50 dark:bg-[#0A0A0A] p-6 font-mono text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:bg-white dark:focus:bg-[#0c0c0c] resize-none leading-relaxed selection:bg-emerald-500/30 selection:text-black dark:selection:text-white transition-colors" />
                        <div className="absolute bottom-4 right-4 text-xs text-gray-500 dark:text-gray-600 font-mono bg-gray-200 dark:bg-black/50 px-2 py-1 rounded">{tCreate('charsCount').replace('{count}', code.length.toString())}</div>
                      </div>
                    </div>
                  ) : (
                    <div onClick={onBundleClick} className={`w-full h-full flex flex-col items-center justify-center border-2 border-dashed m-0 transition-all cursor-pointer relative ${bundleFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-gray-300 dark:border-white/10 bg-gray-50/[0.02] dark:bg-white/[0.02] hover:bg-gray-100/[0.04] dark:hover:bg-white/[0.04] hover:border-emerald-500/50'}`}>
                      {bundleFile ? (
                        <div className="flex flex-col items-center">
                          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6"><span className="text-3xl">✅</span></div>
                          <h4 className="text-lg font-medium mb-2">{bundleFile.name}</h4>
                          <p className="text-sm text-gray-500">{(bundleFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          <button onClick={(e) => { e.stopPropagation(); clearBundleSelection(); }} className="mt-6 text-xs text-red-400 hover:text-red-300 underline">{tCreate('removeFile')}</button>
                        </div>
                      ) : (
                        <>
                          <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-[#1E1E1E] flex items-center justify-center mb-6"><span className="text-3xl">☁️⬆️</span></div>
                          <h4 className="text-lg font-medium mb-2">{tCreate('chooseZip')}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-500">{tCreate('maxFileSize').replace('{size}', (screenshotMaxMb ?? 5).toString())}</p>
                        </>
                      )}
                      <input ref={bundleInputRef} type="file" accept=".zip" onChange={onBundleChange} className="hidden" />
                    </div>
                  )}
                </div>

                {/* Common Sections for both Code and Bundle */}
                <div className="mt-4 border-t border-gray-200 dark:border-white/10 pt-4 space-y-4">
                  {/* AI Warning */}
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30 p-3">
                    <p className="text-sm font-extrabold uppercase tracking-wide text-red-700 dark:text-red-400">
                      {tCreate('bundleAiWarning')}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-300">
                      {tCreate('bundleAiWarningDetail')}
                    </p>
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                      {tCreate('bundleAiNoKeyNote')}
                    </p>
                  </div>

                  {/* Bundle Error */}
                  {submissionType === 'bundle' && bundleError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30">
                      <p className="text-sm text-red-600 dark:text-red-400">{bundleError}</p>
                    </div>
                  )}

                  {/* Local Preview & Logs */}
                  {localPreviewUrl && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30">
                      <p className="text-sm text-emerald-700 dark:text-emerald-400">
                        {tCreate('bundleBuiltMessage')}{' '}
                        <a href={localPreviewUrl} className="underline font-semibold" target="_blank" rel="noreferrer">
                          {tCreate('openPreviewLink')}
                        </a>
                      </p>
                    </div>
                  )}
                  {localJobLog && (
                    <pre className="max-h-48 w-full overflow-y-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-400">
                      {localJobLog}
                    </pre>
                  )}

                  {/* Hints */}
                  <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                    <p>{tCreate('bundlePreviewHint')}</p>
                    <p className="text-amber-600 dark:text-amber-500">{tCreate('bundleTestingNote')}</p>
                    <p className="text-amber-600 dark:text-amber-500">{tCreate('bundleTestingPromptHint')}</p>
                  </div>

                  {/* Advanced Assets */}
                  <div className="border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden bg-gray-50 dark:bg-[#0A0A0A]">
                    <button
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${showAdvancedOptions ? 'bg-emerald-400' : 'bg-gray-600'}`}></div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">⚙️</span>
                          <span className="text-sm font-medium">Advanced Assets</span>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">{showAdvancedOptions ? '▲' : '▼'}</span>
                    </button>
                    {showAdvancedOptions && (
                      <div className="p-4 pt-0 border-t border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-black/40 space-y-4">
                        <p className="text-xs text-gray-600 dark:text-gray-500 mt-3">
                          Upload images or other assets that your app can access. Limit: {MAX_CUSTOM_ASSET_COUNT} files, {customAssetMaxKb}KB each.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => customAssetInputRef.current?.click()}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500"
                          >
                            Add Assets
                          </button>
                          <input ref={customAssetInputRef} type="file" accept="image/png,image/jpeg,image/gif" multiple className="hidden" onChange={handleCustomAssetInput} />
                          <span className="text-xs text-gray-500 dark:text-gray-500">
                            {customAssets.length} / {MAX_CUSTOM_ASSET_COUNT} files
                          </span>
                        </div>
                        {customAssetError && <p className="text-xs text-red-500">{customAssetError}</p>}
                        {customAssets.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {customAssets.map((asset: any) => (
                              <div key={asset.id} className="flex gap-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161616] p-3">
                                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-black">
                                  <Image src={asset.dataUrl} alt={asset.name} width={48} height={48} className="h-full w-full object-cover" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{asset.name}</p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-500">
                                    {Math.round((asset.size / 1024) * 10) / 10} KB
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => removeCustomAsset(asset.id)}
                                    className="text-xs font-semibold text-red-400 hover:text-red-300"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* LLM API Key */}
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tCreate('bundleAiApiLabel')}</label>
                    <input
                      type="text"
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      className="w-full bg-gray-100 dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 placeholder-gray-500"
                      placeholder={tCreate('bundleAiApiPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-48 lg:sticky lg:top-24">
                <button onClick={goNext} disabled={!canProceed} className={`w-full aspect-[4/1] lg:aspect-square rounded-2xl flex flex-col items-center justify-center gap-3 transition-all duration-300 ${canProceed ? 'bg-emerald-500 hover:bg-emerald-600 text-black shadow-[0_0_30px_-10px_rgba(16,185,129,0.6)] hover:shadow-[0_0_50px_-10px_rgba(16,185,129,0.8)] hover:-translate-y-1 active:translate-y-0 cursor-pointer' : 'bg-[#1E1E1E] text-gray-600 cursor-not-allowed opacity-50'}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${canProceed ? 'bg-black/10' : 'bg-white/5'}`}><span className="text-2xl">→</span></div>
                  <span className="font-bold text-lg tracking-wide">{tCreate('next')}</span>
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4 leading-relaxed">
                  {canProceed ? tCreate('readyToConfigure') : tCreate('pleaseEnterCode')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-8 mt-6">
            <div className="lg:col-span-7">
              {/* FormSection Content */}
              <div className="space-y-8 pb-20">
                {/* Identity */}
                <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-white/5 rounded-2xl p-6 space-y-6">
                  <div className="flex items-center gap-2 text-emerald-400 mb-2"><span className="text-lg">✏️</span><h3 className="text-sm font-bold uppercase tracking-wider">{tCreate('basicInfoHeading')}</h3></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="group">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tCreate('name')}</label>
                      <input type="text" name="name" value={manifestName} onChange={(e) => setManifestName(e.target.value)} className="w-full bg-gray-50 dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 placeholder-gray-500 dark:placeholder-gray-600" placeholder={tCreate('namePlaceholder')} />
                    </div>
                    <div className="group">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tCreate('description')}</label>
                      <input type="text" name="shortDescription" value={manifestDescription} onChange={(e) => setManifestDescription(e.target.value)} className="w-full bg-gray-50 dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 placeholder-gray-500 dark:placeholder-gray-600" placeholder={tCreate('descriptionPlaceholder')} />
                    </div>
                  </div>
                  <div className="group">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tCreate('longDescriptionLabel')}</label>
                    <textarea name="fullDescription" rows={4} value={longDescription} onChange={(e) => onLongDescription(e.target.value)} className="w-full bg-gray-50 dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 placeholder-gray-500 dark:placeholder-gray-600 resize-none" placeholder={tCreate('longDescriptionPlaceholder')} />
                  </div>
                  <div className="group">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tCreate('tagsLabel') || 'Tags'}</label>
                    <div className="flex flex-wrap gap-2">
                      {['games', 'quiz', 'learning', 'tools', 'business', 'entertainment', 'other'].map((tagId) => {
                        const isSelected = selectedTags.includes(tagId);
                        const canSelect = selectedTags.length < 2 || isSelected;
                        // Get translated tag name with fallback support
                        const displayLabel = getTagTranslation(tagId);
                        return (
                          <button
                            key={tagId}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTags(selectedTags.filter((t: string) => t !== tagId));
                              } else if (canSelect) {
                                setSelectedTags([...selectedTags, tagId]);
                              }
                            }}
                            disabled={!canSelect}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${isSelected
                              ? 'bg-emerald-500 text-white border-2 border-emerald-500 shadow-md'
                              : canSelect
                                ? 'bg-gray-100 dark:bg-[#1E1E1E] text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-white/10 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                                : 'bg-gray-50 dark:bg-[#0A0A0A] text-gray-400 dark:text-gray-600 border-2 border-gray-100 dark:border-white/5 cursor-not-allowed opacity-50'
                              }`}
                          >
                            {displayLabel}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{tCreate('tagsHint') || 'Select up to 2 tags'} ({selectedTags.length}/2)</p>
                  </div>
                </div>

                {/* Visuals */}
                <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-white/5 rounded-2xl p-6 space-y-6">
                  <div className="flex items-center gap-2 text-emerald-400 mb-2"><span className="text-lg">🎨</span><h3 className="text-sm font-bold uppercase tracking-wider">{tCreate('previewSectionHeading')}</h3></div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{tCreate('previewTitleLabel')}</label>
                    <input type="text" name="coverTitle" value={overlayTitle} onChange={(e) => setOverlayTitle(e.target.value)} className="w-full bg-gray-50 dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 placeholder-gray-500 dark:placeholder-gray-600" placeholder={tCreate('previewTitlePlaceholder')} />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Cover Art Style</label>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                      <button onClick={onPreviewUploadClick} className="aspect-square rounded-xl border border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/5 text-[10px] font-bold">
                        ⬆️<span>UPLOAD</span>
                      </button>
                      <input ref={previewInputRef} type="file" accept="image/*" onChange={onPreviewChange} className="hidden" />
                      {PREVIEW_PRESET_PATHS.slice(0, 9).map((presetPath: string, index: number) => (
                        <div key={presetPath} onClick={() => onPresetSelect(presetPath)} className={`aspect-square rounded-xl relative cursor-pointer transition-all duration-200 overflow-hidden flex items-center justify-center ${selectedPreset === presetPath && previewChoice === 'preset' ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-white dark:ring-offset-[#121212]' : 'hover:opacity-80'}`}>
                          <Image src={presetPath} alt={`Preset ${index + 1}`} layout="fill" objectFit="cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Screenshots */}
                <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-white/5 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 mb-2"><span className="text-lg">🖼️</span><h3 className="text-sm font-bold uppercase tracking-wider">{tCreate('screenshotsLabel')}</h3></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Array.from({ length: Math.max(2, screenshots.length || 2) }).map((_, idx) => {
                      const entry = screenshots?.[idx];
                      const error = screenshotErrors?.[idx];
                      return (
                        <div key={idx} className="bg-gray-50 dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-xl h-36 flex flex-col items-center justify-center p-3">
                          {entry ? (
                            <>
                              <div className="w-full h-24 rounded-md overflow-hidden mb-2 relative">
                                <Image src={entry.dataUrl} alt={`screenshot-${idx}`} layout="fill" className="object-cover" />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => onScreenshotRemove?.(idx)} className="text-xs text-red-400 underline">Remove</button>
                                <button onClick={() => screenshotInputRefs?.current?.[idx]?.click?.()} className="text-xs text-gray-500 dark:text-gray-400 underline">Replace</button>
                              </div>
                            </>
                          ) : (
                            <button onClick={() => screenshotInputRefs?.current?.[idx]?.click?.()} className="w-full h-full border-dashed border-2 border-gray-300 dark:border-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-emerald-500 hover:text-emerald-400 transition-colors group">
                              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 group-hover:text-emerald-400">+ Add Screenshot {idx + 1}</span>
                            </button>
                          )}
                          {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
                          <input ref={(el) => { if (screenshotInputRefs?.current) { screenshotInputRefs.current[idx] = el; } }} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onScreenshotChange?.(idx, e.target.files)} className="hidden" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Advanced Sections */}
                <div className="space-y-2">
                  {/* Storage & Rooms */}
                  <div className="border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden bg-white dark:bg-[#121212]">
                    <button onClick={() => setShowRooms(!showRooms)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-gray-800 dark:text-white">
                        <div className={`w-2 h-2 rounded-full ${showRooms ? 'bg-emerald-400' : 'bg-gray-600'}`}></div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">💾</span>
                          <span className="text-sm font-medium">{tCreate('roomsHeading')}</span>
                          <span className="ml-2 rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                            {tCreate('betaLabel')}
                          </span>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">{showRooms ? '▲' : '▼'}</span>
                    </button>
                    {showRooms && (
                      <div className="p-4 pt-0 border-t border-white/5 bg-black/40">
                        <p className="text-xs text-gray-600 dark:text-gray-500 mb-3 mt-3">{tCreate('roomsDescription')}</p>
                        <div className="group">
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Storage Mode</label>
                          <div className="relative">
                            <select
                              name="storageMode"
                              value={roomsMode}
                              onChange={(e) => setRoomsMode(e.target.value)}
                              className="w-full bg-gray-100 dark:bg-[#161616] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm appearance-none focus:outline-none focus:border-emerald-400 cursor-pointer"
                            >
                              <option value="off">{tCreate('roomsOptionOff')}</option>
                              <option value="optional">{tCreate('roomsOptionOptional')}</option>
                              <option value="required">{tCreate('roomsOptionRequired')}</option>
                            </select>
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▼</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Localization */}
                  <div className="border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden bg-white dark:bg-[#121212]">
                    <button onClick={() => setShowTrans(!showTrans)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-gray-800 dark:text-white">
                        <div className={`w-2 h-2 rounded-full ${showTrans ? 'bg-emerald-400' : 'bg-gray-600'}`}></div>
                        <div className="flex items-center gap-2"><span className="text-sm">🌐</span><span className="text-sm font-medium">{tCreate('translationsHeading')}</span></div>
                      </div>
                      <span className="text-gray-400 text-xs">{showTrans ? '▲' : '▼'}</span>
                    </button>
                    {showTrans && (
                      <div className="p-4 pt-0 border-t border-white/5 bg-black/40">
                        <div className="space-y-2 mt-3">
                          {languages.map((lang) => {
                            const isExpanded = expandedLang === lang.code;
                            const langData = lang.data;
                            return (
                              <div key={lang.code} className="border border-gray-200 dark:border-white/5 rounded-lg overflow-hidden bg-gray-100 dark:bg-[#161616]">
                                <button
                                  onClick={() => setExpandedLang(isExpanded ? null : lang.code)}
                                  className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-200 dark:hover:bg-white/5 transition-colors"
                                >
                                  <span className="text-xs font-medium">{lang.label}</span>
                                  <div className="flex items-center gap-2">
                                    {langData && langData.title ? (
                                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                        Edited
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500">Empty</span>
                                    )}
                                    <span className={`text-gray-500 text-xs ${isExpanded ? 'rotate-180' : ''}`}>
                                      ▼
                                    </span>
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="p-3 pt-0 border-t border-white/5 space-y-3">
                                    <div className="mt-3">
                                      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        Title ({lang.label})
                                      </label>
                                      <input
                                        type="text"
                                        value={langData.title}
                                        onChange={(e) => handleTranslationChange(lang.handler, 'title', e.target.value)}
                                        className="w-full bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-400"
                                        placeholder={`Translated title for ${lang.label}`}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        Description ({lang.label})
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={langData.description}
                                        onChange={(e) => handleTranslationChange(lang.handler, 'description', e.target.value)}
                                        className="w-full bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-400 resize-none"
                                        placeholder={`Translated description for ${lang.label}`}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Back Button */}
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors mb-4"
                >
                  <span>←</span> {tCreate('back')}
                </button>
              </div>
            </div>

            {/* LivePreview Content */}
            <div className="lg:col-span-5 hidden lg:block relative">
              <div className="sticky top-24 space-y-6">
                <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-white/10 rounded-2xl p-5 shadow-lg">
                  <div className="flex justify-between items-end mb-2">
                    <h3 className="text-sm font-bold">Completion Status</h3>
                    <span className="text-xs font-mono text-emerald-400">{completionCount}/{completionTotal}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <StatusChip label="Code" completed={!!hasCode} />
                    <StatusChip label="Info" completed={hasTitle && hasDesc} />
                    <StatusChip label="Details" completed={hasDetailed} />
                    <StatusChip label="Visuals" completed={hasGraphic} />
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-b from-emerald-500/20 to-transparent rounded-2xl blur opacity-50 group-hover:opacity-75 transition duration-500"></div>
                  <div className="relative bg-[#050505] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    <div className={`aspect-video w-full relative overflow-hidden ${finalPreviewUrl ? '' : gradientClass}`}>
                      {finalPreviewUrl && <Image src={finalPreviewUrl} layout="fill" objectFit="cover" alt="App Preview" />}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg">
                          <span className="text-2xl text-white ml-1">▶</span>
                        </div>
                      </div>
                      {overlayTitle && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md p-3 border-t border-white/5">
                          <p className="text-white text-sm font-bold text-center truncate tracking-wide">{overlayTitle}</p>
                        </div>
                      )}
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <h3 className="text-lg font-bold leading-tight mb-1">{manifestName || 'Untitled App'}</h3>
                        <p className="text-xs text-gray-400 line-clamp-2">{manifestDescription || 'No description provided yet.'}</p>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700"></div>
                          <span className="text-[10px] text-gray-500">by You</span>
                        </div>
                        <div className="flex gap-1"><Badge text="FREE" /><Badge text="v1.0" /></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Terms of Service Checkbox */}
                {needsTermsConsent && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                      {tCreate('publishTermsPrompt', { terms: termsLabel })}
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={publishTermsChecked}
                        onChange={(e) => {
                          setPublishTermsChecked(e.target.checked);
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-gray-800 dark:text-gray-300 leading-snug">
                        {tCreate('publishTermsCheckbox')}
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={onOpenTerms}
                        className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline underline-offset-2"
                      >
                        {tCreate('publishTermsButton')}
                      </button>
                    </div>
                    {publishTermsError && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">{publishTermsError}</p>
                    )}
                  </div>
                )}

                {/* Publish Errors */}
                {(authError || publishError || (!isSignedIn)) && (
                  <div className="space-y-2">
                    {!isSignedIn && (
                      <p className="text-xs text-red-600 dark:text-red-400 text-center">
                        {tCreate('mustSignIn')}{' '}
                        <Link href={loginHref} className="underline font-bold">
                          {tCreate('login')}
                        </Link>
                      </p>
                    )}
                    {authError && (
                      <p className="text-xs text-red-600 dark:text-red-400 text-center">
                        {authError}{' '}
                        <Link href={loginHref} className="underline font-bold">
                          {tCreate('login')}
                        </Link>
                      </p>
                    )}
                    {publishError && (
                      <p className="text-xs text-red-600 dark:text-red-400 text-center font-medium">
                        {publishError}
                      </p>
                    )}
                  </div>
                )}

                <button onClick={publish} disabled={publishing || !allReady || (needsTermsConsent && !publishTermsChecked) || !isSignedIn} className="w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all transform shadow-lg flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black dark:text-black shadow-emerald-500/20 hover:-translate-y-0.5 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none">
                  <span>{publishing ? tCreate('publishingButton') : tCreate('publishButton')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div >
  );
}
