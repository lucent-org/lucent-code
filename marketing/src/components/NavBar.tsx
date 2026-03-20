import { createSignal, onCleanup, onMount } from 'solid-js';
import Button from './Button';

interface NavLink { label: string; href: string; }
interface Props {
  links: NavLink[];
  ctaHref: string;
  ctaLabel?: string;
}

export default function NavBar(props: Props) {
  const [scrolled, setScrolled] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);

  const handleScroll = () => setScrolled(window.scrollY > 80);

  onMount(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
  });
  onCleanup(() => {
    window.removeEventListener('scroll', handleScroll);
  });

  return (
    <header class={`navbar${scrolled() ? ' navbar--scrolled' : ''}`} role="banner">
      <nav class="navbar__inner container" aria-label="Main navigation">
        <a href="/" class="navbar__logo" aria-label="Lucent Code home">
          Lucent Code
        </a>

        <ul class="navbar__links" role="list">
          {props.links.map(link => (
            <li><a href={link.href} class="navbar__link">{link.label}</a></li>
          ))}
        </ul>

        <div class="navbar__actions">
          <Button href={props.ctaHref} size="sm">
            {props.ctaLabel ?? 'Install free'}
          </Button>
        </div>

        <button
          class="navbar__hamburger"
          aria-label="Open menu"
          aria-expanded={String(menuOpen())}
          aria-hidden={menuOpen() ? 'true' : undefined}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span class="navbar__hamburger-icon">{menuOpen() ? '✕' : '☰'}</span>
        </button>
      </nav>

      {menuOpen() && (
        <div
          class="navbar__mobile-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <button
            class="navbar__close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >✕</button>
          <ul class="navbar__mobile-links" role="list">
            {props.links.map(link => (
              <li>
                <a
                  href={link.href}
                  class="navbar__mobile-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Button href={props.ctaHref} size="lg" class="navbar__mobile-cta">
            {props.ctaLabel ?? 'Install free'}
          </Button>
        </div>
      )}
    </header>
  );
}
