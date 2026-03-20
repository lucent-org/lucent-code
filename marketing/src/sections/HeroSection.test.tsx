import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import HeroSection from './HeroSection';

describe('HeroSection', () => {
  it('renders the headline', () => {
    render(() => <HeroSection ctaHref="#" />);
    expect(screen.getByText(/write code in a new/i)).toBeInTheDocument();
  });

  it('renders gradient text on "light"', () => {
    render(() => <HeroSection ctaHref="#" />);
    const gradients = document.querySelectorAll('.gradient-text');
    expect(gradients.length).toBeGreaterThan(0);
  });

  it('renders the primary CTA', () => {
    render(() => <HeroSection ctaHref="https://marketplace.example.com" />);
    const cta = screen.getByRole('link', { name: /install for vs code/i });
    expect(cta).toHaveAttribute('href', 'https://marketplace.example.com');
  });

  it('renders the secondary CTA', () => {
    render(() => <HeroSection ctaHref="#" />);
    expect(screen.getByRole('link', { name: /see how it works/i })).toBeInTheDocument();
  });

  it('renders the differentiator tagline', () => {
    render(() => <HeroSection ctaHref="#" />);
    expect(screen.getByText(/other tools search your files/i)).toBeInTheDocument();
  });
});
