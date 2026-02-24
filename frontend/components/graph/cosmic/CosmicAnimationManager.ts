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
  private scene: THREE.Scene | null = null;
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

  deregisterShaderMaterial(material: THREE.ShaderMaterial): void {
    const idx = this.shaderMaterials.indexOf(material);
    if (idx !== -1) this.shaderMaterials.splice(idx, 1);
  }

  deregisterAnimatedObject(obj: THREE.Object3D): void {
    const idx = this.animatedObjects.findIndex(o => o.mesh === obj);
    if (idx !== -1) this.animatedObjects.splice(idx, 1);
  }

  setScene(scene: THREE.Scene | null) {
    this.scene = scene;
  }

  clear() {
    this.animatedObjects = [];
    this.shaderMaterials = [];
    this.scene = null;
  }

  private loop = () => {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this.loop);

    const time = (performance.now() - this.startTime) * 0.001; // seconds

    // Update all shader uniforms — guard against disposed materials
    for (let i = this.shaderMaterials.length - 1; i >= 0; i--) {
      const mat = this.shaderMaterials[i];
      try {
        if (mat && mat.uniforms?.uTime) {
          mat.uniforms.uTime.value = time;
        }
      } catch {
        // Material disposed — remove stale reference
        this.shaderMaterials.splice(i, 1);
      }
    }

    // Update animated objects — guard against disposed meshes
    for (let i = this.animatedObjects.length - 1; i >= 0; i--) {
      try {
        this.animatedObjects[i].update(time);
      } catch {
        // Object disposed — remove stale reference
        this.animatedObjects.splice(i, 1);
      }
    }

    // Animate selection pulse rings via scene traverse
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.userData.isSelectionPulse && obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.3 + 0.4 * Math.abs(Math.sin(time * 2.1));
        }
      });
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
