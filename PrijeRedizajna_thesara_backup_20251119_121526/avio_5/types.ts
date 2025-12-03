export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  ADMIN = 'ADMIN'
}

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

export interface Entity extends Position, Velocity {
  id: number;
  width: number;
  height: number;
  type: 'player' | 'enemy_plane' | 'enemy_meteor' | 'bullet' | 'powerup' | 'health' | 'boss';
  markedForDeletion: boolean;
}

export interface Player extends Entity {
  health: number;
  maxHealth: number;
  weaponLevel: number; // 1 to 5
  invulnerableFrames: number;
  weaponTimer: number; // Frames remaining for weapon upgrade
}

export interface Enemy extends Entity {
  hp: number;
  maxHp: number;
  enemyType: number; // 1, 2, 3 etc matching Avio_X or Meteo_X
  scoreValue: number;
  shootTimer: number;
}

export interface Bullet extends Entity {
  owner: 'player' | 'enemy';
  damage: number;
  color: string;
}

export interface Particle extends Entity {
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface AssetMap {
  [key: string]: HTMLImageElement | HTMLAudioElement;
}

export interface ScoreEntry {
  name: string;
  score: number;
  date: string;
}