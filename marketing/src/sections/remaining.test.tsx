import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import AdvancedFeaturesGrid from './AdvancedFeaturesGrid';
import CtaBanner from './CtaBanner';
import Footer from './Footer';

describe('AdvancedFeaturesGrid', () => {
  it('renders all 4 advanced feature cards', () => {
    render(() => <AdvancedFeaturesGrid />);
    expect(screen.getByText('Inline completions')).toBeInTheDocument();
    expect(screen.getByText('Skills system')).toBeInTheDocument();
    expect(screen.getByText('MCP support')).toBeInTheDocument();
    expect(screen.getByText('Git worktrees')).toBeInTheDocument();
  });
});

describe('CtaBanner', () => {
  it('renders headline and CTA', () => {
    render(() => <CtaBanner ctaHref="#" />);
    expect(screen.getByRole('link', { name: /install for vs code/i })).toBeInTheDocument();
    expect(screen.getByText(/no credit card required/i)).toBeInTheDocument();
  });
});

describe('Footer', () => {
  it('renders copyright', () => {
    render(() => <Footer />);
    expect(screen.getByText(/2026 lucent code/i)).toBeInTheDocument();
  });

  it('renders logo', () => {
    render(() => <Footer />);
    expect(screen.getAllByText('Lucent Code').length).toBeGreaterThan(0);
  });
});
