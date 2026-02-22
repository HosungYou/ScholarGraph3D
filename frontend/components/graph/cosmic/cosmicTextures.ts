import * as THREE from 'three';

// Cache textures
let glowTexture: THREE.Texture | null = null;
let coronaTexture: THREE.Texture | null = null;
let flareTexture: THREE.Texture | null = null;

export function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
  gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.04)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

export function getCoronaTexture(): THREE.Texture {
  if (coronaTexture) return coronaTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(46, 204, 113, 0)');
  gradient.addColorStop(0.5, 'rgba(46, 204, 113, 0.35)');
  gradient.addColorStop(0.8, 'rgba(46, 204, 113, 0.15)');
  gradient.addColorStop(1, 'rgba(46, 204, 113, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  coronaTexture = new THREE.CanvasTexture(canvas);
  return coronaTexture;
}

export function getFlareTexture(): THREE.Texture {
  if (flareTexture) return flareTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // 6-pointed star shape
  ctx.translate(64, 64);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    const gradient = ctx.createLinearGradient(0, -64, 0, 64);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0)');
    gradient.addColorStop(0.4, 'rgba(255, 215, 0, 0.4)');
    gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.6)');
    gradient.addColorStop(0.6, 'rgba(255, 215, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-2, -64, 4, 128);
  }
  flareTexture = new THREE.CanvasTexture(canvas);
  return flareTexture;
}
