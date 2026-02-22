import * as THREE from 'three';

type AnimatedObject = {
  type: 'supernova' | 'binary' | 'flare';
  mesh: THREE.Object3D;
  update: (time: number) => void;
};

class CosmicAnimationManager {
  private static instance: CosmicAnimationManager | null = null;
  private animatedObjects: AnimatedObject[] = [];
  private shaderMaterials: THREE.ShaderMaterial[] = [];
  private frameId: number = 0;
  private running = false;
  private startTime = 0;

  static getInstance(): CosmicAnimationManager {
    if (!CosmicAnimationManager.instance) {
      CosmicAnimationManager.instance = new CosmicAnimationManager();
    }
    return CosmicAnimationManager.instance;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
  }

  registerShaderMaterial(material: THREE.ShaderMaterial) {
    if (!this.shaderMaterials.includes(material)) {
      this.shaderMaterials.push(material);
    }
  }

  unregisterShaderMaterial(material: THREE.ShaderMaterial) {
    this.shaderMaterials = this.shaderMaterials.filter(m => m !== material);
  }

  registerAnimatedObject(obj: AnimatedObject) {
    this.animatedObjects.push(obj);
  }

  unregisterAnimatedObject(mesh: THREE.Object3D) {
    this.animatedObjects = this.animatedObjects.filter(o => o.mesh !== mesh);
  }

  clear() {
    this.animatedObjects = [];
    this.shaderMaterials = [];
  }

  private loop = () => {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this.loop);

    const time = (performance.now() - this.startTime) * 0.001; // seconds

    // Update all shader uniforms
    for (const mat of this.shaderMaterials) {
      if (mat.uniforms.uTime) {
        mat.uniforms.uTime.value = time;
      }
    }

    // Update animated objects
    for (const obj of this.animatedObjects) {
      obj.update(time);
    }
  };

  static reset() {
    if (CosmicAnimationManager.instance) {
      CosmicAnimationManager.instance.stop();
      CosmicAnimationManager.instance.clear();
      CosmicAnimationManager.instance = null;
    }
  }
}

export default CosmicAnimationManager;
