import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { SessionProvider } from './session/SessionProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Por fuera del router y de los providers, para cubrir también sus errores. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
