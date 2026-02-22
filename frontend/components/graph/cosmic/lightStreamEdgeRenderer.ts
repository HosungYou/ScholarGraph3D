import * as THREE from 'three';
import { EDGE_VERTEX_SHADER, EDGE_FLOW_FRAGMENT_SHADER } from './cosmicConstants';
import CosmicAnimationManager from './CosmicAnimationManager';

type EdgeType = 'citation' | 'similarity' | 'conceptual' | 'ghost';

interface LightStreamOptions {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  edgeType: EdgeType;
  width: number;
}

export function createLightStreamEdge(options: LightStreamOptions): THREE.Object3D | null {
  const { start, end, color, edgeType, width } = options;
  const manager = CosmicAnimationManager.getInstance();

  // Ghost edges: keep as simple dashed lines
  if (edgeType === 'ghost') {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineDashedMaterial({
      color: 0xFF8C00,
      dashSize: 2,
      gapSize: 1.5,
      opacity: 0.3,
      transparent: true,
    });
    const line = new THREE.Line(geo, mat);
    return line;
  }

  // For citation/similarity/conceptual: create tube with flow shader
  const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  // Slight curve offset for visual interest
  const perpendicular = new THREE.Vector3()
    .subVectors(end, start)
    .cross(new THREE.Vector3(0, 1, 0))
    .normalize()
    .multiplyScalar(start.distanceTo(end) * 0.05);
  midPoint.add(perpendicular);

  const curve = new THREE.QuadraticBezierCurve3(start, midPoint, end);
  const tubeRadius = Math.max(0.15, width * 0.15);
  const tubeSegments = 16;
  const tubeGeo = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 4, false);

  const speed = edgeType === 'citation' ? 0.5 :
                edgeType === 'similarity' ? 0.3 : 0.7;

  const tubeMat = new THREE.ShaderMaterial({
    vertexShader: EDGE_VERTEX_SHADER,
    fragmentShader: EDGE_FLOW_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uOpacity: { value: edgeType === 'similarity' ? 0.35 : 0.5 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  manager.registerShaderMaterial(tubeMat);

  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.name = `light-stream-${edgeType}`;

  return tube;
}

// LOD: for far distances, return simple line instead
export function createSimpleEdge(color: string, dashed: boolean): THREE.Line {
  const geo = new THREE.BufferGeometry();
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, opacity: 0.4, transparent: true })
    : new THREE.LineBasicMaterial({ color, opacity: 0.4, transparent: true });
  return new THREE.Line(geo, mat);
}
