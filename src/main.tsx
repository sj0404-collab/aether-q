import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureGuestWorker } from './components/WebViewHost'

// Гостевые страницы из APK отдаёт service worker — поднимаем его заранее.
void ensureGuestWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
