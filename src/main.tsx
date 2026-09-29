import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { initializeAppStorage } from './shared/appStorage';
import StorageSettingsPanel from './components/StorageSettingsPanel';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
window.addEventListener('app-storage-error', event => {
  let notice = document.getElementById('storage-save-error');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'storage-save-error';
    notice.setAttribute('role', 'alert');
    Object.assign(notice.style, { position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '9999', background: '#fff1f0', color: '#a8071a', padding: '16px' });
    document.body.appendChild(notice);
  }
  notice.textContent = (event as CustomEvent<string>).detail;
});
void initializeAppStorage().then(() => {
  root.render(<React.StrictMode><App /></React.StrictMode>);
}).catch(error => {
  root.render(<main style={{ padding: 32 }}><h2>本地数据未能加载</h2><p role="alert">{String(error)}</p><StorageSettingsPanel /></main>);
});
