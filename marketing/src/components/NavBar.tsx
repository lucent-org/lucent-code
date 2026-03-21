import { createSignal, onCleanup, onMount } from 'solid-js';
import Button from './Button';

interface NavLink { label: string; href: string; }
interface Props {
  links: NavLink[];
  ctaHref: string;
  ctaLabel?: string;
  githubHref?: string;
}

export default function NavBar(props: Props) {
  const [scrolled, setScrolled] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let hamburgerRef: HTMLButtonElement | undefined;

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
          {props.githubHref && (
            <a
              href={props.githubHref}
              class="navbar__github"
              aria-label="View on GitHub"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
              </svg>
            </a>
          )}
          <Button href={props.ctaHref} size="sm">
            {props.ctaLabel ?? 'Install free'}
          </Button>
        </div>

        <button
          ref={hamburgerRef}
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
          ref={(el) => { setTimeout(() => el?.querySelector<HTMLElement>('button')?.focus(), 0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setMenuOpen(false);
              hamburgerRef?.focus();
              return;
            }
            if (e.key === 'Tab') {
              const overlay = e.currentTarget as HTMLElement;
              const focusable = Array.from(
                overlay.querySelectorAll<HTMLElement>(
                  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
              ).filter(el => !el.closest('[aria-hidden="true"]'));
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <button
            class="navbar__close"
            aria-label="Close menu"
            onClick={() => { setMenuOpen(false); hamburgerRef?.focus(); }}
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
