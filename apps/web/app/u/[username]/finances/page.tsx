import React, { Suspense } from 'react';
import CreatorFinancesClient from '../../finances/CreatorFinancesClient';

export default function UserFinancesPage({ params, searchParams }: { params: { username: string }; searchParams: Record<string, any> }) {
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
