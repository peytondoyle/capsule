import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Capsule',
    short_name: 'Capsule',
    description: 'A personal archive of the objects people gave you.',
    start_url: '/timeline',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    background_color: '#fbf9f5',
    theme_color: '#fbf9f5',
    orientation: 'any',
    categories: ['lifestyle', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Accession', url: '/accession', description: 'Photograph a new object' },
      { name: 'Unfiled', url: '/queue', description: 'File what is waiting' },
      { name: 'Board', url: '/board' },
    ],
    // The single highest-leverage native feature: Capsule appears in the OS
    // share sheet, so filing something is two taps from Photos.
    share_target: {
      action: '/api/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [{ name: 'photos', accept: ['image/*'] }],
      },
    },
  } as MetadataRoute.Manifest
}
