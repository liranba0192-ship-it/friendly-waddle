import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base נדרש כדי שהאפליקציה תרוץ תחת נתיב-משנה ב-GitHub Pages
// (https://<user>.github.io/<repo>/). אם תפרסם בריפו בשם אחר — עדכן כאן.
// ניתן לדרוס דרך משתנה סביבה BASE_PATH בזמן ה-build.
const base = process.env.BASE_PATH || '/ac-planner/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'תכנון התקנות מיזוג',
        short_name: 'מיזוג',
        description: 'סימון מסלולי צנרת על תוכנית וחישוב אורכים אוטומטי',
        lang: 'he',
        dir: 'rtl',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f5f6f8',
        theme_color: '#1f6feb',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
