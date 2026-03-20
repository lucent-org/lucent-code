import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import SocialProofStrip from './SocialProofStrip';

const models = [
  { name: 'Claude' }, { name: 'GPT-4o' }, { name: 'Gemini' },
  { name: 'Mistral' }, { name: 'Llama' },
];

describe('SocialProofStrip', () => {
  it('renders the label', () => {
    render(() => <SocialProofStrip models={models} />);
    expect(screen.getByText(/works with every major model/i)).toBeInTheDocument();
  });

  it('renders all model names', () => {
    render(() => <SocialProofStrip models={models} />);
    for (const m of models) {
      expect(screen.getByText(m.name)).toBeInTheDocument();
    }
  });
});
