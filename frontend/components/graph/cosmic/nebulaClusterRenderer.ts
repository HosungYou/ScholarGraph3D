import * as THREE from 'three';
import CosmicAnimationManager from './CosmicAnimationManager';

interface NebulaClusterOptions {
  color: string;
  centroid: { x: number; y: number; z: number };
  nodeCount: number;
  spread: number; // approximate radius of cluster
  isEmerging?: boolean;
}

export function createNebulaCluster(options: NebulaClusterOptions): THREE.Group {
  const { color, centroid, nodeCount, spread, isEmerging } = options;
  const manager = CosmicAnimationManager.getInstance();

  const particleCount = Math.min(60, Math.max(20, nodeCount * 4));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const alphas = new Float32Array(particleCount);

  // Box-Muller transform for Gaussian distribution
  for (let i = 0; i < particleCount; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;

    positions[i * 3] = centroid.x + r * Math.cos(theta) * spread * 0.6;
    positions[i * 3 + 1] = centroid.y + r * Math.sin(theta) * spread * 0.6;
    // Second Gaussian for Z
    const u3 = Math.random();
    const u4 = Math.random();
    const r2 = Math.sqrt(-2 * Math.log(u3));
    positions[i * 3 + 2] = centroid.z + r2 * Math.cos(2 * Math.PI * u4) * spread * 0.6;

    // Alpha based on distance from centroid
    const dx = positions[i * 3] - centroid.x;
    const dy = positions[i * 3 + 1] - centroid.y;
    const dz = positions[i * 3 + 2] - centroid.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    alphas[i] = Math.max(0.05, 1 - (dist / (spread * 1.5)));
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const baseOpacity = isEmerging ? 0.18 : Math.max(0.05, 0.12 * Math.sqrt(20 / particleCount));

  const cloudMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      uniform float uTime;
      void main() {
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(8.0, 3.0 * (300.0 / -mvPosition.z));
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
        float shimmer = 0.85 + 0.15 * sin(uTime * 1.5 + vAlpha * 20.0);
        float alpha = vAlpha * uBaseOpacity * shimmer * (1.0 - dist * 2.0);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uBaseOpacity: { value: baseOpacity },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  manager.registerShaderMaterial(cloudMaterial);

  const points = new THREE.Points(geometry, cloudMaterial);
  points.name = 'nebula-cluster-cloud';

  // Glow ring: cluster boundary marker with pulse animation
  const ringRadius = spread * 1.4;
  const ringGeometry = new THREE.RingGeometry(ringRadius * 0.92, ringRadius, 64);

  const ringMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor:   { value: new THREE.Color(color) },
      uTime:    { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3  uColor;
      uniform float uTime;
      varying vec2  vUv;
      void main() {
        float pulse = 0.6 + 0.4 * sin(uTime * 1.2);
        float opacity = 0.18 * pulse;
        gl_FragColor = vec4(uColor, opacity);
      }
    `,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    side:        THREE.DoubleSide,
  });

  manager.registerShaderMaterial(ringMaterial);

  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.name = 'nebula-cluster-ring';
  ring.position.set(centroid.x, centroid.y, centroid.z);
  // Billboard: face the camera on every frame
  ring.onBeforeRender = (_renderer, _scene, camera) => {
    ring.quaternion.copy(camera.quaternion);
  };

  const group = new THREE.Group();
  group.name = 'nebula-cluster';
  group.add(points);
  group.add(ring);
  return group;
}
