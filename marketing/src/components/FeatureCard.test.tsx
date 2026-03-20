import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import FeatureCard from './FeatureCard';

describe('FeatureCard', () => {
  it('renders icon, title and description', () => {
    render(() => (
      <FeatureCard icon="🔍" title="LSP Intelligence" description="Reads your language server." />
    ));
    expect(screen.getByText('🔍')).toBeInTheDocument();
    expect(screen.getByText('LSP Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Reads your language server.')).toBeInTheDocument();
  });

  it('renders optional badge', () => {
    render(() => (
      <FeatureCard icon="🔍" title="LSP" description="..." badge="LSP-powered" />
    ));
    expect(screen.getByText('LSP-powered')).toBeInTheDocument();
  });

  it('applies dark variant class', () => {
    const { container } = render(() => (
      <FeatureCard icon="🔍" title="LSP" description="..." variant="dark" />
    ));
    expect(container.querySelector('.feature-card--dark')).toBeTruthy();
  });
});
