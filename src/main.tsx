import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Load Google Fonts non-blockingly without inline HTML onload attributes (strict CSP compliant)
const fontHref =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${fontHref}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontHref;
  document.head.appendChild(link);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
