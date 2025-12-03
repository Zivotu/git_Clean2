'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ComponentType, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Users2, Home, PartyPopper, BriefcaseBusiness, Plane, Music2, BookOpen } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { requestAdminUnlock } from '@/lib/adminAccess';
import { ApiError } from '@/lib/api';

type IconKey = 'health' | 'family' | 'house' | 'fun' | 'work' | 'travel' | 'music' | 'knowledge';

type IconButton = {
  id: IconKey;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
};

const ICONS: IconButton[] = [
  { id: 'health', label: 'Zdravlje', icon: Heart },
  { id: 'family', label: 'Obitelj', icon: Users2 },
  { id: 'house', label: 'Kuća', icon: Home },
  { id: 'fun', label: 'Zabava', icon: PartyPopper },
  { id: 'work', label: 'Posao', icon: BriefcaseBusiness },
  { id: 'travel', label: 'Putovanja', icon: Plane },
  { id: 'music', label: 'Glazba', icon: Music2 },
  { id: 'knowledge', label: 'Znanje', icon: BookOpen },
];

const UNLOCK_SEQUENCE: IconKey[] = ['health', 'family', 'house', 'fun'];

function shuffleIcons(): IconButton[] {
  const list = [...ICONS];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

type AdminAccessTriggerProps = {
  className?: string;
};

export default function AdminAccessTrigger({ className = 'fixed bottom-6 right-6' }: AdminAccessTriggerProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [icons, setIcons] = useState<IconButton[]>(() => shuffleIcons());
  const [sequence, setSequence] = useState<IconKey[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handle = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
        setSequence([]);
        setShowPassword(false);
        setPassword('');
        setError(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const resetSequence = useCallback(() => {
    setSequence([]);
    setShowPassword(false);
    setPassword('');
  }, []);

  useEffect(() => {
    if (!user && open) {
      setOpen(false);
      resetSequence();
      setError(null);
    }
  }, [open, resetSequence, user]);

  const handleToggle = useCallback(() => {
    if (!open) {
      setIcons(shuffleIcons());
      resetSequence();
      setError(null);
    }
    setOpen((prev) => !prev);
  }, [open, resetSequence]);

  const handleSelect = useCallback(
    (id: IconKey) => {
      if (!open || showPassword) return;
      setError(null);
      setSequence((prev) => {
        const next = [...prev, id];
        const expected = UNLOCK_SEQUENCE[next.length - 1];
        if (expected !== id) {
          setError('Netočna kombinacija.');
          return [];
        }
        if (next.length === UNLOCK_SEQUENCE.length) {
          setShowPassword(true);
        }
        return next;
      });
    },
    [open, showPassword],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!showPassword) return;
      if (!user || !user.email) {
        setError('Prijavite se s dopuštenog računa.');
        return;
      }
      const pin = password.trim();
      if (!pin) {
        setError('Unesite PIN.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await requestAdminUnlock(pin);
        if (result.requiresRefresh) {
          try {
            await user.getIdToken(true);
          } catch {}
        }
        setOpen(false);
        resetSequence();
        setPassword('');
        router.push('/admin');
      } catch (err) {
        console.error('Neuspjela provjera admin PIN-a', err);
        if (err instanceof ApiError) {
          switch (err.code) {
            case 'invalid_pin':
              setError('PIN nije točan.');
              break;
            case 'not_allowed':
              setError('Nemate dopuštenje za admin sučelje.');
              break;
            case 'too_many_attempts':
              setError('Previše pokušaja. Pričekajte prije novog unosa.');
              break;
            case 'missing_email':
              setError('Račun nema potvrđenu e-poštu.');
              break;
            default:
              setError(err.message || 'Neuspjela provjera PIN-a.');
          }
        } else {
          setError('Neuspjela provjera PIN-a.');
        }
      } finally {
        setLoading(false);
      }
    },
    [password, resetSequence, router, showPassword, user],
  );

  if (authLoading || !user?.email) {
    return null;
  }

  return (
    <div className={`z-[100] ${className}`}>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center justify-center rounded-full bg-gray-400/50 hover:bg-gray-500/60 transition p-0"
          style={{ width: 10, height: 10 }}
          aria-label="Otvori skriveni izbornik"
        />
        {open && (
          <div className="absolute bottom-full right-0 mb-3 w-48 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
            <div className="grid grid-cols-4 gap-2">
              {icons.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-transparent bg-gray-100 text-gray-600 transition hover:bg-emerald-100 hover:text-emerald-700"
                  aria-label={label}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
            {showPassword && (
              <form onSubmit={handleSubmit} className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-gray-500" htmlFor="admin-password">
                  Lozinka
                </label>
                <input
                  id="admin-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoFocus
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {loading ? 'Provjera…' : 'Potvrdi'}
                </button>
              </form>
            )}
            {error && (
              <div className="mt-3 rounded bg-rose-50 px-2 py-1 text-xs text-rose-600">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
