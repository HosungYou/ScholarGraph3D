import * as THREE from 'three';
import { getStarColors, getTwinkleRate, STAR_VERTEX_SHADER, STAR_FRAGMENT_SHADER } from './cosmicConstants';
import { getGlowTexture, getFlareTexture, getCoronaTexture } from './cosmicTextures';
import CosmicAnimationManager from './CosmicAnimationManager';

interface StarNodeOptions {
  field: string;
  size: number;
  opacity: number;
  year: number;
  yearRange: { min: number; max: number };
  isSelected: boolean;
  isHighlighted: boolean;
  isHighlightedByPanel: boolean;
  hasSelection: boolean;
  isBridge: boolean;
  isOpenAccess: boolean;
  isTopCited: boolean;
  showBloom: boolean;
  showOARings: boolean;
  showCitationAura: boolean;
}

export function createStarNode(options: StarNodeOptions): THREE.Group {
  const {
    field, size, opacity, year, yearRange,
    isSelected, isHighlighted, isHighlightedByPanel, hasSelection,
    isBridge, isOpenAccess, isTopCited,
    showBloom, showOARings, showCitationAura,
  } = options;

  const group = new THREE.Group();
  const manager = CosmicAnimationManager.getInstance();
  const starColors = getStarColors(field);

  // Determine display color
  let displayColor = starColors.core;
  if (isSelected) displayColor = '#FFD700';
  else if (isHighlightedByPanel) displayColor = '#FF6B6B';
  else if (isHighlighted) displayColor = '#4ECDC4';

  let displayOpacity = opacity;
  if (isSelected) displayOpacity = 1;
  else if (isHighlightedByPanel) displayOpacity = 1;
  else if (isHighlighted) displayOpacity = 1;
  else if (hasSelection) displayOpacity = 0.15;

  const twinkleRate = getTwinkleRate(year || yearRange.min, yearRange.min, yearRange.max);
  const phase = Math.random() * Math.PI * 2;

  // Core star sphere with custom shader
  const geometry = new THREE.SphereGeometry(size, 16, 16);
  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(displayColor) },
      uTime: { value: 0 },
      uPhase: { value: phase },
      uTwinkleRate: { value: twinkleRate },
      uOpacity: { value: displayOpacity },
      uEmissiveIntensity: { value: isSelected ? 0.8 : isHighlighted ? 0.6 : 0.35 },
    },
    transparent: true,
    depthWrite: displayOpacity > 0.5,
  });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  manager.registerShaderMaterial(material);

  // Glow sprite (additive blend)
  const glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: new THREE.Color(starColors.glow),
      transparent: true,
      opacity: displayOpacity * 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glowSprite.scale.setScalar(size * 6);
  group.add(glowSprite);

  // Selected: lens flare sprite
  if (isSelected) {
    const flareSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getFlareTexture(),
        color: new THREE.Color('#FFD700'),
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    flareSprite.scale.setScalar(size * 3);
    group.add(flareSprite);
    manager.registerAnimatedObject({
      type: 'flare',
      mesh: flareSprite,
      update: (time) => {
        flareSprite.material.rotation = time * 0.3;
      },
    });
  }

  // OA access: corona sprite
  if (showOARings && isOpenAccess) {
    const coronaSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getCoronaTexture(),
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    coronaSprite.scale.setScalar(size * 3.5);
    group.add(coronaSprite);
  }

  // Top 10% citation: supernova burst (pulsing ring + particles)
  if (showCitationAura && isTopCited && !isSelected) {
    const ringGeo = new THREE.RingGeometry(size * 1.5, size * 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFD700'),
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // Pulsing ring animation
    manager.registerAnimatedObject({
      type: 'supernova',
      mesh: ring,
      update: (time) => {
        const scale = 1.0 + Math.sin(time * 2 + phase) * 0.4;
        ring.scale.setScalar(scale);
        ringMat.opacity = 0.3 + Math.sin(time * 2 + phase) * 0.15;
      },
    });

    // Orbiting particles (12)
    const particleCount = 12;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * size * 2;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(angle) * size * 2;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xFFD700,
      size: 1.2,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    group.add(particles);
  }

  // Bridge node: binary star (2 small spheres orbiting)
  if (isBridge) {
    const orbitGroup = new THREE.Group();
    const companion1Geo = new THREE.SphereGeometry(size * 0.3, 8, 8);
    const companion2Geo = new THREE.SphereGeometry(size * 0.25, 8, 8);
    const compMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFD700'),
      transparent: true,
      opacity: 0.6,
    });
    const comp1 = new THREE.Mesh(companion1Geo, compMat);
    comp1.position.x = size * 1.8;
    const comp2 = new THREE.Mesh(companion2Geo, compMat.clone());
    comp2.position.x = -size * 1.8;
    orbitGroup.add(comp1, comp2);
    group.add(orbitGroup);

    manager.registerAnimatedObject({
      type: 'binary',
      mesh: orbitGroup,
      update: (time) => {
        orbitGroup.rotation.y = time * 1.5 + phase;
      },
    });
  }

  // Bloom effect
  if (showBloom && isSelected) {
    const bloomGeo = new THREE.SphereGeometry(size * 1.3, 8, 8);
    const bloomMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(displayColor),
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(bloomGeo, bloomMat));
  }

  return group;
}
