import { AssetDefinition, AssetType } from './types';

export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;
export const FPS = 60;

export const ADMIN_PIN = "7777";

// Slowed down player speed (was 7)
export const PLAYER_SPEED = 5.5; 
export const PLAYER_HITBOX_RADIUS = 4;
export const INITIAL_LIVES = 3;
export const INITIAL_BOMBS = 3;
export const MAX_WEAPON_LEVEL = 5;

// Rank System
export const RANK_INCREASE_KILL = 0.005;
export const RANK_DECREASE_DEATH = 0.15;
export const RANK_INCREASE_TIME = 0.0001;

// Medal Chaining
export const MEDAL_VALUES = [100, 200, 500, 1000, 5000, 10000, 50000];

// Asset Manifest - Root paths
export const ASSETS: AssetDefinition[] = [
  // Player
  { key: 'player_ship', path: './player_ship.png', type: AssetType.SPRITE, fallbackColor: '#3b82f6', fallbackShape: 'triangle' },
  { key: 'player_bullet', path: './p_bullet.png', type: AssetType.SPRITE, fallbackColor: '#fbbf24', fallbackShape: 'rect' },
  { key: 'player_missile', path: './p_missile.png', type: AssetType.SPRITE, fallbackColor: '#f87171', fallbackShape: 'rect' },
  
  // Enemies
  { key: 'enemy_fighter', path: './enemy_small.png', type: AssetType.SPRITE, fallbackColor: '#9ca3af', fallbackShape: 'triangle' },
  { key: 'enemy_tank', path: './enemy_tank.png', type: AssetType.SPRITE, fallbackColor: '#4b5563', fallbackShape: 'rect' },
  { key: 'enemy_bomber', path: './enemy_large.png', type: AssetType.SPRITE, fallbackColor: '#dc2626', fallbackShape: 'triangle' },
  { key: 'enemy_boss', path: './boss_core.png', type: AssetType.SPRITE, fallbackColor: '#7f1d1d', fallbackShape: 'star' },
  { key: 'enemy_drone', path: './enemy_drone.png', type: AssetType.SPRITE, fallbackColor: '#a855f7', fallbackShape: 'circle' },
  { key: 'enemy_turret', path: './enemy_turret.png', type: AssetType.SPRITE, fallbackColor: '#16a34a', fallbackShape: 'rect' },
  { key: 'enemy_bullet', path: './e_bullet.png', type: AssetType.SPRITE, fallbackColor: '#ef4444', fallbackShape: 'circle' },
  { key: 'enemy_bullet_s', path: './e_bullet_s.png', type: AssetType.SPRITE, fallbackColor: '#ec4899', fallbackShape: 'circle' },

  // Items
  { key: 'item_power', path: './powerup.png', type: AssetType.UI, fallbackColor: '#ef4444', fallbackShape: 'rect' },
  { key: 'item_bomb', path: './item_bomb.png', type: AssetType.UI, fallbackColor: '#10b981', fallbackShape: 'rect' },
  { key: 'item_medal', path: './medal_gold.png', type: AssetType.UI, fallbackColor: '#fbbf24', fallbackShape: 'star' },

  // Backgrounds
  { key: 'bg_water', path: './bg_water.png', type: AssetType.BACKGROUND, fallbackColor: '#1e3a8a', fallbackShape: 'grid' },
  { key: 'bg_grass', path: './bg_grass.png', type: AssetType.BACKGROUND, fallbackColor: '#14532d', fallbackShape: 'grid' },
  
  // UI / FX
  { key: 'fx_explosion', path: './explosion.png', type: AssetType.FX, fallbackColor: '#f59e0b', fallbackShape: 'circle' },
];