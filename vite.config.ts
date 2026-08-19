import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: `base` must match the GitHub repo name, because a GitHub Pages
// project site is served from https://<user-or-org>.github.io/<repo>/ .
// The QR codes printed in the labs encode this path — do NOT change the repo
// name or this value once the codes are posted.
export default defineConfig({
  base: '/lab-checklist/',
  plugins: [react()],
})
