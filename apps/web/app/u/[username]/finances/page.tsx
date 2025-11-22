import React, { Suspense } from 'react';
import CreatorFinancesClient from '../../finances/CreatorFinancesClient';

export default async function UserFinancesPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, any>>;
}) {
  const params = await props.params;
  const username = params.username;
  // Preserve onboarding flag by passing it through to the client via the URL
  // The client reads searchParams from the browser, so server-side we only provide initial handle
  return (
    <Suspense fallback={null}>
      {/* initialHandle ensures the client fetches metrics for this username */}
      <CreatorFinancesClient initialHandle={username} />
    </Suspense>
  );
}
