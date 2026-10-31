import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import '@fontsource-variable/space-grotesk'
import './styles/base.css'
import './styles/layout.css'
import './styles/ui.css'
import './styles/components.css'
import './styles/pages.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
