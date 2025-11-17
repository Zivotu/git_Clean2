import type { RoomsMode } from '../types.js';

export const ROOMS_MODE_VALUES: RoomsMode[] = ['off', 'optional', 'required'];
const DEFAULT_ROOMS_MODE: RoomsMode = 'off';

export function normalizeRoomsMode(value: unknown): RoomsMode {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (ROOMS_MODE_VALUES.includes(normalized as RoomsMode)) {
      return normalized as RoomsMode;
    }
    if (['disabled', 'none'].includes(normalized)) {
      return 'off';
    }
    if (['enabled', 'on', 'true'].includes(normalized)) {
      return 'optional';
    }
  }
  return DEFAULT_ROOMS_MODE;
}
