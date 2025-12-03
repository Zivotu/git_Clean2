

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

// Adjusted speeds: Increased by ~10% from previous request
export const PLAYER_SPEED = 3.3; 
export const BULLET_SPEED = 5.5;
export const ENEMY_BASE_SPEED = 1.1; 
export const LEVEL_DURATION = 120 * 60; // 2 minutes

export const ASSET_PATHS = {
  IMAGES: {
    PLAYER: 'Avio_Player.png',
    ENEMY_1: 'Avio_1.png',
    ENEMY_2: 'Avio_2.png',
    ENEMY_3: 'Avio_3.png',
    METEOR_1: 'Meteo_1.png',
    METEOR_2: 'Meteo_2.png',
    BOSS: 'Boss_1.png',
    POWERUP: 'PowerUp.png',
    HEALTH: 'Health.png',
    BG: 'Background.png'
  },
  SOUNDS: {
    SHOOT: 'sound_1.wav',
    EXPLOSION: 'sound_2.wav', 
    POWERUP: 'sound_3.wav',
    HIT: 'sound_4.wav',
    BOSS_INTRO: 'sound_5.wav',
    GAME_OVER: 'sound_6.wav'
  }
};

export const PIN_CODE = "0000";

// --- MODERN UI ASSETS BUNDLE GENERATOR ---
// These serve as "bundled" graphics generated at runtime to avoid external dependencies
const generateLogoSVG = () => {
  const svg = `
  <svg width="600" height="200" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#ff00cc;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#333399;stop-opacity:1" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <text x="50%" y="40%" font-family="monospace" font-weight="bold" font-size="50" text-anchor="middle" fill="transparent" stroke="url(#grad1)" stroke-width="2" filter="url(#glow)">
      RETRO GALAXY
    </text>
    <text x="50%" y="80%" font-family="monospace" font-weight="bold" font-size="70" text-anchor="middle" fill="url(#grad1)" stroke="white" stroke-width="1" filter="url(#glow)">
      DEFENDER
    </text>
    <path d="M50 90 L550 90" stroke="#00ffff" stroke-width="2" />
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const generateMenuBgSVG = () => {
  const svg = `
  <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="gradBg" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
      </radialGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0f3460" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="800" height="600" fill="url(#gradBg)"/>
    <rect width="800" height="600" fill="url(#grid)" opacity="0.3"/>
    
    <!-- Stars -->
    <circle cx="100" cy="50" r="2" fill="white" opacity="0.8"/>
    <circle cx="200" cy="150" r="1" fill="white" opacity="0.6"/>
    <circle cx="500" cy="80" r="2" fill="#00ffff" opacity="0.8"/>
    <circle cx="700" cy="300" r="1.5" fill="#ff00cc" opacity="0.7"/>
    <circle cx="300" cy="400" r="1" fill="white" opacity="0.5"/>
    
    <!-- Planet -->
    <circle cx="700" cy="500" r="80" fill="none" stroke="#333" stroke-width="2" stroke-dasharray="5,5" opacity="0.5"/>
    <circle cx="700" cy="500" r="60" fill="#0f3460" opacity="0.5"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export const UI_THEME = {
  LOGO_URL: generateLogoSVG(),
  MENU_BG_URL: generateMenuBgSVG()
};

// Fallback SVG Generators
export const generatePlaceholderSvg = (type: 'player' | 'enemy' | 'meteor' | 'boss' | 'powerup' | 'health' | 'bg', color: string): string => {
  const w = 64, h = 64;
  let shape = '';

  if (type === 'player') {
    shape = `<path d="M32 4 L60 56 L32 48 L4 56 Z" fill="${color}" stroke="white" stroke-width="2"/>`;
  } else if (type === 'enemy') {
    shape = `<path d="M32 60 L4 10 L32 20 L60 10 Z" fill="${color}" stroke="white" stroke-width="2"/>`;
  } else if (type === 'meteor') {
    shape = `<circle cx="32" cy="32" r="28" fill="${color}" stroke="#555" stroke-width="3"/>
             <circle cx="20" cy="20" r="5" fill="#000" opacity="0.2"/>
             <circle cx="45" cy="40" r="8" fill="#000" opacity="0.2"/>`;
  } else if (type === 'boss') {
    shape = `<path d="M10 20 L32 60 L54 20 L60 5 L4 5 Z" fill="${color}" stroke="red" stroke-width="3"/>`;
  } else if (type === 'powerup') {
    shape = `<rect x="10" y="10" width="44" height="44" rx="5" fill="${color}" stroke="yellow" stroke-width="3"/>
             <text x="32" y="42" font-family="monospace" font-size="30" text-anchor="middle" fill="white">P</text>`;
  } else if (type === 'health') {
     shape = `<circle cx="32" cy="32" r="28" fill="${color}" stroke="white" stroke-width="3"/>
              <rect x="28" y="16" width="8" height="32" fill="white"/>
              <rect x="16" y="28" width="32" height="8" fill="white"/>`;
  } else if (type === 'bg') {
    // Simple star pattern for BG fallback
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0f172a"/>
        <circle cx="100" cy="100" r="2" fill="white"/>
        <circle cx="500" cy="300" r="2" fill="white"/>
        <circle cx="300" cy="500" r="2" fill="white"/>
        <circle cx="700" cy="150" r="3" fill="rgba(255,255,255,0.5)"/>
      </svg>
    `)}`;
  }

  const svg = `
  <svg width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    ${shape}
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};