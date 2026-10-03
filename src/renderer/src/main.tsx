import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setHourCycle } from '@shared/format'
import App from './App'

setHourCycle(window.tt.hourCycle)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
