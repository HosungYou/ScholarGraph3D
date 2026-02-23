'use client';

import { useRef, useEffect, useCallback } from 'react';

interface Star {
  x: number;
  y: number;
  radius: number;
  brightness: number;
  color: string;
  twinkleSpeed: number;
  twinklePhase: number;
}

const STAR_COLORS = [
  '#E8EAF6', // white
  '#C5CAE9', // blue-white
  '#90CAF9', // light blue
  '#BBDEFB', // pale blue
  '#CFD8DC', // silver
  '#FFF9C4', // warm yellow
  '#FFE0B2', // warm orange
  '#B39DDB', // faint purple
];

// Distant galaxy faint colors
const GALAXY_COLORS = [
  'rgba(100, 140, 220, 0.06)',
  'rgba(160, 100, 200, 0.04)',
  'rgba(200, 120, 80, 0.03)',
];

export default function DeepFieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const frameRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  const generateStars = useCallback((width: number, height: number) => {
    const stars: Star[] = [];
    const area = width * height;
    // ~1 star per 800px² — dense but realistic
    const count = Math.min(Math.floor(area / 800), 3000);

    for (let i = 0; i < count; i++) {
      // Power-law distribution: many dim, few bright
      const brightRoll = Math.random();
      let radius: number;
      let brightness: number;

      if (brightRoll > 0.997) {
        // Very bright star (0.3%)
        radius = 1.2 + Math.random() * 0.8;
        brightness = 0.8 + Math.random() * 0.2;
      } else if (brightRoll > 0.98) {
        // Medium star (1.7%)
        radius = 0.6 + Math.random() * 0.6;
        brightness = 0.5 + Math.random() * 0.3;
      } else if (brightRoll > 0.9) {
        // Dim star (8%)
        radius = 0.3 + Math.random() * 0.3;
        brightness = 0.25 + Math.random() * 0.25;
      } else {
        // Very faint (90%)
        radius = 0.2 + Math.random() * 0.2;
        brightness = 0.08 + Math.random() * 0.15;
      }

      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius,
        brightness,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        twinkleSpeed: 0.3 + Math.random() * 2,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }

    return stars;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      starsRef.current = generateStars(window.innerWidth, window.innerHeight);
    };

    resize();

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX / window.innerWidth;
      mouseRef.current.y = e.clientY / window.innerHeight;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('resize', resize);

    const draw = (time: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Pure black void
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Faint distant galaxy patches
      GALAXY_COLORS.forEach((color, i) => {
        const gx = w * (0.2 + i * 0.3) + Math.sin(time * 0.0001 + i) * 20;
        const gy = h * (0.3 + i * 0.15) + Math.cos(time * 0.00008 + i) * 15;
        const gr = 120 + i * 60;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      });

      // Very subtle milky way band (horizontal luminance)
      const mwGrad = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.65);
      mwGrad.addColorStop(0, 'transparent');
      mwGrad.addColorStop(0.3, 'rgba(80, 100, 160, 0.012)');
      mwGrad.addColorStop(0.5, 'rgba(80, 100, 160, 0.018)');
      mwGrad.addColorStop(0.7, 'rgba(80, 100, 160, 0.012)');
      mwGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = mwGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle parallax offset from mouse
      const px = (mouseRef.current.x - 0.5) * 3;
      const py = (mouseRef.current.y - 0.5) * 3;

      // Draw stars
      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const twinkle = Math.sin(time * 0.001 * s.twinkleSpeed + s.twinklePhase);
        const alpha = s.brightness * (0.7 + twinkle * 0.3);

        if (alpha < 0.03) continue; // skip invisible

        const sx = s.x + px * (s.radius * 0.5);
        const sy = s.y + py * (s.radius * 0.5);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;

        if (s.radius > 0.8) {
          // Bright stars get a soft glow
          const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.radius * 3);
          glowGrad.addColorStop(0, s.color);
          glowGrad.addColorStop(0.3, s.color);
          glowGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = glowGrad;
          ctx.fillRect(sx - s.radius * 3, sy - s.radius * 3, s.radius * 6, s.radius * 6);

          // Diffraction spikes for brightest stars
          if (s.radius > 1.2) {
            ctx.globalAlpha = alpha * 0.3;
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(sx - s.radius * 5, sy);
            ctx.lineTo(sx + s.radius * 5, sy);
            ctx.moveTo(sx, sy - s.radius * 5);
            ctx.lineTo(sx + s.radius * 5, sy);
            ctx.stroke();
          }
        } else {
          // Small stars: simple circle
          ctx.beginPath();
          ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resize);
    };
  }, [generateStars]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ pointerEvents: 'none' }}
    />
  );
}
