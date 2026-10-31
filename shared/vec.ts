/** 3D vectors as plain data, with no renderer dependencies. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
export const length = (a: Vec3) => Math.sqrt(dot(a, a))
export const distance = (a: Vec3, b: Vec3) => length(sub(a, b))
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a)
  return l < 1e-9 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / l)
}
