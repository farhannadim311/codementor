import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceSettingsProvider } from './contexts/VoiceSettingsContext.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VoiceSettingsProvider>
      <App />
    </VoiceSettingsProvider>
  </StrictMode>,
)
