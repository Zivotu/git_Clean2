import React, { useEffect, useRef, useCallback } from 'react';
import { GameState, Player, Enemy, Bullet, Particle, Entity } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SPEED, BULLET_SPEED, ENEMY_BASE_SPEED, LEVEL_DURATION } from '../constants';
import { assetManager } from '../services/AssetManager';

interface GameCanvasProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  setScore: (score: number) => void;
  setHealth: (hp: number) => void;
  setLevel: (lvl: number) => void;
  score: number;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, setGameState, setScore, setHealth, setLevel, score }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  
  // Game State Refs (Mutable for performance)
  const playerRef = useRef<Player>({
    id: 0, x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 100, vx: 0, vy: 0,
    width: 48, height: 48, type: 'player', markedForDeletion: false,
    health: 100, maxHealth: 100, weaponLevel: 1, invulnerableFrames: 0,
    weaponTimer: 0
  });
  
  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const powerupsRef = useRef<Entity[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const levelTimerRef = useRef<number>(0);
  const levelRef = useRef<number>(1);
  const bgOffsetRef = useRef<number>(0);
  const bossSpawnedRef = useRef<boolean>(false);
  const bossRef = useRef<Enemy | null>(null);

  // Helper: Check Collision
  const checkCollision = (rect1: Entity, rect2: Entity) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  };

  const spawnBullet = (shooter: Entity, isPlayer: boolean, angleOffset: number = 0) => {
    const angle = isPlayer ? -Math.PI / 2 + angleOffset : Math.PI / 2 + angleOffset;
    const speed = isPlayer ? BULLET_SPEED : BULLET_SPEED * 0.6;
    
    const b: Bullet = {
      id: Math.random(),
      x: shooter.x + shooter.width / 2 - 4,
      y: isPlayer ? shooter.y : shooter.y + shooter.height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      width: 8, height: 16,
      type: 'bullet',
      owner: isPlayer ? 'player' : 'enemy',
      damage: 10,
      color: isPlayer ? '#3b82f6' : '#ef4444',
      markedForDeletion: false
    };
    bulletsRef.current.push(b);
    if (isPlayer) assetManager.playSound('SHOOT');
  };

  const spawnExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 10; i++) {
      particlesRef.current.push({
        id: Math.random(),
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        size: Math.random() * 4 + 2,
        color: color,
        width: 0, height: 0, type: 'bullet', markedForDeletion: false // Dummy types
      });
    }
  };

  const resetGame = () => {
    playerRef.current = {
      id: 0, x: CANVAS_WIDTH / 2 - 24, y: CANVAS_HEIGHT - 100, vx: 0, vy: 0,
      width: 48, height: 48, type: 'player', markedForDeletion: false,
      health: 100, maxHealth: 100, weaponLevel: 1, invulnerableFrames: 0,
      weaponTimer: 0
    };
    enemiesRef.current = [];
    bulletsRef.current = [];
    particlesRef.current = [];
    powerupsRef.current = [];
    levelTimerRef.current = 0;
    levelRef.current = 1;
    bossSpawnedRef.current = false;
    bossRef.current = null;
    setScore(0);
    setHealth(100);
    setLevel(1);
  };

  useEffect(() => {
    if (gameState === GameState.PLAYING && playerRef.current.health <= 0) {
       resetGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'Enter') {
        if (gameState === GameState.PLAYING) setGameState(GameState.PAUSED);
        else if (gameState === GameState.PAUSED) setGameState(GameState.PLAYING);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, setGameState]);

  // Main Loop Logic
  const update = useCallback(() => {
    const player = playerRef.current;

    // 1. Player Movement
    if (keysRef.current['ArrowLeft']) player.x -= PLAYER_SPEED;
    if (keysRef.current['ArrowRight']) player.x += PLAYER_SPEED;
    if (keysRef.current['ArrowUp']) player.y -= PLAYER_SPEED;
    if (keysRef.current['ArrowDown']) player.y += PLAYER_SPEED;

    // Clamp player
    player.x = Math.max(0, Math.min(CANVAS_WIDTH - player.width, player.x));
    player.y = Math.max(0, Math.min(CANVAS_HEIGHT - player.height, player.y));

    // Invulnerability
    if (player.invulnerableFrames > 0) player.invulnerableFrames--;

    // Weapon Timer Logic (10 seconds duration)
    if (player.weaponTimer > 0) {
        player.weaponTimer--;
        if (player.weaponTimer === 0) {
            // Downgrade if time runs out
            player.weaponLevel = 1;
        }
    }

    // Shooting (Auto fire on space hold)
    if (keysRef.current['Space'] && frameRef.current % 20 === 0) { 
      spawnBullet(player, true, 0);
      if (player.weaponLevel >= 2) spawnBullet(player, true, 0.1); 
      if (player.weaponLevel >= 2) spawnBullet(player, true, -0.1);
      if (player.weaponLevel >= 3) spawnBullet(player, true, 0.2);
      if (player.weaponLevel >= 3) spawnBullet(player, true, -0.2);
      if (player.weaponLevel >= 4) spawnBullet(player, true, 0.4);
      if (player.weaponLevel >= 4) spawnBullet(player, true, -0.4);
      if (player.weaponLevel >= 5) {
         spawnBullet(player, true, 0.6);
         spawnBullet(player, true, -0.6);
      }
    }

    // 2. Level Progress & Spawning
    if (!bossSpawnedRef.current) {
      levelTimerRef.current++;
      
      // Spawn Rate - Reduced base from 120 to 100 to increase density by ~20%
      const spawnRate = Math.max(30, 100 - (levelRef.current * 5));

      if (frameRef.current % spawnRate === 0) { 
        const isMeteor = Math.random() > 0.6;
        const x = Math.random() * (CANVAS_WIDTH - 50);
        
        let enemySpeed = ENEMY_BASE_SPEED;
        let enemyType = 1;
        
        if (isMeteor) {
            // Meteors have varied speed
            enemySpeed = ENEMY_BASE_SPEED * (0.8 + Math.random() * 0.4);
        } else {
            // Planes
            enemyType = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
            if (enemyType === 1) enemySpeed = ENEMY_BASE_SPEED * 1.2; // Small - Faster
            if (enemyType === 2) enemySpeed = ENEMY_BASE_SPEED * 1.0; // Medium 
            if (enemyType === 3) enemySpeed = ENEMY_BASE_SPEED * 0.8; // Big - Slower
        }

        enemiesRef.current.push({
          id: Math.random(),
          x, y: -60,
          vx: 0, vy: enemySpeed, 
          width: 48, height: 48,
          type: isMeteor ? 'enemy_meteor' : 'enemy_plane',
          enemyType: enemyType,
          hp: isMeteor ? 20 : 10 + (enemyType * 5),
          maxHp: isMeteor ? 20 : 10 + (enemyType * 5),
          markedForDeletion: false,
          scoreValue: isMeteor ? 50 : 100 * enemyType,
          shootTimer: Math.random() * 100
        });
      }

      // Check Level Complete / Boss Spawn
      if (levelTimerRef.current > LEVEL_DURATION) {
        bossSpawnedRef.current = true;
        assetManager.playSound('BOSS_INTRO');
        bossRef.current = {
          id: 999,
          x: CANVAS_WIDTH / 2 - 64, y: -150,
          vx: 0.5, vy: 0.5,
          width: 128, height: 128,
          type: 'boss',
          enemyType: 1,
          hp: 1000 * levelRef.current,
          maxHp: 1000 * levelRef.current,
          markedForDeletion: false,
          scoreValue: 5000,
          shootTimer: 0
        };
        enemiesRef.current.push(bossRef.current);
      }
    } else if (bossRef.current) {
      // Boss Logic
      const boss = bossRef.current;
      if (boss.y < 50) boss.y += boss.vy; // Enter screen
      else {
        boss.x += boss.vx;
        if (boss.x <= 0 || boss.x + boss.width >= CANVAS_WIDTH) boss.vx *= -1;
        
        boss.shootTimer++;
        // Boss Attack Patterns
        if (boss.shootTimer % 150 === 0) { 
           for(let i=-3; i<=3; i++) spawnBullet(boss, false, i * 0.2);
        }
        if (boss.shootTimer % 300 === 0) {
           spawnBullet(boss, false, 0);
        }
      }
    }

    // 3. Update Enemies
    enemiesRef.current.forEach(enemy => {
      if (enemy.type !== 'boss') enemy.y += enemy.vy;
      
      // Enemy Shooting
      if (enemy.type === 'enemy_plane') {
        enemy.shootTimer++;
        if (enemy.shootTimer > 200) { 
          spawnBullet(enemy, false);
          enemy.shootTimer = 0;
        }
      }
      
      if (enemy.y > CANVAS_HEIGHT) enemy.markedForDeletion = true;
    });

    // 4. Update Bullets
    bulletsRef.current.forEach(b => {
      b.x += b.vx;
      b.y += b.vy;
      if (b.y < -20 || b.y > CANVAS_HEIGHT + 20 || b.x < -20 || b.x > CANVAS_WIDTH + 20) {
        b.markedForDeletion = true;
      }
    });

    // 5. Collision Detection
    
    // Bullets vs Entities
    bulletsRef.current.forEach(b => {
      if (b.markedForDeletion) return;

      if (b.owner === 'player') {
        // Check vs Enemies
        enemiesRef.current.forEach(e => {
          if (!e.markedForDeletion && checkCollision(b, e)) {
            e.hp -= b.damage;
            b.markedForDeletion = true;
            if (e.hp <= 0) {
              e.markedForDeletion = true;
              spawnExplosion(e.x + e.width/2, e.y + e.height/2, '#ef4444');
              assetManager.playSound('EXPLOSION');
              setScore(score + e.scoreValue); 
              
              // Drop Powerups
              if (Math.random() < 0.2) {
                powerupsRef.current.push({
                  id: Math.random(),
                  x: e.x, y: e.y, vx: 0, vy: 1, // Slow falling powerup
                  width: 32, height: 32,
                  type: Math.random() > 0.7 ? 'health' : 'powerup',
                  markedForDeletion: false
                });
              }

              if (e.type === 'boss') {
                // Level Up
                levelRef.current++;
                setLevel(levelRef.current);
                levelTimerRef.current = 0;
                bossSpawnedRef.current = false;
                bossRef.current = null;
              }
            }
          }
        });
      } else {
        // Enemy bullet vs Player
        if (checkCollision(b, player)) {
          if (player.invulnerableFrames === 0) {
            player.health -= 10;
            setHealth(player.health);
            b.markedForDeletion = true;
            player.invulnerableFrames = 60;
            assetManager.playSound('HIT');
            if (player.health <= 0) {
              assetManager.playSound('GAME_OVER');
              setGameState(GameState.GAME_OVER);
            }
          }
        }
      }
    });

    // Player vs Powerups
    powerupsRef.current.forEach(p => {
      p.y += p.vy;
      if (checkCollision(p, player)) {
        p.markedForDeletion = true;
        if (p.type === 'powerup') {
          player.weaponLevel = Math.min(5, player.weaponLevel + 1);
          player.weaponTimer = 600; // 10 seconds at 60FPS
          assetManager.playSound('POWERUP');
        } else {
          player.health = player.maxHealth;
          setHealth(player.health);
          assetManager.playSound('HEALTH');
        }
      }
      if (p.y > CANVAS_HEIGHT) p.markedForDeletion = true;
    });

    // Player vs Enemy (Crash)
    enemiesRef.current.forEach(e => {
      if (!e.markedForDeletion && checkCollision(e, player)) {
        if (player.invulnerableFrames === 0) {
           player.health -= 20;
           setHealth(player.health);
           e.markedForDeletion = true; // Enemy dies on crash
           spawnExplosion(e.x, e.y, 'orange');
           assetManager.playSound('EXPLOSION');
           player.invulnerableFrames = 60;
           if (player.health <= 0) {
             assetManager.playSound('GAME_OVER');
             setGameState(GameState.GAME_OVER);
           }
        }
      }
    });

    // 6. Update Particles
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) p.markedForDeletion = true;
    });

    // Cleanup
    enemiesRef.current = enemiesRef.current.filter(e => !e.markedForDeletion);
    bulletsRef.current = bulletsRef.current.filter(b => !b.markedForDeletion);
    particlesRef.current = particlesRef.current.filter(p => !p.markedForDeletion);
    powerupsRef.current = powerupsRef.current.filter(p => !p.markedForDeletion);

  }, [gameState, setGameState, score, setScore, setHealth, setLevel]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Background
    bgOffsetRef.current = (bgOffsetRef.current + 0.5) % CANVAS_HEIGHT;
    
    const bgImg = assetManager.getImage('BG');
    if (bgImg) {
        ctx.drawImage(bgImg, 0, bgOffsetRef.current, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(bgImg, 0, bgOffsetRef.current - CANVAS_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0,0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Draw Powerups
    powerupsRef.current.forEach(p => {
      const imgKey = p.type === 'health' ? 'HEALTH' : 'POWERUP';
      const img = assetManager.getImage(imgKey);
      ctx.drawImage(img, p.x, p.y, p.width, p.height);
    });

    // Draw Player
    const p = playerRef.current;
    if (p.invulnerableFrames % 10 < 5) { // Flicker
      const pImg = assetManager.getImage('PLAYER');
      ctx.drawImage(pImg, p.x, p.y, p.width, p.height);
    }

    // Draw Enemies
    enemiesRef.current.forEach(e => {
      let imgKey = 'ENEMY_1';
      if (e.type === 'boss') imgKey = 'BOSS';
      else if (e.type === 'enemy_meteor') imgKey = e.enemyType === 1 ? 'METEOR_1' : 'METEOR_2';
      else imgKey = `ENEMY_${e.enemyType}`;
      
      const img = assetManager.getImage(imgKey);
      ctx.save();
      if (e.type === 'enemy_meteor') {
        ctx.translate(e.x + e.width/2, e.y + e.height/2);
        ctx.rotate(frameRef.current * 0.02); 
        ctx.drawImage(img, -e.width/2, -e.height/2, e.width, e.height);
      } else {
        ctx.drawImage(img, e.x, e.y, e.width, e.height);
      }
      ctx.restore();

      // Boss HP Bar
      if (e.type === 'boss') {
        ctx.fillStyle = 'red';
        ctx.fillRect(e.x, e.y - 10, e.width, 5);
        ctx.fillStyle = 'green';
        ctx.fillRect(e.x, e.y - 10, e.width * (e.hp / e.maxHp), 5);
      }
    });

    // Draw Bullets
    bulletsRef.current.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI*2);
      ctx.fill();
    });

    // Draw Particles
    particlesRef.current.forEach(pt => {
      ctx.globalAlpha = pt.life / pt.maxLife;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

  }, []);

  // The Tick Function
  const tick = useCallback(() => {
    if (gameState !== GameState.PLAYING) return;

    frameRef.current++;
    update();
    draw();
    
    requestRef.current = requestAnimationFrame(tick);
  }, [gameState, update, draw]);

  // Game Loop Management
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      requestRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState, tick]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      className="cursor-none"
    />
  );
};