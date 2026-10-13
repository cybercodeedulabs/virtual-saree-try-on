import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/500.css';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support for the showroom floor: after one visit with internet,
// the app, model and every saree keep working if the Wi-Fi drops.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Offline mode unavailable:', err));
  });
}
