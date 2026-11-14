import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {PUBLIC_CLIENT_RUNTIME_CONFIG_KEYS} from './src/publicRuntimeConfigKeys';

function erp4RuntimeConfig(): Plugin {
  return {
    name: 'erp4-runtime-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname !== '/runtime-config.json') return next();
        const fileEnv = loadEnv(server.config.mode, server.config.root, '');
        const config = Object.fromEntries(
          PUBLIC_CLIENT_RUNTIME_CONFIG_KEYS.map((key) => [key, String(fileEnv[key] || '')]),
        );
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(JSON.stringify(config));
      });
    },
  };
}

function firebaseClientBundleGuard(): Plugin {
  return {
    name: 'firebase-client-bundle-guard',
    apply: 'build',
    generateBundle(_options, bundle) {
      const firebaseModules = [...new Set(Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .flatMap((output) => Object.keys(output.modules))
        .filter((id) => /(?:^|[/\\])node_modules[/\\](?:firebase|@firebase)(?:[/\\]|$)/i.test(id)))];

      if (firebaseModules.length > 0) {
        const sample = firebaseModules.slice(0, 10).join(', ');
        this.error(`Firebase client SDK modules entered the browser bundle: ${sample}`);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [erp4RuntimeConfig(), react(), tailwindcss(), firebaseClientBundleGuard()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const modulePath = id.replace(/\\/g, '/');
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(modulePath)) {
              return 'vendor-react';
            }
            if (modulePath.includes('/node_modules/@supabase/')) {
              return 'vendor-supabase';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        'firebase/firestore': path.resolve(__dirname, 'src/firebaseFirestoreDisabled.ts'),
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  };
});

