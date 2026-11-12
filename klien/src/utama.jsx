import React from 'react'
import ReactDOM from 'react-dom/client'
import Aplikasi from './Aplikasi.jsx'
import { ikonDataUri } from './antarmuka/Ikon.jsx'

// Kontrol native (select, date, time) tidak bisa memakai komponen React,
// jadi path ikonnya disuntik dari sumber yang sama ke CSS variabel.
const gaya = document.documentElement.style
gaya.setProperty('--ikon-panah-bawah', `url("${ikonDataUri('panah-bawah', '#475569')}")`)
gaya.setProperty('--ikon-kalender', `url("${ikonDataUri('kalender', '#0f3d68')}")`)
gaya.setProperty('--ikon-jam', `url("${ikonDataUri('jam', '#0f3d68')}")`)

ReactDOM.createRoot(document.getElementById('akar')).render(
  <React.StrictMode>
    <Aplikasi />
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
