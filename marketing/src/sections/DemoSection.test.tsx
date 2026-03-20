import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import DemoSection from './DemoSection';

describe('DemoSection', () => {
  it('renders the section heading', () => {
    render(() => <DemoSection />);
    expect(screen.getByText(/your language server, now in ai/i)).toBeInTheDocument();
  });

  it('renders all 3 step callouts', () => {
    render(() => <DemoSection />);
    expect(screen.getByText('Ask a question')).toBeInTheDocument();
    expect(screen.getByText('Get precise answers')).toBeInTheDocument();
    expect(screen.getByText('Take action')).toBeInTheDocument();
  });

  it('renders step numbers 1-3', () => {
    render(() => <DemoSection />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
