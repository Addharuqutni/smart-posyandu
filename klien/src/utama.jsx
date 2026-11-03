import React from 'react'
import ReactDOM from 'react-dom/client'
import Aplikasi from './Aplikasi.jsx'

ReactDOM.createRoot(document.getElementById('akar')).render(
  <React.StrictMode>
    <Aplikasi />
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
