import Eyebrow from '../components/Eyebrow';
import FeatureCard from '../components/FeatureCard';

const CORE_FEATURES = [
  {
    icon: '🔍',
    title: 'LSP-first intelligence',
    description: 'Understands your code the way VS Code does — symbols, types, references, and live diagnostics from your language server.',
    badge: 'LSP-powered',
  },
  {
    icon: '🔄',
    title: 'Any model via OpenRouter',
    description: 'Switch between Claude, GPT-4o, Gemini, Mistral, Llama, and more with a single API key. No vendor lock-in.',
    badge: 'Multi-model',
  },
  {
    icon: '💬',
    title: 'Streaming chat panel',
    description: 'Fast side-panel chat with Markdown, syntax-highlighted code, copy/insert buttons, and real-time responses.',
    badge: 'Built for VS Code',
  },
];

export default function CoreFeaturesGrid() {
  return (
    <section class="core-features section" id="features" aria-labelledby="core-features-heading">
      <div class="container">
        <div class="section-header">
          <Eyebrow>What makes it different</Eyebrow>
          <h2 class="section-heading" id="core-features-heading">
            The AI that reads code, not files
          </h2>
          <p class="section-subtext">
            While other tools grep through your files, Lucent Code resolves symbols and reads
            diagnostics directly from your language server — giving the AI the same picture your editor has.
          </p>
        </div>
        <ul class="feature-grid feature-grid--3" role="list">
          {CORE_FEATURES.map(f => (
            <li><FeatureCard {...f} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
