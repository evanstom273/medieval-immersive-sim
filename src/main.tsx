import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// No StrictMode: its dev-only double mount boots Phaser twice.
createRoot(document.getElementById('root')!).render(<App />);
