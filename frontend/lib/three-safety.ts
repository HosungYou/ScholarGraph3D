/**
 * Global Three.js safety patch — prevents dispose/dispatchEvent crashes
 *
 * Three.js internally calls dispatchEvent({ type: 'dispose' }) when resources
 * are cleaned up. During SPA navigation (e.g., landing → explore), multiple
 * WebGLRenderers and their resources are disposed simultaneously. If the
 * internal _listeners map is already cleared or undefined, this throws:
 *   TypeError: Cannot read properties of undefined (reading '0')
 *
 * This module patches dispose() on all relevant Three.js prototypes with
 * try-catch wrappers. It MUST be imported before any Three.js component loads.
 */

let patched = false;

export function applyThreeJsSafetyPatch(): void {
  if (patched || typeof window === 'undefined') return;
  patched = true;

  // Dynamic import to ensure this only runs client-side
  const THREE = require('three');

  const patchDispose = (proto: any, name: string) => {
    const original = proto.dispose;
    if (!original) return;
    proto.dispose = function (this: any) {
      try {
        original.call(this);
      } catch {
        // WebGL state already cleaned — safe to ignore
      }
    };
  };

  patchDispose(THREE.BufferGeometry.prototype, 'BufferGeometry');
  patchDispose(THREE.Material.prototype, 'Material');
  patchDispose(THREE.Texture.prototype, 'Texture');
  patchDispose(THREE.WebGLRenderer.prototype, 'WebGLRenderer');

  // Also patch EventDispatcher.dispatchEvent to prevent crashes from
  // stale listener references during rapid mount/unmount cycles
  const origDispatch = THREE.EventDispatcher.prototype.dispatchEvent;
  if (origDispatch) {
    THREE.EventDispatcher.prototype.dispatchEvent = function (this: any, event: any) {
      try {
        origDispatch.call(this, event);
      } catch {
        // Listener map already cleared — safe to ignore
      }
    };
  }
}
