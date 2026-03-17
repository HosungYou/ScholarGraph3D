'use client';

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';

export interface StarfieldBackgroundRef {
  triggerWarp: () => Promise<void>;
}

const StarfieldBackground = forwardRef<StarfieldBackgroundRef>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const starsRef = useRef<THREE.Points | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const isWarpingRef = useRef(false);
  const warpFrameRef = useRef<number>(0);
  const disposedRef = useRef(false);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;
    const isMobile = window.innerWidth < 768;
    const starCount = isMobile ? 2000 : 4000;
    const dpr = isMobile
      ? Math.min(window.devicePixelRatio, 1.5)
      : Math.min(window.devicePixelRatio, 2);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 1);
    containerEl.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Stars with power-law brightness distribution ---
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 300;
      positions[i3 + 1] = (Math.random() - 0.5) * 300;
      positions[i3 + 2] = (Math.random() - 0.5) * 300;

      // Star color temperature: cool blue → warm yellow-white
      const temp = Math.random();
      if (temp > 0.95) {
        // Warm (5%)
        colors[i3] = 1.0;
        colors[i3 + 1] = 0.85 + Math.random() * 0.1;
        colors[i3 + 2] = 0.7 + Math.random() * 0.1;
      } else if (temp > 0.8) {
        // White (15%)
        colors[i3] = 0.9 + Math.random() * 0.1;
        colors[i3 + 1] = 0.9 + Math.random() * 0.1;
        colors[i3 + 2] = 0.95 + Math.random() * 0.05;
      } else {
        // Cool blue-white (80%)
        colors[i3] = 0.7 + Math.random() * 0.2;
        colors[i3 + 1] = 0.75 + Math.random() * 0.2;
        colors[i3 + 2] = 0.9 + Math.random() * 0.1;
      }

      // Power-law size: most tiny, few large
      const roll = Math.random();
      sizes[i] = roll > 0.99 ? 1.5 + Math.random() : roll > 0.95 ? 0.6 + Math.random() * 0.4 : 0.15 + Math.random() * 0.3;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const starMat = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    starsRef.current = stars;

    // --- Subtle milky way band ---
    const mwCount = isMobile ? 600 : 1200;
    const mwGeo = new THREE.BufferGeometry();
    const mwPos = new Float32Array(mwCount * 3);
    const mwCol = new Float32Array(mwCount * 3);
    for (let i = 0; i < mwCount; i++) {
      const i3 = i * 3;
      const t = (Math.random() - 0.5) * 300;
      mwPos[i3] = t;
      mwPos[i3 + 1] = Math.sin(t * 0.03) * 12 + (Math.random() - 0.5) * 25;
      mwPos[i3 + 2] = (Math.random() - 0.5) * 80;
      mwCol[i3] = 0.3 + Math.random() * 0.15;
      mwCol[i3 + 1] = 0.3 + Math.random() * 0.2;
      mwCol[i3 + 2] = 0.5 + Math.random() * 0.3;
    }
    mwGeo.setAttribute('position', new THREE.BufferAttribute(mwPos, 3));
    mwGeo.setAttribute('color', new THREE.BufferAttribute(mwCol, 3));
    const mwMat = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      sizeAttenuation: true,
    });
    const milkyWay = new THREE.Points(mwGeo, mwMat);
    scene.add(milkyWay);

    // --- Animation loop ---
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      // Mouse parallax
      if (cameraRef.current && !isMobile) {
        cameraRef.current.rotation.x += (mouseRef.current.y * 0.03 - cameraRef.current.rotation.x) * 0.015;
        cameraRef.current.rotation.y += (mouseRef.current.x * 0.03 - cameraRef.current.rotation.y) * 0.015;
      }
      if (starsRef.current) starsRef.current.rotation.y += 0.00005;
      milkyWay.rotation.y += 0.00003;
      renderer.render(scene, camera);
    };
    animate();

    const onMouseMove = (e: PointerEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMouseMove);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposedRef.current = true;
      cancelAnimationFrame(frameRef.current);
      cancelAnimationFrame(warpFrameRef.current);
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('resize', onResize);

      // Dispose all Three.js resources before renderer
      starGeo.dispose();
      starMat.dispose();
      mwGeo.dispose();
      mwMat.dispose();
      scene.clear();
      renderer.dispose();

      if (renderer.domElement.parentNode === containerEl) {
        containerEl.removeChild(renderer.domElement);
      }

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      starsRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    triggerWarp: () => {
      return new Promise<void>((resolve) => {
        if (isWarpingRef.current || !starsRef.current || disposedRef.current) {
          resolve();
          return;
        }
        isWarpingRef.current = true;
        const starPositions = starsRef.current.geometry.attributes.position;
        const startTime = performance.now();
        const duration = 800;
        const originalZ = new Float32Array(starPositions.count);
        for (let i = 0; i < starPositions.count; i++) {
          originalZ[i] = starPositions.getZ(i);
        }
        const warpAnimate = () => {
          // Bail out if component was unmounted during warp
          if (disposedRef.current) {
            isWarpingRef.current = false;
            resolve();
            return;
          }
          const elapsed = performance.now() - startTime;
          const progress = Math.min(1, elapsed / duration);
          const eased = progress * progress;
          for (let i = 0; i < starPositions.count; i++) {
            starPositions.setZ(i, originalZ[i] + eased * 200);
          }
          starPositions.needsUpdate = true;
          if (progress < 1) {
            warpFrameRef.current = requestAnimationFrame(warpAnimate);
          } else {
            for (let i = 0; i < starPositions.count; i++) {
              starPositions.setZ(i, originalZ[i]);
            }
            starPositions.needsUpdate = true;
            isWarpingRef.current = false;
            resolve();
          }
        };
        warpFrameRef.current = requestAnimationFrame(warpAnimate);
      });
    },
  }));

  return <div ref={containerRef} className="fixed inset-0 z-0" />;
});

StarfieldBackground.displayName = 'StarfieldBackground';
export default StarfieldBackground;
