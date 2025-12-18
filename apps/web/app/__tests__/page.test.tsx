/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import MarketplacePage from '../page';

const mockGetListings = vi.fn();
(global as any).React = React;
(global as any).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
vi.mock('next/image', () => ({
  default: ({ fill, unoptimized, prefetch, ...props }: any) => <img {...props} alt="" />,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => undefined,
  }),
  headers: () => new Headers(),
}));
vi.mock('@/components/Avatar', () => ({ default: () => <div /> }));
vi.mock('@/components/Logo', () => ({ default: () => <div /> }));
vi.mock('@/components/Confetti', () => ({ triggerConfetti: () => {} }));
vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/lib/config', () => ({
  API_URL: '',
  SITE_NAME: '',
  PUBLIC_API_URL: '/api',
  PUBLIC_APPS_HOST: '/public/builds',
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: null }),
  getDisplayName: () => '',
}));
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('@/lib/loaders', () => ({
  getListings: (...args: any[]) => mockGetListings(...args),
}));

beforeEach(() => {
  mockGetListings.mockReset();
});

it('se prikazuje hero sekcija i kada API vrati gresku', async () => {
  mockGetListings
    .mockRejectedValueOnce(new Error('HTTP 500'))
    .mockResolvedValue({ items: [] });
  const Component = await MarketplacePage();
  render(Component);
  expect(await screen.findByText('Discover Amazing Mini-Apps & Games')).toBeInTheDocument();
});
