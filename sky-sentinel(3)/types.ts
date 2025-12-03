export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  STAGE_CLEAR = 'STAGE_CLEAR',
  ADMIN = 'ADMIN'
}

export enum AssetType {
  SPRITE = 'SPRITE',
  BACKGROUND = 'BACKGROUND',
  UI = 'UI',
  FX = 'FX'
}

export interface AssetDefinition {
  key: string;
  path: string;
  type: AssetType;
  fallbackColor: string;
  fallbackShape: 'triangle' | 'circle' | 'rect' | 'star' | 'grid';
}

export interface AssetStatus {
  key: string;
  isLoaded: boolean;
  isFallback: boolean;
  src: string; // DataURL or Path
  def: AssetDefinition;
}

export interface Point {
  x: number;
  y: number;
}

export interface Entity {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  active: boolean;
  type: string;
}

export interface PlayerStats {
  score: number;
  highScore: number;
  lives: number;
  bombs: number;
  medalValue: number;
  rank: number; // 0.0 to 1.0
  weaponLevel: number;
}

export interface HighScore {
  name: string;
  score: number;
  date: number; // Timestamp
}