import Eyebrow from '../components/Eyebrow';
import FeatureCard from '../components/FeatureCard';

const ADVANCED_FEATURES = [
  {
    icon: '⚡',
    title: 'Inline completions',
    description: 'Ghost-text suggestions as you type. Auto or manual trigger with Alt+\\.',
  },
  {
    icon: '🧩',
    title: 'Skills system',
    description: 'Load Claude Code-style skill sets from GitHub, npm, or the marketplace.',
  },
  {
    icon: '🔌',
    title: 'MCP support',
    description: 'Connect external tools via Model Context Protocol for extended capabilities.',
  },
  {
    icon: '🌿',
    title: 'Git worktrees',
    description: 'Isolate AI sessions to git worktrees — keep your workspace clean.',
  },
];

export default function AdvancedFeaturesGrid() {
  return (
    <section class="advanced-features section" aria-labelledby="advanced-features-heading">
      <div class="container">
        <div class="section-header">
          <Eyebrow>And there's more</Eyebrow>
          <h2 class="section-heading advanced-features__heading" id="advanced-features-heading">
            Everything a modern AI assistant should be
          </h2>
        </div>
        <ul class="feature-grid feature-grid--4" role="list">
          {ADVANCED_FEATURES.map(f => (
            <li><FeatureCard {...f} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
