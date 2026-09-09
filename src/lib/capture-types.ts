export type CaptureOriginal = { sha256: string; size: number }
export type CaptureExif = { taken?: string; lat?: number; lng?: number }
export type CaptureRequest = { captureId: string; name: string; action: 'status' | 'finish'; exif?: CaptureExif; original?: CaptureOriginal }
export type CaptureResponse = { status: 'missing' | 'uploaded' | 'recorded'; itemId?: string; original?: CaptureOriginal | null }
