'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface AstronautHelmetProps {
  size?: number;
  className?: string;
}

export default function AstronautHelmet({ size = 400, className = '' }: AstronautHelmetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = size;
    const height = size;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // transparent

    // Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 3.2);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x222222, 1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xFFFFFF, 2.5);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8888AA, 0.8);
    fillLight.position.set(-3, 1, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xD4AF37, 1.2);
    rimLight.position.set(-2, 3, -3);
    scene.add(rimLight);

    const bottomLight = new THREE.PointLight(0x334455, 0.5, 10);
    bottomLight.position.set(0, -2, 1);
    scene.add(bottomLight);

    // Helmet group
    const helmetGroup = new THREE.Group();

    // --- Helmet dome (sphere) ---
    const domeGeometry = new THREE.SphereGeometry(1, 64, 64);
    const domeMaterial = new THREE.MeshStandardMaterial({
      color: 0xEEEEEE,
      metalness: 0.95,
      roughness: 0.08,
      envMapIntensity: 1.5,
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    helmetGroup.add(dome);

    // --- Visor (darker, reflective front face) ---
    const visorGeometry = new THREE.SphereGeometry(
      1.01, 64, 64,
      Math.PI * 0.25,  // phiStart
      Math.PI * 0.5,   // phiLength
      Math.PI * 0.2,   // thetaStart
      Math.PI * 0.45   // thetaLength
    );
    const visorMaterial = new THREE.MeshStandardMaterial({
      color: 0x111122,
      metalness: 1.0,
      roughness: 0.05,
      envMapIntensity: 2.0,
    });
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.rotation.y = Math.PI * 0.25;
    helmetGroup.add(visor);

    // --- Visor rim ring ---
    const rimGeometry = new THREE.TorusGeometry(0.72, 0.025, 16, 64);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xD4AF37,
      metalness: 0.9,
      roughness: 0.2,
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.position.z = 0.72;
    rim.scale.set(1, 0.75, 1);
    helmetGroup.add(rim);

    // --- Neck ring ---
    const neckRingGeometry = new THREE.TorusGeometry(0.65, 0.04, 16, 64);
    const neckRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.3,
    });
    const neckRing = new THREE.Mesh(neckRingGeometry, neckRingMaterial);
    neckRing.position.y = -0.85;
    neckRing.rotation.x = Math.PI / 2;
    helmetGroup.add(neckRing);

    // --- Small antenna/comm detail ---
    const antennaGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
    const antennaMaterial = new THREE.MeshStandardMaterial({
      color: 0xD4AF37,
      metalness: 0.9,
      roughness: 0.2,
    });
    const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    antenna.position.set(0.6, 0.7, 0);
    antenna.rotation.z = -Math.PI / 6;
    helmetGroup.add(antenna);

    const antennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      antennaMaterial
    );
    antennaTip.position.set(0.73, 0.83, 0);
    helmetGroup.add(antennaTip);

    // Tilt helmet slightly
    helmetGroup.rotation.x = -0.1;
    helmetGroup.rotation.y = -0.3;
    scene.add(helmetGroup);

    // --- Environment map (simple gradient cube for reflections) ---
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
    const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);

    // Create a starfield background for reflections
    const starBgScene = new THREE.Scene();
    const starCount = 500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 40;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xFFFFFF,
      size: 0.3,
      transparent: true,
      opacity: 0.8,
    });
    starBgScene.add(new THREE.Points(starGeo, starMat));

    // Add gradient sphere for ambient reflection
    const envSphereGeo = new THREE.SphereGeometry(45, 32, 32);
    const envSphereMat = new THREE.MeshBasicMaterial({
      color: 0x050510,
      side: THREE.BackSide,
    });
    starBgScene.add(new THREE.Mesh(envSphereGeo, envSphereMat));

    // Capture env map
    cubeCamera.position.copy(dome.position);
    cubeCamera.update(renderer, starBgScene);
    domeMaterial.envMap = cubeRenderTarget.texture;
    visorMaterial.envMap = cubeRenderTarget.texture;

    // Animation
    let frameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Gentle float
      helmetGroup.position.y = Math.sin(elapsed * 0.5) * 0.05;
      // Subtle rotation
      helmetGroup.rotation.y = -0.3 + Math.sin(elapsed * 0.3) * 0.08;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup — dispose resources before renderer to prevent dispatchEvent crashes
    return () => {
      cancelAnimationFrame(frameId);

      // Dispose geometries and materials first
      domeGeometry.dispose();
      domeMaterial.dispose();
      visorGeometry.dispose();
      visorMaterial.dispose();
      rimGeometry.dispose();
      rimMaterial.dispose();
      neckRingGeometry.dispose();
      neckRingMaterial.dispose();
      antennaGeometry.dispose();
      antennaMaterial.dispose();
      starGeo.dispose();
      starMat.dispose();
      envSphereGeo.dispose();
      envSphereMat.dispose();
      cubeRenderTarget.dispose();

      // Clear scenes and dispose renderer last
      scene.clear();
      starBgScene.clear();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
    };
  }, [size]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
