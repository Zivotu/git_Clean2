'use client';

import { Suspense } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useAppDetails } from './hooks/useAppDetails';
import AppHeader from './components/AppHeader';
import AppGallery from './components/AppGallery';
import AppEditForm from './components/AppEditForm';
import AppInfo from './components/AppInfo';
import { ConfirmDialog, Toast, LoginPromptModal, PayModal, ReportModal } from './components/AppModals';
import PublicAppView from './PublicAppView';
import { AD_SLOT_IDS } from '@/config/ads';

function AppDetailClient() {
  const { isDark } = useTheme();
  const details = useAppDetails();
  const {
    item, loading, fetchError, toast, setToast,
    showSoftDialog, setShowSoftDialog,
    showHardDialog, setShowHardDialog,
    performDelete,
    showPayModal, setShowPayModal,
    showLoginPrompt, setShowLoginPrompt,
    showReport, setShowReport,
    reportText, setReportText,
    reportBusy, submitReport,
    showContentReport, setShowContentReport,
    contentReportText, setContentReportText,
    contentReportBusy, submitContentReport,
    canEdit,
    tApp,
  } = details;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (fetchError || !item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className={`text-lg font-medium ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
          {fetchError === 'failed_to_load' ? 'Failed to load app details' : 'App not found'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-emerald-600 px-6 py-2 text-white hover:bg-emerald-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const showStatusNotice = !details.isPublished;
  const isNew = false; // Logic for new apps can be added if needed
  const formattedPrice = typeof item.price === 'number' && item.price > 0
    ? new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(item.price)
    : 'Besplatno';

  const playButtonState = !details.user
    ? 'login'
    : (item.price && item.price > 0 && !(item as any).purchased && item.author?.uid !== details.user.uid)
      ? 'pay'
      : 'play';


  console.log('[AppDetailClient] canEdit:', canEdit, 'user:', details.user?.uid, 'author:', item.author?.uid);

  if (!canEdit) {
    return (
      <>
        <PublicAppView
          item={item}
          authorHandle={details.authorHandle}
          relativeCreated={details.relativeCreated}
          isNew={isNew}
          showStatusNotice={showStatusNotice}
          canViewUnpublished={details.canViewUnpublished}
          appState={details.appState}
          visibility={details.visibility}
          formattedPrice={formattedPrice}
          playsDisplay={item.playsCount?.toLocaleString() || '0'}
          likeCount={details.likeCount}
          liked={details.liked}
          likeBusy={details.likeBusy}
          copySuccess={details.copySuccess}
          buildBadgesSlot={null}
          previewSrc={details.activePreviewSrc}
          onPreviewError={() => details.setPreviewDisplayFailed(true)}
          playButtonState={playButtonState}
          onPlay={details.playListing}
          onRequireLogin={() => setShowLoginPrompt(true)}
          onRequirePurchase={() => setShowPayModal(true)}
          toggleLike={details.toggleLike}
          copyLink={details.copyLink}
          adHeaderSlot={AD_SLOT_IDS.appDetailHeader}
          adInlineSlot={AD_SLOT_IDS.appDetailInline}
          tApp={tApp}
          showContentReport={showContentReport}
          setShowContentReport={setShowContentReport}
          contentReportText={contentReportText}
          setContentReportText={setContentReportText}
          contentReportBusy={contentReportBusy}
          submitContentReport={submitContentReport}
          viewerIdentity={details.viewerHandle || ''}
          descriptionFallback={tApp('viewer.description.empty', undefined, 'Nema opisa.')}
          user={details.user}
        />
        {/* Modals for Public View */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        {showLoginPrompt && (
          <LoginPromptModal
            open={showLoginPrompt}
            onClose={() => setShowLoginPrompt(false)}
          />
        )}
        {showPayModal && item && (
          <PayModal
            open={showPayModal}
            item={item}
            onClose={() => setShowPayModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className={`min-h-screen pb-20 pt-24 transition-colors duration-300 ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AppHeader details={details} />

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Gallery & Preview */}
          <div className="lg:col-span-2 space-y-8">
            <AppGallery details={details} />

            {/* Edit Form for Owners */}
            {canEdit && <AppEditForm details={details} />}
          </div>

          {/* Right Column: Info & Details */}
          <div className="space-y-8">
            <AppInfo details={details} />
          </div>
        </div>
      </div>

      {/* Modals & Toasts */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        open={showSoftDialog}
        title="Remove from Marketplace?"
        message="This will hide your app from the public marketplace. Users with the direct link can still play it."
        confirmLabel="Remove"
        confirmTone="danger"
        onConfirm={() => performDelete(false)}
        onClose={() => setShowSoftDialog(false)}
      />

      <ConfirmDialog
        open={showHardDialog}
        title="Delete Permanently?"
        message="This action cannot be undone. This will permanently delete your app, all assets, and data."
        confirmLabel="Delete Forever"
        confirmTone="danger"
        requireText="delete"
        onConfirm={() => performDelete(true)}
        onClose={() => setShowHardDialog(false)}
      />

      {showLoginPrompt && (
        <LoginPromptModal
          open={showLoginPrompt}
          onClose={() => setShowLoginPrompt(false)}
        />
      )}

      {showPayModal && item && (
        <PayModal
          open={showPayModal}
          item={item}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {/* Issue Report Modal (for Owners) */}
      {showReport && (
        <ReportModal
          open={showReport}
          title="Report an Issue"
          description="Describe the technical issue you are facing with your app."
          value={reportText}
          onChange={setReportText}
          onSubmit={submitReport}
          onClose={() => setShowReport(false)}
          busy={reportBusy}
          placeholder="Describe the bug or issue..."
        />
      )}

      {/* Content Report Modal (for Viewers) */}
      {showContentReport && (
        <ReportModal
          open={showContentReport}
          title="Report Content"
          description="Why are you reporting this content?"
          value={contentReportText}
          onChange={setContentReportText}
          onSubmit={submitContentReport}
          onClose={() => setShowContentReport(false)}
          busy={contentReportBusy}
          placeholder="Describe why this content is inappropriate..."
        />
      )}
    </div>
  );
}

export default function AppDetailPage() {
  return (
    <Suspense fallback={null}>
      <AppDetailClient />
    </Suspense>
  );
}
