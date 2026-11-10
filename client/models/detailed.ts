/**
 * Weapons modelled in Blender (`assets/blender/<id>.py` → `client/public/models/<id>.glb`),
 * for the realistic look. A detailed model takes the place of the meshes of the one built
 * from primitives; pivots, hands, muzzle and animations stay the ones in `weapons.ts`.
 */
import type * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { WeaponId } from "../../shared/weapons.ts"

/** The weapons that have a detailed model so far. */
export const DETAILED: readonly WeaponId[] = ["cramar"]

const loader = new GLTFLoader()

export async function loadDetailed(id: WeaponId): Promise<THREE.Object3D> {
  return (await loader.loadAsync(`/models/${id}.glb`)).scene
}
