import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

// ודא RTL/עברית גם אם ה-HTML נטען אחרת.
document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'he');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
