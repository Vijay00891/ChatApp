import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { SocketProvider } from './context/SocketContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <App />
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                fontFamily: '"DM Sans", "Google Sans", Roboto, sans-serif',
                fontSize: '14px',
                borderRadius: '12px',
                padding: '10px 16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              },
            }}
          />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
