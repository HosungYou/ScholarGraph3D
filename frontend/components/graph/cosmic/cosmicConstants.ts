// Star color map (stellar temperature inspired, replacing FIELD_COLOR_MAP)
export const STAR_COLOR_MAP: Record<string, { core: string; glow: string }> = {
  // Computer & Engineering — Blue Giant
  'Computer Science': { core: '#7EB8FF', glow: '#4A90D9' },
  'Engineering': { core: '#7EB8FF', glow: '#5B9BD5' },
  'Mathematics': { core: '#8EC8FF', glow: '#6CA6E0' },
  // Life & Medical Sciences — Green Nebula / Red Supergiant
  'Medicine': { core: '#FF6B5B', glow: '#E74C3C' },
  'Biology': { core: '#5BFF8F', glow: '#2ECC71' },
  'Biochemistry': { core: '#5BFF8F', glow: '#27AE60' },
  'Neuroscience': { core: '#4BFFCC', glow: '#1ABC9C' },
  'Psychology': { core: '#3BDDBB', glow: '#16A085' },
  'Agricultural and Food Sciences': { core: '#B3E987', glow: '#A3D977' },
  'Environmental Science': { core: '#92D351', glow: '#82C341' },
  // Physical Sciences — Exotic Purple
  'Physics': { core: '#B580D9', glow: '#9B59B6' },
  'Chemistry': { core: '#A454BD', glow: '#8E44AD' },
  'Materials Science': { core: '#9D4CA8', glow: '#7D3C98' },
  'Geology': { core: '#8C4493', glow: '#6C3483' },
  // Social Sciences — K-type Orange
  'Economics': { core: '#FFa040', glow: '#E67E22' },
  'Sociology': { core: '#F37420', glow: '#D35400' },
  'Political Science': { core: '#EA8F3E', glow: '#CA6F1E' },
  'Philosophy': { core: '#DA6A20', glow: '#BA4A00' },
  'History': { core: '#C06020', glow: '#A04000' },
  'Geography': { core: '#E0594B', glow: '#C0392B' },
  'Linguistics': { core: '#FFB832', glow: '#F39C12' },
  'Art': { core: '#FFD42F', glow: '#F1C40F' },
  'Education': { core: '#F5B886', glow: '#E59866' },
  // Business & Law
  'Business': { core: '#7DC0F2', glow: '#5DADE2' },
  'Law': { core: '#68D9C0', glow: '#48C9B0' },
  Other: { core: '#B5BDC6', glow: '#95A5A6' },
};

// Get star colors for a field, with fallback
export function getStarColors(field: string): { core: string; glow: string } {
  return STAR_COLOR_MAP[field] || STAR_COLOR_MAP.Other;
}

// Twinkle rate based on paper age (oldest -> slow, newest -> fast)
export function getTwinkleRate(year: number, minYear: number, maxYear: number): number {
  const span = maxYear - minYear || 1;
  const normalized = (year - minYear) / span; // 0=oldest, 1=newest
  return 1.5 + normalized * 4.5; // 1.5Hz -> 6.0Hz
}

// GLSL for star twinkle vertex shader
export const STAR_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// GLSL for star twinkle fragment shader
export const STAR_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPhase;
  uniform float uTwinkleRate;
  uniform float uOpacity;
  uniform float uEmissiveIntensity;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    // Twinkle
    float twinkle = 0.85 + 0.15 * sin(uTime * uTwinkleRate + uPhase);

    // Fresnel rim glow
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);

    vec3 baseColor = uColor * twinkle;
    vec3 rimColor = uColor * fresnel * 0.5;
    vec3 emissive = uColor * uEmissiveIntensity * twinkle;

    vec3 finalColor = baseColor + rimColor + emissive;
    gl_FragColor = vec4(finalColor, uOpacity * twinkle);
  }
`;

// Edge flow fragment shader
export const EDGE_FLOW_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float flow = fract(vUv.x - uTime * uSpeed);
    float brightness = smoothstep(0.0, 0.3, flow) * smoothstep(1.0, 0.7, flow);
    float alpha = brightness * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export const EDGE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
