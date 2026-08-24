import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relative : le build fonctionne à la racine d'un domaine (image Docker)
// comme dans un sous-chemin (GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
})
