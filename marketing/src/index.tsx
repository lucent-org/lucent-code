import { render } from 'solid-js/web';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './components/Button.css';
import './components/NavBar.css';
import './sections/HeroSection.css';
import './sections/SocialProofStrip.css';
import './components/FeatureCard.css';
import './sections/CoreFeaturesGrid.css';

render(() => <App />, document.getElementById('root')!);
