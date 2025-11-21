
import { ASSET_PATHS, generatePlaceholderSvg } from '../constants';

class AssetManager {
  images: { [key: string]: HTMLImageElement } = {};
  sounds: { [key: string]: HTMLAudioElement } = {};
  loadedCount = 0;
  totalAssets = 0;
  audioContext: AudioContext | null = null;

  constructor() {
    this.totalAssets = Object.keys(ASSET_PATHS.IMAGES).length + Object.keys(ASSET_PATHS.SOUNDS).length;
  }

  initAudio() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  async loadAll(): Promise<void> {
    const loadPromises: Promise<void>[] = [];

    // Load Images
    Object.entries(ASSET_PATHS.IMAGES).forEach(([key, src]) => {
      loadPromises.push(this.loadImage(key, src));
    });

    // Load Sounds
    Object.entries(ASSET_PATHS.SOUNDS).forEach(([key, src]) => {
      loadPromises.push(this.loadSound(key, src));
    });

    await Promise.all(loadPromises);
  }

  loadImage(key: string, src: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = src;
      
      img.onload = () => {
        this.images[key] = img;
        this.loadedCount++;
        resolve();
      };

      img.onerror = () => {
        // Fallback generation based on key
        let fallbackSrc = '';
        if (key.includes('PLAYER')) fallbackSrc = generatePlaceholderSvg('player', '#3b82f6');
        else if (key.includes('ENEMY')) fallbackSrc = generatePlaceholderSvg('enemy', '#ef4444');
        else if (key.includes('METEOR')) fallbackSrc = generatePlaceholderSvg('meteor', '#78350f');
        else if (key.includes('BOSS')) fallbackSrc = generatePlaceholderSvg('boss', '#7f1d1d');
        else if (key.includes('POWERUP')) fallbackSrc = generatePlaceholderSvg('powerup', '#eab308');
        else if (key.includes('HEALTH')) fallbackSrc = generatePlaceholderSvg('health', '#22c55e');
        else if (key.includes('BG')) fallbackSrc = generatePlaceholderSvg('bg', '#000');
        else fallbackSrc = generatePlaceholderSvg('meteor', '#4b5563'); // generic

        const fallbackImg = new Image();
        fallbackImg.src = fallbackSrc;
        this.images[key] = fallbackImg;
        this.loadedCount++;
        console.warn(`Failed to load ${src}, used fallback for ${key}`);
        resolve();
      };
    });
  }

  loadSound(key: string, src: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.src = src;
      audio.oncanplaythrough = () => {
        this.sounds[key] = audio;
        this.loadedCount++;
        resolve();
      };
      audio.onerror = () => {
        console.warn(`Failed to load ${src}, fallback synth will be used for ${key}`);
        this.sounds[key] = new Audio(); // Empty audio element, logic will check and use synth
        this.loadedCount++;
        resolve();
      };
      // Timeout to avoid hanging if audio never loads
      setTimeout(resolve, 2000); 
    });
  }

  getImage(key: string): HTMLImageElement {
    return this.images[key] || this.images['METEOR_1']; // Safe fallback
  }

  playSound(key: string) {
    this.initAudio();
    const sound = this.sounds[key];
    
    // If sound loaded properly (duration > 0), play it
    if (sound && sound.duration > 0) {
      sound.volume = 0.3; // Lowered volume to 30%
      sound.currentTime = 0;
      sound.play().catch(e => console.error("Audio play blocked", e));
    } else if (this.audioContext) {
      // Fallback Synthesizer
      this.playSynthFallback(key);
    }
  }

  playSynthFallback(key: string) {
    if (!this.audioContext) return;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;

    // Lowered gain values significantly for quiet playback
    if (key === 'SHOOT') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
      gain.gain.setValueAtTime(0.03, now); 
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (key === 'EXPLOSION') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (key === 'POWERUP' || key === 'HEALTH') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.1);
      osc.frequency.linearRampToValueAtTime(1320, now + 0.2);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }
}

export const assetManager = new AssetManager();