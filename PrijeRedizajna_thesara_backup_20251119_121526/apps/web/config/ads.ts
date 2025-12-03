export const ADSENSE_CLIENT_ID = 'ca-pub-6033457404467547';

export const AD_SLOT_IDS = {
  playTop: process.env.NEXT_PUBLIC_ADS_SLOT_PLAY_TOP ?? '',
  playBottom: process.env.NEXT_PUBLIC_ADS_SLOT_PLAY_BOTTOM ?? '',
  appDetailHeader: process.env.NEXT_PUBLIC_ADS_SLOT_APP_HEADER ?? '',
  appDetailInline: process.env.NEXT_PUBLIC_ADS_SLOT_APP_INLINE ?? '',
  homeRailLeft: process.env.NEXT_PUBLIC_ADS_SLOT_HOME_RAIL_LEFT ?? '',
  homeRailRight: process.env.NEXT_PUBLIC_ADS_SLOT_HOME_RAIL_RIGHT ?? '',
  homeGridInline: process.env.NEXT_PUBLIC_ADS_SLOT_HOME_GRID_INLINE ?? '',
  homeFeedFooter: process.env.NEXT_PUBLIC_ADS_SLOT_HOME_FEED_FOOTER ?? '',
  marketplaceGridInline: process.env.NEXT_PUBLIC_ADS_SLOT_MARKETPLACE_GRID_INLINE ?? '',
} as const;

export type AdSlotKey = keyof typeof AD_SLOT_IDS;

export const ADSENSE_TEST_MODE =
  process.env.NEXT_PUBLIC_ADS_TEST_MODE === 'on' || process.env.NODE_ENV !== 'production';
