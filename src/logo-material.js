import * as THREE from 'three';

export function createLogoMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffff00,
    metalness: 0,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
}

export function addLogoLighting(renderer, scene) {
  // Two fixed softboxes in a neutral studio. The same environment lights every
  // point of the solid, at every orientation; nothing follows the object's pose.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x181820);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const materials = [];
  for (const { position, size, intensity } of [
    { position: [-3, 4, 5], size: [4, 2], intensity: 14 },
    { position: [4, 1, 3], size: [3, 4], intensity: 0.6 },
  ]) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity) });
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(...position);
    panel.scale.set(...size, 1);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
    materials.push(material);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(studio, 0.025);
  scene.environment = environment.texture;
  generator.dispose();
  geometry.dispose();
  materials.forEach(material => material.dispose());
  scene.add(new THREE.HemisphereLight(0xffffff, 0x22222c, 0.06));
  return environment;
}
