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
  const milkyWayRef = useRef<THREE.Points | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const isWarpingRef = useRef(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const starCount = isMobile ? 1500 : 3000;
  const milkyWayCount = isMobile ? 800 : 1500;
  const dpr = typeof window !== 'undefined' ? (isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio) : 1;

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x050510, 1);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      starPositions[i3] = (Math.random() - 0.5) * 200;
      starPositions[i3 + 1] = (Math.random() - 0.5) * 200;
      starPositions[i3 + 2] = (Math.random() - 0.5) * 200;
      // Color: warm white to cool blue
      const temp = Math.random();
      starColors[i3] = 0.7 + temp * 0.3;
      starColors[i3 + 1] = 0.7 + temp * 0.2;
      starColors[i3 + 2] = 0.8 + temp * 0.2;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    starsRef.current = stars;

    // Milky Way band
    const mwGeo = new THREE.BufferGeometry();
    const mwPositions = new Float32Array(milkyWayCount * 3);
    const mwColors = new Float32Array(milkyWayCount * 3);
    for (let i = 0; i < milkyWayCount; i++) {
      const i3 = i * 3;
      const t = (Math.random() - 0.5) * 200;
      mwPositions[i3] = t;
      mwPositions[i3 + 1] = Math.sin(t * 0.05) * 15 + (Math.random() - 0.5) * 20;
      mwPositions[i3 + 2] = (Math.random() - 0.5) * 60;
      mwColors[i3] = 0.4 + Math.random() * 0.2;
      mwColors[i3 + 1] = 0.3 + Math.random() * 0.3;
      mwColors[i3 + 2] = 0.6 + Math.random() * 0.4;
    }
    mwGeo.setAttribute('position', new THREE.BufferAttribute(mwPositions, 3));
    mwGeo.setAttribute('color', new THREE.BufferAttribute(mwColors, 3));
    const mwMat = new THREE.PointsMaterial({ size: 0.4, vertexColors: true, transparent: true, opacity: 0.4, sizeAttenuation: true });
    const milkyWay = new THREE.Points(mwGeo, mwMat);
    scene.add(milkyWay);
    milkyWayRef.current = milkyWay;

    // Animation
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      // Parallax
      if (cameraRef.current && !isMobile) {
        cameraRef.current.rotation.x += (mouseRef.current.y * 0.05 - cameraRef.current.rotation.x) * 0.02;
        cameraRef.current.rotation.y += (mouseRef.current.x * 0.05 - cameraRef.current.rotation.y) * 0.02;
      }
      // Slow rotation
      if (starsRef.current) starsRef.current.rotation.y += 0.0001;
      if (milkyWayRef.current) milkyWayRef.current.rotation.y += 0.00005;
      renderer.render(scene, camera);
    };
    animate();

    // Mouse
    const onMouseMove = (e: PointerEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMouseMove);

    // Resize
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    triggerWarp: () => {
      return new Promise<void>((resolve) => {
        if (isWarpingRef.current || !starsRef.current) { resolve(); return; }
        isWarpingRef.current = true;
        const starPositions = starsRef.current.geometry.attributes.position;
        const startTime = performance.now();
        const duration = 800;
        const originalZ = new Float32Array(starPositions.count);
        for (let i = 0; i < starPositions.count; i++) {
          originalZ[i] = starPositions.getZ(i);
        }
        const warpAnimate = () => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(1, elapsed / duration);
          const eased = progress * progress; // ease-in
          for (let i = 0; i < starPositions.count; i++) {
            starPositions.setZ(i, originalZ[i] + eased * 150);
          }
          starPositions.needsUpdate = true;
          if (progress < 1) {
            requestAnimationFrame(warpAnimate);
          } else {
            // Reset
            for (let i = 0; i < starPositions.count; i++) {
              starPositions.setZ(i, originalZ[i]);
            }
            starPositions.needsUpdate = true;
            isWarpingRef.current = false;
            resolve();
          }
        };
        requestAnimationFrame(warpAnimate);
      });
    },
  }));

  return <div ref={containerRef} className="fixed inset-0 z-0" />;
});

StarfieldBackground.displayName = 'StarfieldBackground';
export default StarfieldBackground;
