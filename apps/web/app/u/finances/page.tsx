import React, { Suspense } from 'react';
import CreatorFinancesClient from './CreatorFinancesClient';

export default function CreatorFinancesPage() {
  return (
    <Suspense fallback={null}>
      <CreatorFinancesClient />
    </Suspense>
  );
}
