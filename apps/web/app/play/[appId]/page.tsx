import PlayPageClient from './PlayPageClient';

// This page now uses the new PlayPageClient which handles the iframe loading
// with 'src' attribute and the storage migration logic.

export default async function Page({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <PlayPageClient appId={appId} />;
}