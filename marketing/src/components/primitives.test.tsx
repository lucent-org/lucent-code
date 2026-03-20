import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import Button from './Button';
import Badge from './Badge';
import Eyebrow from './Eyebrow';
import GradientText from './GradientText';

describe('Button', () => {
  it('renders children', () => {
    render(() => <Button>Install free</Button>);
    expect(screen.getByText('Install free')).toBeInTheDocument();
  });

  it('renders as anchor when href provided', () => {
    render(() => <Button href="https://example.com">Install</Button>);
    const el = screen.getByText('Install');
    expect(el.closest('a')).toHaveAttribute('href', 'https://example.com');
  });

  it('applies secondary variant class', () => {
    render(() => <Button variant="secondary">See how</Button>);
    const el = screen.getByText('See how');
    expect(el.closest('button, a')).toHaveClass('btn--secondary');
  });

  it('is disabled when disabled prop set', () => {
    render(() => <Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled').closest('button')).toBeDisabled();
  });
});

describe('Badge', () => {
  it('renders label text', () => {
    render(() => <Badge>LSP-powered</Badge>);
    expect(screen.getByText('LSP-powered')).toBeInTheDocument();
  });

  it('applies cyan variant', () => {
    render(() => <Badge variant="cyan">MCP</Badge>);
    expect(screen.getByText('MCP')).toHaveClass('badge--cyan');
  });
});

describe('Eyebrow', () => {
  it('renders text', () => {
    render(() => <Eyebrow>What makes it different</Eyebrow>);
    expect(screen.getByText('What makes it different')).toBeInTheDocument();
  });
});

describe('GradientText', () => {
  it('renders children', () => {
    render(() => <GradientText>light</GradientText>);
    expect(screen.getByText('light')).toBeInTheDocument();
  });
});
