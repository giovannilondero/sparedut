/**
 * Weapons modelled in Blender (`assets/blender/<id>.py` → `client/public/models/<id>.glb`),
 * for the realistic look. A detailed model takes the place of the meshes of the one built
 * from primitives; pivots, hands, muzzle and animations stay the ones in `weapons.ts`.
 */
import type * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { WEAPON_IDS, type WeaponId } from "../../shared/weapons.ts"

const loader = new GLTFLoader()

/** The shooter's hands and sleeves (`assets/blender/hands.py`). */
export function loadHands(use: (hands: THREE.Object3D) => void) {
  loader.loadAsync("/models/hands.glb").then((gltf) => use(gltf.scene), () => console.warn("no detailed hands"))
}

/** Hands every weapon that has a detailed model to `use`, as each file arrives; the others keep their primitives. */
export function loadDetailed(use: (id: WeaponId, model: THREE.Object3D) => void) {
  for (const id of WEAPON_IDS)
    loader.loadAsync(`/models/${id}.glb`).then(
      (gltf) => use(id, gltf.scene),
      () => console.warn(`no detailed model for ${id}`)
    )
}
