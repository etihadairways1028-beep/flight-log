import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import * as RTooltip from '@radix-ui/react-tooltip';
import App from './App';
import './index.css';

// HashRouter: deep links work on GitHub Pages without server rewrites.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MotionConfig reducedMotion="user">
        <RTooltip.Provider delayDuration={200}>
          <App />
        </RTooltip.Provider>
      </MotionConfig>
    </HashRouter>
  </React.StrictMode>,
);

// Offline support (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
// Keep the browser's "install app" prompt so Settings can offer it.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); (window as any).__installPrompt = e; window.dispatchEvent(new Event('installable')); });
