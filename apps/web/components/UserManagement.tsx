'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '@/lib/api';

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

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ users: User[] }>('/admin/users', { auth: true });
      setUsers(data.users || []);
    } catch (err) {
      setError('Failed to load users.');
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const userHasEntitlement = (user: User, entitlement: string) => {
    if (entitlement === 'Ambasador') {
      return user.ambassador?.status === 'approved';
    }
    return !!user.customClaims?.[entitlement];
  };

  const entitlements = ENTITLEMENTS;
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
    } catch (err) {
      setError('Failed to update user claims.');
      console.error(err);
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">User Management</h2>
      {loading && <p>Loading users...</p>}
      {error && <p className="text-red-500">{error}</p>}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <label className="mr-2 font-medium">Filter by entitlement:</label>
            <select value={entitlementFilter} onChange={(e) => setEntitlementFilter(e.target.value)} className="border px-2 py-1 rounded">
              <option value="all">All</option>
              {entitlements.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mr-2 font-medium">Search:</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, name or uid"
              className="border px-2 py-1 rounded"
            />
          </div>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Display Name</th>
              <th className="text-left p-2">Entitlements</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.uid} className="border-t">
                <td className="p-2">{user.email}</td>
                <td className="p-2">{user.displayName}</td>
                <td className="p-2">
                  {user.ambassador?.status === 'approved' && (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 mr-1">
                      Ambasador
                    </span>
                  )}
                  {Object.keys(user.customClaims || {}).map(claim => (
                    <span key={claim} className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 mr-1">
                      {claim}
                    </span>
                  ))}
                  {user.ambassador?.status !== 'approved' && Object.keys(user.customClaims || {}).length === 0 && (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 mr-1">
                      Free
                    </span>
                  )}
                </td>
                <td className="p-2">
                  <button onClick={() => setEditingUser(user)} className="px-2 py-1 border rounded">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 max-w-2xl max-h-[80vh] overflow-auto rounded space-y-2">
            <h3 className="text-lg font-semibold">Edit User: {editingUser.email}</h3>
            <div>
              {ENTITLEMENTS.map(entitlement => {
                const isAmbassador = entitlement === 'Ambasador';
                const isChecked = isAmbassador ? editingUser.ambassador?.status === 'approved' : !!editingUser.customClaims?.[entitlement];
                return (
                  <div key={entitlement} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`${editingUser.uid}-${entitlement}`}
                      checked={isChecked}
                      disabled={isAmbassador}
                      onChange={(e) => handleClaimChange(editingUser, entitlement, e.target.checked)}
                    />
                    <label htmlFor={`${editingUser.uid}-${entitlement}`} className="ml-2">{entitlement}</label>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setEditingUser(null)} className="px-2 py-1 border rounded">Close</button>
          </div>
        </div>
      )}
    </section>
  );
}
