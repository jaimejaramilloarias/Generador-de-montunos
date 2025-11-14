import './style.css';
import { setupApp } from './ui/app';

const container = document.querySelector<HTMLDivElement>('#app');

if (container) {
  setupApp(container);
}
