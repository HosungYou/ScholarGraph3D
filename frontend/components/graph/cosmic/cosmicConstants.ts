// Star color map (stellar temperature inspired, replacing FIELD_COLOR_MAP)
export const STAR_COLOR_MAP: Record<string, { core: string; glow: string }> = {
  'Computer Science': { core: '#4DA6FF', glow: '#2979FF' },
  'Engineering': { core: '#B388FF', glow: '#7C4DFF' },
  'Mathematics': { core: '#18FFFF', glow: '#00E5FF' },
  'Medicine': { core: '#FF5252', glow: '#D50000' },
  'Biology': { core: '#69F0AE', glow: '#00E676' },
  'Biochemistry': { core: '#00E676', glow: '#00C853' },
  'Neuroscience': { core: '#64FFDA', glow: '#1DE9B6' },
  'Psychology': { core: '#A7FFEB', glow: '#64FFDA' },
  'Agricultural and Food Sciences': { core: '#CCFF90', glow: '#B2FF59' },
  'Environmental Science': { core: '#76FF03', glow: '#64DD17' },
  'Physics': { core: '#EA80FC', glow: '#D500F9' },
  'Chemistry': { core: '#FF80AB', glow: '#FF4081' },
  'Materials Science': { core: '#CE93D8', glow: '#AB47BC' },
  'Geology': { core: '#BCAAA4', glow: '#8D6E63' },
  'Economics': { core: '#FFD740', glow: '#FFC400' },
  'Sociology': { core: '#FFAB40', glow: '#FF9100' },
  'Political Science': { core: '#FF6E40', glow: '#FF3D00' },
  'Philosophy': { core: '#FFD180', glow: '#FFAB40' },
  'History': { core: '#D7CCC8', glow: '#A1887F' },
  'Geography': { core: '#FF8A80', glow: '#FF5252' },
  'Linguistics': { core: '#FFE57F', glow: '#FFD740' },
  'Art': { core: '#FFF176', glow: '#FFEE58' },
  'Education': { core: '#FFB74D', glow: '#FFA726' },
  'Business': { core: '#FF9100', glow: '#FF6D00' },
  'Law': { core: '#80DEEA', glow: '#4DD0E1' },
  Other: { core: '#B0BEC5', glow: '#78909C' },
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
