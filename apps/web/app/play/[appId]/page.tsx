import { Suspense } from 'react';
import ClientPlayPage from '../ClientPlayPage';

export default async function PlayAppPage({
  params,
}: {
  params: Promise<{ appId?: string }>;
}) {
  const { appId = '' } = await params;

  return (
    <Suspense fallback={null}>
      <ClientPlayPage appId={appId} />
    </Suspense>
  );
}

