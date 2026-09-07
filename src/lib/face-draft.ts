import type { CaptureCorner } from './capture-draft'

export type FaceRole = 'recto' | 'verso' | 'detail'
export const faceLabels = { recto: 'Front', verso: 'Back', detail: 'Detail' }
const baseFields = ['id', 'objectId', 'role', 'originalUrl', 'cutoutUrl', 'thumbUrl', 'maskUrl', 'width', 'height', 'sortOrder'] as const
export function faceBaseline(face: Record<string, unknown>) {
  return Object.fromEntries(baseFields.map(field => [field, face[field] ?? (field === 'sortOrder' ? 0 : null)]))
}
export type FaceTarget = { operationId: string; objectId: string; faceId: string; role: FaceRole; action: 'save' | 'delete'; base: Record<string, unknown> | null }
export type FaceConflict = { current: Record<string, unknown> | null; objectDeleted: boolean; sourceChanged?: boolean }
export type FaceReceipt = { operationId: string; objectId: string; faceId: string; itemId?: string; deleted: boolean; originalUrl?: string; cutoutUrl?: string; thumbUrl?: string; width?: number; height?: number }
export type FaceRequest = { target: FaceTarget; itemId?: string; corners: CaptureCorner[] | null }
