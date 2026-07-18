import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// XFly has THREE preload-ish contexts:
//  - main:     Electron main process
//  - preload:  bridge for OUR launcher renderer  (src/preload/index.ts)
//  - engine:   injected into the embedded xbox.com/play WebContentsView at
//              document-start (src/engine/index.ts) — the RTCPeerConnection/fetch
//              patches. Built as a second "preload" bundle (CommonJS, sandbox-safe).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          // our launcher bridge
          index: resolve('src/preload/index.ts'),
          // the engine injected into the xbox webview
          engine: resolve('src/engine/index.ts'),
        },
        output: {
          /**
           * KNOWN BROKEN, and worth writing down so the next person does not
           * spend the afternoon I just did.
           *
           * The comment used to say "engine must be a self-contained IIFE-ish file
           * usable as a preload". It is not one. Both entries import `@shared/ipc`,
           * so rollup hoists it into `chunks/ipc-<hash>.cjs` and each preload
           * `require('./chunks/…')`s it at load. That works until Electron hands
           * the script to a SANDBOXED renderer, where `require` is a stub that
           * knows a few built-ins and nothing about relative paths:
           *
           *   Unable to load preload script: …\out\preload\engine.cjs
           *   Error: module not found: ./chunks/ipc-5b5QJ3-l.cjs
           *
           * Observed when the xbox view navigates to login.microsoft.com during
           * sign-in, which comes up sandboxed despite `sandbox: false` on the view.
           * Harmless there — the engine stands down off xbox.com anyway — but it
           * means the engine would not load at all if a sandboxed renderer ever
           * hosted xbox.com itself.
           *
           * Two fixes were tried and neither works, so do not try them again:
           * `experimentalMinChunkSize` folds a small chunk into a SINGLE importer
           * and this one has two; `manualChunks: () => undefined` just restores
           * the default. Rollup will not duplicate a shared module across entries
           * within one build, by design. The real fix is to build the two preloads
           * as two builds, which electron-vite's single `preload` config cannot
           * express — so it needs a second config, not an option.
           */
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react()],
    // The light rig runs on a worker (src/renderer/src/lib/light-worker.ts), spawned
    // with `{ type: 'module' }` — so emit it as ESM rather than the default IIFE, and
    // keep the declared type and the emitted format in agreement.
    worker: {
      format: 'es',
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
      },
    },
  },
})
