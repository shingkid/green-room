import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ViteYaml from '@modyfi/vite-plugin-yaml'

export default defineConfig({
  base: '/green-room/',
  plugins: [react(), ViteYaml()],
})
