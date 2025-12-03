import { Entity, GameState, PlayerStats, Point } from '../types';
import { Bullet, Enemy, Item, Particle } from './entities';
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_SPEED, PLAYER_HITBOX_RADIUS, MAX_WEAPON_LEVEL, MEDAL_VALUES, RANK_INCREASE_KILL, RANK_DECREASE_DEATH, INITIAL_BOMBS } from '../constants';
import { assetManager } from '../services/assetManager';

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: GameState;
  
  // Performance: Offscreen Canvas for Background
  bgCanvas: HTMLCanvasElement;
  bgCtx: CanvasRenderingContext2D;

  // Game Entities
  player: Point & { active: boolean, invulnTimer: number };
  bullets: Bullet[] = [];
  enemies: Enemy[] = [];
  items: Item[] = [];
  particles: Particle[] = [];

  // Stats
  stats: PlayerStats;
  
  // Inputs
  keys: Set<string> = new Set();
  
  // Logic
  frameCount: number = 0;
  stageScroll: number = 0;
  currentMedalIndex: number = 0;
  
  // Callbacks
  onStatsUpdate: (stats: PlayerStats) => void;
  onGameOver: (finalStats: PlayerStats) => void;

  constructor(canvas: HTMLCanvasElement, onStatsUpdate: (s: PlayerStats) => void, onGameOver: (s: PlayerStats) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.state = GameState.MENU;
    this.onStatsUpdate = onStatsUpdate;
    this.onGameOver = onGameOver;

    // Initialize Offscreen Background Canvas
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = GAME_WIDTH;
    this.bgCanvas.height = GAME_HEIGHT + 128; // Buffer for scrolling
    this.bgCtx = this.bgCanvas.getContext('2d')!;

    this.player = { x: GAME_WIDTH / 2, y: GAME_HEIGHT - 100, active: true, invulnTimer: 0 };
    this.stats = {
      score: 0,
      highScore: 50000,
      lives: 3,
      bombs: 3,
      medalValue: MEDAL_VALUES[0],
      rank: 0.0,
      weaponLevel: 1
    };
  }

  startGame() {
    this.preRenderBackground(); // Cache the background
    this.resetGame();
    this.state = GameState.PLAYING;
  }

  // Draw tiles once to an offscreen canvas instead of every frame
  preRenderBackground() {
    const bgImg = assetManager.getImage('bg_water');
    if (!bgImg) return;
    
    // Fill the offscreen canvas with the pattern
    const ptrn = this.bgCtx.createPattern(bgImg, 'repeat');
    if (ptrn) {
        this.bgCtx.fillStyle = ptrn;
        this.bgCtx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
    }
  }

  resetGame() {
    this.player = { x: GAME_WIDTH / 2, y: GAME_HEIGHT - 100, active: true, invulnTimer: 120 };
    this.stats.score = 0;
    this.stats.lives = 3;
    this.stats.bombs = 3;
    this.stats.rank = 0.0;
    this.stats.weaponLevel = 1;
    this.stats.medalValue = MEDAL_VALUES[0];
    this.bullets = [];
    this.enemies = [];
    this.items = [];
    this.particles = [];
    this.stageScroll = 0;
    this.currentMedalIndex = 0;
    this.frameCount = 0;
    // CRITICAL: Send a COPY of stats to force React update
    this.onStatsUpdate({...this.stats});
  }

  handleInput(keys: Set<string>) {
    this.keys = keys;
  }

  setJoystick(dx: number, dy: number) {
      if (!this.player.active) return;
      this.player.x += dx * PLAYER_SPEED;
      this.player.y += dy * PLAYER_SPEED;
      this.clampPlayer();
  }

  triggerBomb() {
      if (this.state !== GameState.PLAYING || this.stats.bombs <= 0 || !this.player.active) return;
      
      this.stats.bombs--;
      this.player.invulnTimer = 180; // 3 seconds invuln
      
      // Clear bullets
      this.bullets = this.bullets.filter(b => b.isPlayer);
      
      // Damage all enemies
      this.enemies.forEach(e => {
          e.hp -= 500;
          this.spawnExplosion(e.x, e.y);
      });
      
      this.onStatsUpdate({...this.stats});
  }

  update(dt: number) {
    if (this.state !== GameState.PLAYING) return;
    this.frameCount++;
    this.stageScroll += 1.6; // Vertical scroll speed (Reduced from 2)

    // --- Player Movement ---
    if (this.player.active) {
        let dx = 0;
        let dy = 0;
        if (this.keys.has('ArrowLeft') || this.keys.has('a')) dx = -1;
        if (this.keys.has('ArrowRight') || this.keys.has('d')) dx = 1;
        if (this.keys.has('ArrowUp') || this.keys.has('w')) dy = -1;
        if (this.keys.has('ArrowDown') || this.keys.has('s')) dy = 1;

        // Diagonal normalization
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }

        this.player.x += dx * PLAYER_SPEED;
        this.player.y += dy * PLAYER_SPEED;
        this.clampPlayer();

        if (this.player.invulnTimer > 0) this.player.invulnTimer--;

        // Auto Fire
        if (this.frameCount % 6 === 0) { // Slightly slower fire rate (was 5)
            this.firePlayerBullet();
        }
    }

    // --- Wave Spawning Logic ---
    this.spawnEnemyWaves();

    // --- Update Entities ---
    this.bullets.forEach(b => b.update(dt));
    this.enemies.forEach(e => {
        // Pass player coordinates for tracking enemies
        e.update(dt, this.player.active ? this.player.x : undefined, this.player.active ? this.player.y : undefined);
        
        // Enemy Shooting Logic
        if (e.active && e.shootTimer <= 0) {
            this.fireEnemyBullet(e);
        }
    });
    this.items.forEach(i => i.update(dt));
    this.particles.forEach(p => p.update(dt));

    // Cleanup inactive
    this.bullets = this.bullets.filter(e => e.active);
    this.enemies = this.enemies.filter(e => e.active);
    this.items = this.items.filter(e => e.active);
    this.particles = this.particles.filter(e => e.active);

    // --- Collision Detection ---
    this.checkCollisions();
  }

  spawnEnemyWaves() {
      // Increased modulo values by ~30% to reduce spawn frequency

      // 1. Popcorn Enemies (Weak fighters)
      if (this.frameCount % 120 === 0) { // Was 90
          const x = Math.random() * (GAME_WIDTH - 60) + 30;
          const pattern = Math.random() > 0.5 ? 1 : 3; 
          this.enemies.push(new Enemy(x, -50, 'fighter', pattern, this.stats.rank));
      }

      // 2. Heavy Tanks (Ground units)
      if (this.frameCount % 550 === 0) { // Was 400
           const x = Math.random() * (GAME_WIDTH - 100) + 50;
           this.enemies.push(new Enemy(x, -60, 'tank', 2, this.stats.rank));
      }

      // 3. Formations 
      if (this.frameCount % 480 === 0) { // Was 360
          const formationType = Math.floor(Math.random() * 4); 
          
          if (formationType === 0) {
              // V-Formation
              const centerX = GAME_WIDTH / 2;
              const startY = -50;
              for(let i=0; i<5; i++) {
                  const offset = (i - 2) * 40;
                  this.enemies.push(new Enemy(centerX + offset, startY - Math.abs(i-2)*30, 'fighter', 0, this.stats.rank));
              }
          } else if (formationType === 1) {
              // Line Formation of Bombers
              const startY = -50;
              for(let i=0; i<4; i++) {
                 const x = 80 + i * 120;
                 this.enemies.push(new Enemy(x, startY, 'bomber', 0, this.stats.rank));
              }
          } else if (formationType === 2) {
              // Dual Stream
              const startY = -50;
              this.enemies.push(new Enemy(100, startY, 'fighter', 0, this.stats.rank));
              this.enemies.push(new Enemy(GAME_WIDTH - 100, startY, 'fighter', 0, this.stats.rank));
              this.enemies.push(new Enemy(100, startY - 60, 'fighter', 0, this.stats.rank));
              this.enemies.push(new Enemy(GAME_WIDTH - 100, startY - 60, 'fighter', 0, this.stats.rank));
          } else {
              // Dive Bomb Swarm
              const startX = Math.random() * (GAME_WIDTH - 100) + 50;
              for(let i=0; i<4; i++) {
                  this.enemies.push(new Enemy(startX + (i*20 - 40), -50 - (i*20), 'fighter', 3, this.stats.rank));
              }
          }
      }

      // 4. Drone Swarms (Tracking enemies)
      if (this.frameCount % 650 === 0) { // Was 500
          const startY = -50;
          for(let i=0; i<3; i++) {
             // Pattern 4 is Tracking
             this.enemies.push(new Enemy(Math.random() * (GAME_WIDTH - 50) + 25, startY - (i*40), 'drone', 4, this.stats.rank));
          }
      }
      
      // 5. Turrets (Ground static)
      if (this.frameCount % 550 === 0) { // Was 400
           // Pattern 5 is Static/Ground
           const x = Math.random() * (GAME_WIDTH - 60) + 30;
           this.enemies.push(new Enemy(x, -50, 'turret', 5, this.stats.rank));
      }

      // 6. Rapid Dive Bombers (New Pattern 6)
      if (this.frameCount % 900 === 0) { // Was 700
           const startX = Math.random() * (GAME_WIDTH - 100) + 50;
           for(let i=0; i<3; i++) {
             this.enemies.push(new Enemy(startX + (i*30 - 30), -50 - (i*30), 'fighter', 6, this.stats.rank));
           }
      }

      // 7. Boss (Every ~35 seconds)
      if (this.frameCount % 2200 === 0 && this.enemies.filter(e => e.type === 'boss').length === 0) { // Was 1800
         this.enemies.push(new Enemy(GAME_WIDTH/2, -150, 'boss', 1, this.stats.rank));
      }
  }

  clampPlayer() {
      this.player.x = Math.max(20, Math.min(GAME_WIDTH - 20, this.player.x));
      this.player.y = Math.max(20, Math.min(GAME_HEIGHT - 20, this.player.y));
  }

  firePlayerBullet() {
      // Main Shot
      this.bullets.push(new Bullet(this.player.x, this.player.y - 20, 0, -18, true, this.stats.weaponLevel));
      
      // Spread based on level
      if (this.stats.weaponLevel >= 2) {
          this.bullets.push(new Bullet(this.player.x - 10, this.player.y, -1.5, -16, true, this.stats.weaponLevel));
          this.bullets.push(new Bullet(this.player.x + 10, this.player.y, 1.5, -16, true, this.stats.weaponLevel));
      }
      if (this.stats.weaponLevel >= 4) {
          this.bullets.push(new Bullet(this.player.x - 20, this.player.y + 10, -4, -14, true, this.stats.weaponLevel));
          this.bullets.push(new Bullet(this.player.x + 20, this.player.y + 10, 4, -14, true, this.stats.weaponLevel));
      }
  }

  fireEnemyBullet(e: Enemy) {
      const angle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      const rankMult = this.stats.rank; // 0.0 to 1.0
      
      let baseCooldown = 150; 
      // Reduced bullet speeds by ~20%
      
      switch (e.type) {
          case 'turret': {
              // Fast aimed shot, pink bullet
              const speed = 4 + (rankMult * 1.5); 
              this.bullets.push(new Bullet(e.x, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, false, 1, 'enemy_bullet_s'));
              baseCooldown = 120; 
              break;
          }
          case 'bomber': {
              // Spread shot (3-way)
              const speed = 3.2 + (rankMult * 1.5);
              const spread = 0.20; // radians
              this.bullets.push(new Bullet(e.x, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, false, 1, 'enemy_bullet'));
              this.bullets.push(new Bullet(e.x, e.y, Math.cos(angle - spread) * speed, Math.sin(angle - spread) * speed, false, 1, 'enemy_bullet'));
              this.bullets.push(new Bullet(e.x, e.y, Math.cos(angle + spread) * speed, Math.sin(angle + spread) * speed, false, 1, 'enemy_bullet'));
              baseCooldown = 180;
              break;
          }
          case 'tank': {
               // Heavy slow aimed shot
               const speed = 2.8 + (rankMult * 1.5);
               this.bullets.push(new Bullet(e.x, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, false, 1, 'enemy_bullet'));
               baseCooldown = 220;
               break;
          }
          case 'boss': {
               // Radial Burst (8-way)
               const speed = 4 + (rankMult * 1.5);
               for (let i = 0; i < 8; i++) {
                   const burstAngle = angle + (i * (Math.PI / 4));
                   this.bullets.push(new Bullet(e.x, e.y, Math.cos(burstAngle) * speed, Math.sin(burstAngle) * speed, false, 1, 'enemy_bullet_s'));
               }
               baseCooldown = 70;
               break;
          }
          default: {
              // Fighter/Drone: Standard aimed shot
              const speed = 4 + (rankMult * 2);
              this.bullets.push(new Bullet(e.x, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, false, 1, 'enemy_bullet_s'));
              baseCooldown = 150; 
              break;
          }
      }
      
      e.shootTimer = baseCooldown + Math.random() * 40 - (rankMult * 10);
  }

  spawnExplosion(x: number, y: number) {
      this.particles.push(new Particle(x, y));
  }

  checkCollisions() {
      let statsChanged = false;

      // Player Bullets vs Enemies
      for (const b of this.bullets) {
          if (!b.isPlayer) continue;
          for (const e of this.enemies) {
              if (this.isColliding(b, e)) {
                  b.active = false;
                  e.hp -= b.damage;
                  this.spawnExplosion(b.x, b.y);
                  
                  if (e.hp <= 0 && e.active) {
                      e.active = false;
                      this.handleEnemyDeath(e);
                      statsChanged = true;
                  }
                  break;
              }
          }
      }

      // Enemy Bullets/Body vs Player
      if (this.player.active && this.player.invulnTimer <= 0) {
          // Check bullets
          for (const b of this.bullets) {
              if (b.isPlayer) continue;
              if (this.dist(b.x, b.y, this.player.x, this.player.y) < PLAYER_HITBOX_RADIUS + b.width/2) {
                  this.killPlayer();
                  statsChanged = true;
              }
          }
          // Check collisions
          for (const e of this.enemies) {
              if (this.dist(e.x, e.y, this.player.x, this.player.y) < PLAYER_HITBOX_RADIUS + e.width/2) {
                  this.killPlayer();
                  statsChanged = true;
              }
          }
      }

      // Player vs Items
      if (this.player.active) {
          for (const i of this.items) {
              if (this.dist(i.x, i.y, this.player.x, this.player.y) < 30) {
                  i.active = false;
                  this.collectItem(i);
                  statsChanged = true;
              }
          }
      }

      // Force React update by sending a NEW object clone
      if (statsChanged || this.frameCount % 10 === 0) {
         this.onStatsUpdate({...this.stats});
      }
  }

  handleEnemyDeath(e: Enemy) {
      this.stats.score += e.scoreValue;
      this.stats.rank = Math.min(1.0, this.stats.rank + RANK_INCREASE_KILL);
      
      // Drop Logic
      const rand = Math.random();
      if (rand < 0.1) this.items.push(new Item(e.x, e.y, 'P'));
      else if (rand < 0.15) this.items.push(new Item(e.x, e.y, 'B'));
      else if (rand < 0.3) this.items.push(new Item(e.x, e.y, 'M')); // Medal
  }

  collectItem(i: Item) {
      if (i.itemType === 'P') {
          this.stats.weaponLevel = Math.min(MAX_WEAPON_LEVEL, this.stats.weaponLevel + 1);
          this.stats.score += 1000;
      } else if (i.itemType === 'B') {
          this.stats.bombs = Math.min(9, this.stats.bombs + 1);
          this.stats.score += 1000;
      } else if (i.itemType === 'M') {
          this.stats.score += this.stats.medalValue;
          // Chain logic
          this.currentMedalIndex = Math.min(MEDAL_VALUES.length - 1, this.currentMedalIndex + 1);
          this.stats.medalValue = MEDAL_VALUES[this.currentMedalIndex];
      }
  }

  killPlayer() {
      this.spawnExplosion(this.player.x, this.player.y);
      this.stats.lives--;
      this.stats.rank = Math.max(0.0, this.stats.rank - RANK_DECREASE_DEATH);
      this.stats.weaponLevel = Math.max(1, this.stats.weaponLevel - 1);
      
      // Reset Medal Chain on death
      this.currentMedalIndex = 0;
      this.stats.medalValue = MEDAL_VALUES[0];

      if (this.stats.lives < 0) {
          this.player.active = false;
          this.state = GameState.GAME_OVER;
          // IMPORTANT: Pass current stats clone to callback so React sees final score
          this.onGameOver({...this.stats});
      } else {
          // Respawn
          this.player.active = true;
          this.player.x = GAME_WIDTH / 2;
          this.player.y = GAME_HEIGHT - 50;
          this.player.invulnTimer = 240; // 4s invuln
          this.stats.bombs = INITIAL_BOMBS; // Reset bombs on death usually
      }
  }

  draw() {
    // Clear
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Optimized Background Drawing (Cached Offscreen)
    const offset = Math.floor(this.stageScroll % 128); // 128 is pattern height
    // Draw 1: Top part
    this.ctx.drawImage(this.bgCanvas, 0, offset - 128);
    // Draw 2: Bottom part (fill remainder)
    this.ctx.drawImage(this.bgCanvas, 0, offset);


    // Draw Shadows (Cheap depth effect)
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.enemies.forEach(e => {
        this.ctx.fillRect(e.x - e.width/2 + 10, e.y - e.height/2 + 10, e.width, e.height);
    });
    if (this.player.active) {
        this.ctx.beginPath();
        this.ctx.ellipse(this.player.x + 10, this.player.y + 10, 10, 10, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }

    // Draw Entities
    this.items.forEach(i => this.drawEntity(i));
    this.enemies.forEach(e => this.drawEntity(e));
    if (this.player.active) {
        // Flicker if invuln
        if (this.player.invulnTimer === 0 || Math.floor(this.frameCount / 4) % 2 === 0) {
            const img = assetManager.getImage('player_ship');
            this.ctx.drawImage(img, this.player.x - 32, this.player.y - 32, 64, 64);
            
            // Draw Hitbox for debug/precision
            this.ctx.fillStyle = '#f00';
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, PLAYER_HITBOX_RADIUS, 0, Math.PI*2);
            this.ctx.fill();
        }
    }
    this.bullets.forEach(b => this.drawEntity(b));
    this.particles.forEach(p => this.drawEntity(p));
  }

  drawEntity(e: Entity & { imgKey?: string }) {
      if (!e.active) return;
      const img = assetManager.getImage(e.imgKey || 'player_ship');
      this.ctx.drawImage(img, e.x - e.width/2, e.y - e.height/2, e.width, e.height);
  }

  isColliding(a: Entity, b: Entity): boolean {
      return this.dist(a.x, a.y, b.x, b.y) < (a.width + b.width) / 2.5; // Rough circle
  }

  dist(x1: number, y1: number, x2: number, y2: number) {
      return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }
}