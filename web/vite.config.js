import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' makes the build work on GitHub Pages subpaths and Vercel alike
export default defineConfig({ plugins: [react()], base: './' })
