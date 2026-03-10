import * as THREE from 'three';
import CosmicAnimationManager from './CosmicAnimationManager';

interface GapVoidOptions {
  centroidA: THREE.Vector3;
  centroidB: THREE.Vector3;
  gapStrength: number; // 0-1, stronger = more void
  color?: string;
}

export function createGapVoid(options: GapVoidOptions): THREE.Group {
  const { centroidA, centroidB, gapStrength, color = '#D4AF37' } = options;
  const manager = CosmicAnimationManager.getInstance();
  const group = new THREE.Group();
  group.name = 'gap-void';

  const midpoint = new THREE.Vector3().addVectors(centroidA, centroidB).multiplyScalar(0.5);
  const dist = centroidA.distanceTo(centroidB);
  const voidRadius = dist * 0.3; // void fills 30% of the distance

  // Particle count based on gap strength (stronger gap = more particles = emptier feel)
  const particleCount = Math.floor(20 + gapStrength * 40);
  const positions = new Float32Array(particleCount * 3);
  const alphas = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);

  // Direction vector between clusters
  const direction = new THREE.Vector3().subVectors(centroidB, centroidA).normalize();
  // Perpendicular vectors for disc-like distribution
  const perp1 = new THREE.Vector3();
  if (Math.abs(direction.y) < 0.9) {
    perp1.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  } else {
    perp1.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize();
  }
  const perp2 = new THREE.Vector3().crossVectors(direction, perp1).normalize();

  for (let i = 0; i < particleCount; i++) {
    // Gaussian distribution around midpoint, ellipsoidal along cluster axis
    const along = (Math.random() - 0.5) * dist * 0.4;
    const r = Math.sqrt(-2 * Math.log(Math.random())) * voidRadius * 0.5;
    const theta = Math.random() * Math.PI * 2;

    positions[i * 3] = midpoint.x + direction.x * along + perp1.x * r * Math.cos(theta) + perp2.x * r * Math.sin(theta);
    positions[i * 3 + 1] = midpoint.y + direction.y * along + perp1.y * r * Math.cos(theta) + perp2.y * r * Math.sin(theta);
    positions[i * 3 + 2] = midpoint.z + direction.z * along + perp1.z * r * Math.cos(theta) + perp2.z * r * Math.sin(theta);

    // Alpha: fade toward edges
    const distFromCenter = Math.sqrt(along * along + r * r);
    alphas[i] = Math.max(0.05, 1 - distFromCenter / (voidRadius * 1.5));
    sizes[i] = 2 + Math.random() * 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const voidMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float alpha;
      attribute float size;
      varying float vAlpha;
      uniform float uTime;
      void main() {
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uBaseOpacity;
      varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float shimmer = 0.7 + 0.3 * sin(uTime * 0.8 + vAlpha * 15.0);
        float alpha = vAlpha * uBaseOpacity * shimmer * (1.0 - dist * 2.0);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uBaseOpacity: { value: 0.06 + gapStrength * 0.04 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  manager.registerShaderMaterial(voidMaterial);
  const points = new THREE.Points(geometry, voidMaterial);
  points.name = 'gap-void-particles';
  group.add(points);

  // Question mark sprite at midpoint
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(212, 175, 55, 0.6)';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 32);
  }
  const markerTexture = new THREE.CanvasTexture(canvas);
  const markerSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: markerTexture,
      transparent: true,
      opacity: 0.3 + gapStrength * 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  markerSprite.position.copy(midpoint);
  markerSprite.scale.setScalar(15 + gapStrength * 10);
  markerSprite.name = 'gap-void-marker';
  group.add(markerSprite);

  return group;
}
