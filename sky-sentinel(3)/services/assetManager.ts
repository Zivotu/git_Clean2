import { ASSETS } from '../constants';
import { AssetStatus, AssetDefinition } from '../types';

class AssetManager {
  // Store CanvasImageSource so we can store either HTMLImageElement OR HTMLCanvasElement directly
  private images: Map<string, CanvasImageSource> = new Map();
  private statusMap: Map<string, AssetStatus> = new Map();
  private initialized = false;

  constructor() {
    ASSETS.forEach(def => {
      this.statusMap.set(def.key, {
        key: def.key,
        isLoaded: false,
        isFallback: true,
        src: '',
        def
      });
    });
  }

  async loadAll(): Promise<void> {
    if (this.initialized) return;

    const promises = ASSETS.map(async (def) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.src = def.path;

        img.onload = () => {
          this.images.set(def.key, img);
          this.statusMap.set(def.key, {
            key: def.key,
            isLoaded: true,
            isFallback: false,
            src: def.path,
            def
          });
          resolve();
        };

        img.onerror = () => {
          // Generate Fallback as a Canvas element directly (Faster than DataURL)
          const fallbackCanvas = this.generateFallbackCanvas(def);
          this.images.set(def.key, fallbackCanvas);
          
          // For the UI preview (AssetStatus), we still need a string src, so we convert only once here
          this.statusMap.set(def.key, {
            key: def.key,
            isLoaded: true,
            isFallback: true,
            src: fallbackCanvas.toDataURL(), 
            def
          });
          resolve();
        };
      });
    });

    await Promise.all(promises);
    this.initialized = true;
  }

  // Returns something compatible with ctx.drawImage
  getImage(key: string): CanvasImageSource {
    return this.images.get(key) || this.images.get('player_ship')!; 
  }

  getStatusList(): AssetStatus[] {
    return Array.from(this.statusMap.values());
  }

  private generateFallbackCanvas(def: AssetDefinition): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Standard sprite size
    canvas.width = 64;
    canvas.height = 64;

    if (def.type === 'BACKGROUND') {
      canvas.width = 128;
      canvas.height = 128;
    }

    ctx.fillStyle = def.fallbackColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    switch (def.fallbackShape) {
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(32, 8);
        ctx.lineTo(56, 56);
        ctx.lineTo(8, 56);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Cockpit
        ctx.fillStyle = '#ccf';
        ctx.beginPath();
        ctx.arc(32, 35, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      
      case 'rect':
        ctx.fillRect(10, 10, 44, 44);
        ctx.strokeRect(10, 10, 44, 44);
        // Detail
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(15, 15, 10, 10);
        break;

      case 'circle':
        ctx.beginPath();
        ctx.arc(32, 32, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Shine
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(25, 25, 5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'star':
        this.drawStar(ctx, 32, 32, 5, 25, 12);
        ctx.fill();
        ctx.stroke();
        break;

      case 'grid':
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = def.fallbackColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Grid lines
        for(let i=0; i<=128; i+=32) {
            ctx.moveTo(i, 0); ctx.lineTo(i, 128);
            ctx.moveTo(0, i); ctx.lineTo(128, i);
        }
        ctx.stroke();
        break;
    }

    return canvas;
  }

  private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }
}

export const assetManager = new AssetManager();