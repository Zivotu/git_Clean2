import type { Metadata } from 'next';

import StvaranjeTimaClient from './StvaranjeTimaClient';

export const metadata: Metadata = {
  title: 'Stvaranje Thesara tima',
  description: 'Pridruži se timu koji gradi Thesara AI marketplace.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: 'https://www.thesara.space/stvaranje_tima',
  },
};

export default function StvaranjeTimaPage() {
  return <StvaranjeTimaClient />;
}
