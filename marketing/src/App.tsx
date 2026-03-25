import NavBar from './components/NavBar';
import HeroSection from './sections/HeroSection';
import SocialProofStrip from './sections/SocialProofStrip';
import CoreFeaturesGrid from './sections/CoreFeaturesGrid';
import DemoSection from './sections/DemoSection';
import AdvancedFeaturesGrid from './sections/AdvancedFeaturesGrid';
import CtaBanner from './sections/CtaBanner';
import Footer from './sections/Footer';

const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=lucentcode.lucent-code';
const DOCS_URL = 'https://docs.lucentcode.dev';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#demo' },
  { label: 'Docs', href: DOCS_URL },
];

const GITHUB_URL = 'https://github.com/lucent-org/lucent-code';

const MODELS = [
  { name: 'Claude' },
  { name: 'GPT-4o' },
  { name: 'Gemini' },
  { name: 'Mistral' },
  { name: 'Llama' },
];

export default function App() {
  return (
    <>
      <NavBar links={NAV_LINKS} ctaHref={MARKETPLACE_URL} githubHref={GITHUB_URL} />
      <main id="main-content">
        <HeroSection ctaHref={MARKETPLACE_URL} />
        <SocialProofStrip models={MODELS} />
        <CoreFeaturesGrid />
        <DemoSection />
        <AdvancedFeaturesGrid />
        <CtaBanner ctaHref={MARKETPLACE_URL} />
      </main>
      <Footer />
    </>
  );
}
