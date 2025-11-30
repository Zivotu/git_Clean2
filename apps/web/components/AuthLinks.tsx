'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLoginHref } from '@/hooks/useLoginHref';

export default function AuthLinks() {
  const { user } = useAuth();
  const loginHref = useLoginHref();
  if (user) {
    return (
      <Link href="/profile" className="hover:underline" title="My profile">
        Profile
      </Link>
    );
  }
  return (
    <Link href={loginHref} className="hover:underline" title="Log in">
      Login
    </Link>
  );
}
