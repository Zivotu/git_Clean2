import { apiGet } from './api';

const handleCache: Record<string, string> = {};
type CreatorProfile = {
  id: string;
  handle?: string;
  displayName?: string;
  photoURL?: string;
};
const profileCache: Record<string, CreatorProfile> = {};

export async function getCreatorProfile(
  uid: string,
): Promise<CreatorProfile | undefined> {
  if (!uid) return undefined;
  if (profileCache[uid]) return profileCache[uid];
  try {
    const res = await apiGet<{
      id?: string;
      handle?: string;
      displayName?: string;
      name?: string;
      photoURL?: string;
      photo?: string;
      avatarUrl?: string;
    }>(`creators/id/${encodeURIComponent(uid)}`);
    if (!res) return undefined;
    const profile: CreatorProfile = {
      id: res.id || uid,
      handle: res.handle || undefined,
      displayName: res.displayName || res.name || undefined,
      photoURL: res.photoURL || res.photo || res.avatarUrl || undefined,
    };
    profileCache[uid] = profile;
    if (profile.handle) {
      handleCache[uid] = profile.handle;
    }
    return profile;
  } catch {
    return undefined;
  }
}

export async function getCreatorHandle(uid: string): Promise<string | undefined> {
  if (!uid) return undefined;
  if (handleCache[uid]) return handleCache[uid];
  const profile = await getCreatorProfile(uid);
  return profile?.handle;
}

