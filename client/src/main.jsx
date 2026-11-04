import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import NotesReader from './NotesReader.jsx';
import notesDemo from '../../shared/notes-demo.json';
import './styles.css';
import './theme/paper-ui.css';
import './theme/shell.css';
import './styles/tokens.css';

const root = createRoot(document.getElementById('root'));

// #notes-demo opens the study-notes reading page on the shared demo document.
function render() {
  root.render(window.location.hash === '#notes-demo' ? <NotesReader doc={notesDemo} /> : <App />);
}

render();
window.addEventListener('hashchange', render);
