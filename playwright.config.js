// playwright.config.js
// Pruebas E2E del juego en LAN (npm run test:e2e). El servidor lo levanta cada spec en un puerto libre para poder
// leer su salida de error; el cliente lo sirve el propio servidor Express (sin bundler ni CDN).
// Por defecto usa el Chrome instalado en el equipo (sin descargar navegadores): PW_CHANNEL=chromium para el de Playwright.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.js',
  timeout: 6 * 60 * 1000,
  workers: 1,
  reporter: [['list']],
  use: {
    channel: process.env.PW_CHANNEL || 'chrome',
    headless: process.env.PW_HEADED ? false : true,
    viewport: { width: 1280, height: 720 },
    trace: 'off'
  }
});
