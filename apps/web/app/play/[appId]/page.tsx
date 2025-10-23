import PlayPageClient from './PlayPageClient';

export default async function Page({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <PlayPageClient appId={appId} />;
}