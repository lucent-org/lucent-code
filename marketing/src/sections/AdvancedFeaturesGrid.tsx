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
    title: 'Smart skills',
    description: 'Built-in coding skills (TDD, clean commits, debugging) plus load from GitHub, npm, or Claude Code — declared in LUCENT.md.',
  },
  {
    icon: '🔀',
    title: 'Mid-conversation model switch',
    description: 'Type @model to pick a different model inline, or let the AI call use_model when the task needs stronger reasoning.',
  },
  {
    icon: '🏠',
    title: 'Native provider support',
    description: 'Connect directly to Anthropic or NVIDIA NIM for the latest model features, without routing through a middleman.',
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
        <ul class="feature-grid feature-grid--3" role="list">
          {ADVANCED_FEATURES.map(f => (
            <li><FeatureCard {...f} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
