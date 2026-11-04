import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    // Оболочку открывают с любого хоста (preview-домены, локальный стенд):
    // иначе Vite отвечает 403 «Blocked request. This host is not allowed».
    server: { allowedHosts: ['.e2b.app', '.e2b.dev', '.arena.ai'], host: '0.0.0.0', port: 5199 },
    preview: { allowedHosts: ['.e2b.app', '.e2b.dev', '.arena.ai'], host: '0.0.0.0' },
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  };
})
