import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import NavBar from './NavBar';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#demo' },
];

describe('NavBar', () => {
  it('renders logo text', () => {
    render(() => <NavBar links={links} ctaHref="#install" />);
    expect(screen.getByText('Lucent Code')).toBeInTheDocument();
  });

  it('renders nav links on desktop (hidden on mobile via CSS — present in DOM)', () => {
    render(() => <NavBar links={links} ctaHref="#install" />);
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
  });

  it('renders CTA button', () => {
    render(() => <NavBar links={links} ctaHref="https://marketplace.visualstudio.com" />);
    const cta = screen.getByRole('link', { name: /install free/i });
    expect(cta).toHaveAttribute('href', 'https://marketplace.visualstudio.com');
  });

  it('hamburger button has aria-expanded=false by default', () => {
    render(() => <NavBar links={links} ctaHref="#" />);
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('hamburger toggles mobile menu open/closed', () => {
    render(() => <NavBar links={links} ctaHref="#" />);
    const btn = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument();
  });
});
