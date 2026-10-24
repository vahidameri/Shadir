import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { autoDirFields } from './lib/dir'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// typed text takes its direction from what is typed
autoDirFields()
