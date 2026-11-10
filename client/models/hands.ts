/**
 * The shooter's hands modelled in Blender (`assets/blender/hands.py` → `/models/hands.glb`):
 * one right hand bound to a skeleton, a sleeve, and a pose for every weapon, solved there by
 * closing the fingers on the weapon's own model. Here a pose is baked into a plain mesh: the
 * fingers do not move in the game, and a baked hand costs what any mesh does.
 */
import * as THREE from "three"

interface Pose {
  /** Where each bone goes from rest: x, y, z and a quaternion, from the point the hand holds. */
  readonly bones: Record<string, readonly number[]>
  readonly wrist: readonly [number, number, number]
  readonly elbow: readonly [number, number, number]
}

/** A hand in the pose `name` with its sleeve, around the point it holds; null when there is none. */
export type HandMaker = (name: string, left: boolean) => THREE.Object3D | null

const Z = new THREE.Vector3(0, 0, 1)
const ONE = new THREE.Vector3(1, 1, 1)

export function handMaker(hands: THREE.Object3D): HandMaker {
  let poses: Record<string, Pose> = {}
  const skins: THREE.SkinnedMesh[] = []
  hands.traverse((o) => {
    if (typeof o.userData.poses === "string") poses = JSON.parse(o.userData.poses) as Record<string, Pose>
    if (o instanceof THREE.SkinnedMesh) skins.push(o)
  })
  const cloth = hands.getObjectByName("sleeve")
  return (name, left) => {
    const pose = poses[name]
    if (!pose || !cloth || skins.length === 0) return null
    const hand = new THREE.Group()
    for (const skin of skins) hand.add(new THREE.Mesh(bake(skin, pose), skin.material))
    // the poses are all of a right hand: a left one is its mirror image
    const side = left ? -1 : 1
    hand.scale.x = side
    const wrist = new THREE.Vector3(pose.wrist[0] * side, pose.wrist[1], pose.wrist[2])
    const along = new THREE.Vector3(pose.elbow[0] * side, pose.elbow[1], pose.elbow[2]).sub(wrist).normalize()
    const sleeve = cloth.clone()
    sleeve.position.copy(wrist).addScaledVector(along, 0.012)
    sleeve.quaternion.setFromUnitVectors(Z, along)
    const g = new THREE.Group()
    g.add(hand, sleeve)
    return g
  }
}

/** The skin with every vertex moved by the bones it hangs from. */
function bake(skin: THREE.SkinnedMesh, pose: Pose): THREE.BufferGeometry {
  const out = skin.geometry.clone()
  const joints = out.getAttribute("skinIndex")
  const weights = out.getAttribute("skinWeight")
  const moves = skin.skeleton.bones.map((bone) => {
    const p = pose.bones[bone.name]
    return p ? new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion(p[3], p[4], p[5], p[6]), ONE).elements : null
  })
  const position = out.getAttribute("position")
  const normal = out.getAttribute("normal")
  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    m.elements.fill(0)
    let total = 0
    for (let k = 0; k < 4; k++) {
      const w = weights.getComponent(i, k)
      const move = moves[joints.getComponent(i, k)]
      if (w === 0 || !move) continue
      total += w
      for (let e = 0; e < 16; e++) m.elements[e] += w * move[e]
    }
    if (total === 0) continue
    for (let e = 0; e < 16; e++) m.elements[e] /= total
    v.fromBufferAttribute(position, i).applyMatrix4(m)
    position.setXYZ(i, v.x, v.y, v.z)
    v.fromBufferAttribute(normal, i).transformDirection(m)
    normal.setXYZ(i, v.x, v.y, v.z)
  }
  out.deleteAttribute("skinIndex")
  out.deleteAttribute("skinWeight")
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}
