import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import './index.css';

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/offline.js").catch(error => {
    console.warn("No se pudo preparar Caja Play para abrir sin internet.", error);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user"><App /></MotionConfig>
  </StrictMode>,
);
