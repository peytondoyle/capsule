export type CaptureCorner = { x: number; y: number }

export type CaptureDraft = {
  title: string
  kind: string
  receivedAt: string
  place: string
  occasion: string
  givenBy: string
  tags: string[]
  story: string
  corners: CaptureCorner[] | null
}

export type CaptureFilingReceipt = {
  itemId: string
  objectId: string
  lotNo: number
}

export const emptyCaptureDraft: CaptureDraft = {
  title: '', kind: '', receivedAt: '', place: '', occasion: '', givenBy: '', tags: [], story: '', corners: null,
}
