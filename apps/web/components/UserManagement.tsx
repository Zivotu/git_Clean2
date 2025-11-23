'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useI18n } from '@/lib/i18n-provider';
import {
  Search,
  Filter,
  MoreHorizontal,
  X,
  Check,
  Shield,
  User as UserIcon,
  Loader2,
  AlertTriangle
} from 'lucide-react';

interface User {
  uid: string;
  email: string;
  displayName: string;
  customClaims: Record<string, any>;
  disabled: boolean;
  ambassador?: {
    status: string;
  };
}

const ENTITLEMENTS = ['isGold', 'noAds', 'Ambasador', 'Partner'];

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [entitlementFilter, setEntitlementFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const { messages } = useI18n();
  const tAdmin = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = messages[`Admin.${key}`] || key;
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          value = value.replaceAll(`{${paramKey}}`, String(paramValue));
        }
      }
      return value;
    },
    [messages],
  );
  const entitlementOptions = useMemo(
    () =>
      ENTITLEMENTS.map((value) => ({
        value,
        label: messages[`Admin.users.entitlements.${value}`] || value,
      })),
    [messages],
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ users: User[] }>('/admin/users', { auth: true });
      setUsers(data.users || []);
    } catch (err) {
      setError(tAdmin('users.loadFailed'));
      console.error(err);
    }
    setLoading(false);
  }, [tAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const userHasEntitlement = (user: User, entitlement: string) => {
    if (entitlement === 'Ambasador') {
      return user.ambassador?.status === 'approved';
    }
    return !!user.customClaims?.[entitlement];
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    // entitlement filter
    if (entitlementFilter !== 'all' && !userHasEntitlement(u, entitlementFilter)) return false;
    // search query: match email, displayName, or uid
    if (!normalizedQuery) return true;
    const email = (u.email || '').toLowerCase();
    const name = (u.displayName || '').toLowerCase();
    const uid = (u.uid || '').toLowerCase();
    return email.includes(normalizedQuery) || name.includes(normalizedQuery) || uid.includes(normalizedQuery);
  });

  const handleClaimChange = async (user: User, claim: string, value: boolean) => {
    if (claim === 'noAds') {
      try {
        await apiPost(`/admin/users/${user.uid}/no-ads`, { enabled: value }, { auth: true });
      } catch (err) {
        setError(tAdmin('users.updateFailed'));
        console.error(err);
        return;
      }
    }
    const newClaims = { ...user.customClaims };
    if (value) {
      newClaims[claim] = true;
      if (claim === 'Partner') {
        newClaims['isGold'] = true;
      }
    } else {
      delete newClaims[claim];
      if (claim === 'Partner') {
        delete newClaims['isGold'];
      }
    }

    try {
      await apiPost(`/admin/users/${user.uid}/claims`, { claims: newClaims }, { auth: true });
      // Refresh users
      await loadUsers();
      // Update local state for immediate feedback if editing
      if (editingUser && editingUser.uid === user.uid) {
        setEditingUser({ ...user, customClaims: newClaims });
      }
    } catch (err) {
      setError(tAdmin('users.updateFailed'));
      console.error(err);
    }
  };

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tAdmin('users.heading')}</h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={entitlementFilter}
              onChange={(e) => setEntitlementFilter(e.target.value)}
              className="w-full sm:w-48 pl-10 pr-8 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all"
            >
              <option value="all">{tAdmin('users.filterAll')}</option>
              {entitlementOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tAdmin('users.searchPlaceholder')}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="m-4 rounded-lg border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm">{tAdmin('users.loading')}</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-zinc-800/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">{tAdmin('users.table.email')}</th>
                <th className="px-6 py-3 font-medium">{tAdmin('users.table.displayName')}</th>
                <th className="px-6 py-3 font-medium">{tAdmin('users.table.entitlements')}</th>
                <th className="px-6 py-3 font-medium text-right">{tAdmin('users.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    No users found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-medium text-xs shrink-0">
                          {user.email?.charAt(0).toUpperCase() || '?'}
                        </div>
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{user.displayName || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {user.ambassador?.status === 'approved' && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-900/30">
                            {tAdmin('users.badges.ambassador')}
                          </span>
                        )}
                        {Object.keys(user.customClaims || {}).map(claim => (
                          <span key={claim} className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium border border-emerald-100 dark:border-emerald-900/30">
                            {claim}
                          </span>
                        ))}
                        {user.ambassador?.status !== 'approved' && Object.keys(user.customClaims || {}).length === 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-zinc-700">
                            {tAdmin('users.badges.free')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                        title={tAdmin('buttons.edit')}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {tAdmin('users.editTitle', { email: editingUser.email || '' })}
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                  Entitlements
                </label>
                {ENTITLEMENTS.map(entitlement => {
                  const isAmbassador = entitlement === 'Ambasador';
                  const isChecked = isAmbassador ? editingUser.ambassador?.status === 'approved' : !!editingUser.customClaims?.[entitlement];
                  const label = entitlementOptions.find((option) => option.value === entitlement)?.label || entitlement;

                  return (
                    <label
                      key={entitlement}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${isChecked
                          ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30'
                          : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-800'
                        } ${isAmbassador ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-600'
                          }`}>
                          {isChecked && <Check className="h-3 w-3" />}
                        </div>
                        <span className={`text-sm font-medium ${isChecked ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-300'}`}>
                          {label}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isChecked}
                        disabled={isAmbassador}
                        onChange={(e) => handleClaimChange(editingUser, entitlement, e.target.checked)}
                      />
                      {isAmbassador && <Shield className="h-4 w-4 text-slate-400" />}
                    </label>
                  );
                })}
              </div>

              {editingUser.ambassador?.status === 'approved' && (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  * Ambassador status is managed in the Ambassador Program tab.
                </p>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-800 flex justify-end">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {tAdmin('buttons.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
