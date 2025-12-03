import { Entity } from '../types';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

export class BaseEntity implements Entity {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  active: boolean;
  type: string;
  imgKey: string;

  constructor(x: number, y: number, w: number, h: number, type: string, imgKey: string) {
    this.id = Math.random();
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.vx = 0;
    this.vy = 0;
    this.active = true;
    this.type = type;
    this.imgKey = imgKey;
  }

  update(dt: number) {
    this.x += this.vx;
    this.y += this.vy;

    // Boundary cull
    if (this.y > GAME_HEIGHT + 100 || this.y < -100 || this.x < -100 || this.x > GAME_WIDTH + 100) {
      this.active = false;
    }
  }

  getBounds() {
    return {
      left: this.x - this.width / 2,
      right: this.x + this.width / 2,
      top: this.y - this.height / 2,
      bottom: this.y + this.height / 2,
    };
  }
}

export class Bullet extends BaseEntity {
  damage: number;
  isPlayer: boolean;

  constructor(x: number, y: number, vx: number, vy: number, isPlayer: boolean, level: number = 1, customImg?: string) {
    const size = isPlayer ? 16 : 14;
    let img = 'enemy_bullet';
    
    if (isPlayer) {
        img = level > 3 ? 'player_missile' : 'player_bullet';
    } else {
        img = customImg || 'enemy_bullet';
    }

    super(x, y, size, size, 'BULLET', img);
    this.vx = vx;
    this.vy = vy;
    this.isPlayer = isPlayer;
    this.damage = isPlayer ? 10 * level : 10;
  }
}

export type EnemyType = 'fighter' | 'tank' | 'bomber' | 'boss' | 'drone' | 'turret';

export class Enemy extends BaseEntity {
  hp: number;
  maxHp: number;
  scoreValue: number;
  shootTimer: number;
  pattern: number; // 0: Straight, 1: Sine, 2: Slow/Tank, 3: Dive, 4: Tracking, 5: Static(Ground), 6: Rapid Dive
  initialX: number;

  constructor(x: number, y: number, type: EnemyType, pattern: number, rank: number) {
    let w = 32, h = 32, hp = 30, score = 100, img = 'enemy_fighter';
    
    switch(type) {
        case 'fighter': w=48; h=48; hp=30; score=100; img='enemy_fighter'; break;
        case 'tank': w=50; h=50; hp=150; score=500; img='enemy_tank'; break;
        case 'bomber': w=80; h=80; hp=600; score=2000; img='enemy_bomber'; break;
        case 'boss': w=120; h=120; hp=5000; score=10000; img='enemy_boss'; break;
        case 'drone': w=24; h=24; hp=15; score=150; img='enemy_drone'; break;
        case 'turret': w=40; h=40; hp=80; score=300; img='enemy_turret'; break;
    }

    // Rank adjusts HP slightly
    hp = Math.floor(hp * (1 + rank * 0.5));

    super(x, y, w, h, 'ENEMY', img);
    this.hp = hp;
    this.maxHp = hp;
    this.scoreValue = score;
    this.shootTimer = Math.random() * 60;
    this.pattern = pattern;
    this.initialX = x;

    // Initial Velocity Setup based on pattern
    // SPEEDS REDUCED BY APPROX 20% compared to previous version
    if (pattern === 0) { // Straight
        this.vy = 2.4 + (rank * 1.5); 
    } else if (pattern === 1) { // Sine
        this.vy = 1.6 + rank;
    } else if (pattern === 2) { // Slow / Tank
        this.vy = 1.2;
    } else if (pattern === 3) { // Dive
        this.vy = 1.6 + (rank); 
        this.vx = (Math.random() - 0.5) * 1.2; 
    } else if (pattern === 4) { // Tracking / Drone
        this.vy = 1.6 + rank;
        this.vx = 0; // Set in update
    } else if (pattern === 5) { // Static / Turret
        this.vy = 1.6; // Matches background scroll speed
        this.vx = 0;
    } else if (pattern === 6) { // Rapid Dive
        this.vy = 0.8; // Start slow
        this.vx = 0;
    }
  }

  update(dt: number, targetX?: number, targetY?: number) {
      if (this.pattern === 1) { // Sine wave update
          this.vx = Math.sin(this.y * 0.02) * 2.4;
      } else if (this.pattern === 3) { // Dive acceleration
          this.vy += 0.12;
      } else if (this.pattern === 4 && targetX !== undefined) { // Tracking
          const dx = targetX - this.x;
          this.vx += dx * 0.004; // Steer towards player
          this.vx = Math.max(-2.4, Math.min(2.4, this.vx)); // Clamp
      } else if (this.pattern === 6) { // Rapid Dive acceleration
          this.vy += 0.3;
      }
      
      super.update(dt);
      this.shootTimer--;
  }
}

export class Item extends BaseEntity {
    itemType: 'P' | 'B' | 'M';

    constructor(x: number, y: number, type: 'P' | 'B' | 'M') {
        const img = type === 'P' ? 'item_power' : type === 'B' ? 'item_bomb' : 'item_medal';
        super(x, y, 32, 32, 'ITEM', img);
        this.itemType = type;
        this.vy = 1.2; // Falls slowly
        this.vx = Math.sin(y * 0.05); // Float effect
    }
}

export class Particle extends BaseEntity {
    life: number;
    constructor(x: number, y: number) {
        super(x, y, 32, 32, 'FX', 'fx_explosion');
        this.life = 30;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
    }
    update(dt: number) {
        super.update(dt);
        this.life--;
        if(this.life <= 0) this.active = false;
    }
}