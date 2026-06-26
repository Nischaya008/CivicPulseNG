import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'CivicPulse',
        short_name: 'CivicPulse',
        description: 'Report local issues instantly',
        theme_color: '#546B41',
        background_color: '#FFF8EC',
        display: 'standalone',
        icons: [
          {
            src: 'Favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'Favicon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
