import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './theme/paper-ui.css';
import './theme/shell.css';
import './styles/tokens.css';

createRoot(document.getElementById('root')).render(<App />);
