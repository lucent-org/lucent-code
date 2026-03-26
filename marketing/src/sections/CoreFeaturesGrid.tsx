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
    title: 'Any model, any provider',
    description: 'Use OpenRouter for breadth (500+ models), Anthropic natively for the latest Claude features, or NVIDIA NIM for direct GPU inference — switch providers in one click.',
    badge: 'Multi-provider',
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
