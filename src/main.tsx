import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/instrument-sans'
import './index.css'
import { completeSilentFrame, isSilentFrame, loadConfig } from './auth'
import { AccountRoot, LegacyRoot } from './Root.tsx'

async function main() {
  // le serveur dit s'il gère des comptes ; GitHub Pages ou serveur sans comptes : null
  const config = await loadConfig()
  if (config && isSilentFrame()) {
    // iframe de connexion silencieuse : on rend la réponse à la page, rien d'autre
    await completeSilentFrame(config)
    return
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>{config ? <AccountRoot config={config} /> : <LegacyRoot />}</StrictMode>,
  )
}

void main()
