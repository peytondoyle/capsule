export type CaptureExif = { taken?: string; lat?: number; lng?: number }
export type CaptureRequest = { captureId: string; name: string; action: 'status' | 'finish'; exif?: CaptureExif }
export type CaptureResponse = { status: 'missing' | 'uploaded' | 'recorded'; itemId?: string }
