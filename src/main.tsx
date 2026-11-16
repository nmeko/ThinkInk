import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled with the app, so opening ThinkInk doesn't contact Google.
import '@fontsource-variable/inter'
import '@fontsource/kalam/700.css'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import App from './App.tsx'

try { document.documentElement.dataset.hl = localStorage.getItem('thinkink-hl') ?? 'sun' } catch { /* storage blocked: default color */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
