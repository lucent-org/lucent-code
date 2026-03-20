export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer class="footer" role="contentinfo">
      <div class="container footer__grid">
        <div class="footer__brand">
          <p class="footer__logo">Lucent Code</p>
          <p class="footer__tagline">Write code in a new light.</p>
        </div>
        <nav class="footer__nav" aria-label="Product links">
          <p class="footer__nav-heading">Product</p>
          <ul role="list">
            <li><a href="#features" class="footer__link">Features</a></li>
            <li><a href="#demo" class="footer__link">How it works</a></li>
            <li><a href="#" class="footer__link">Changelog</a></li>
            <li><a href="#" class="footer__link">Roadmap</a></li>
          </ul>
        </nav>
        <nav class="footer__nav" aria-label="Resources links">
          <p class="footer__nav-heading">Resources</p>
          <ul role="list">
            <li><a href="https://github.com/lucentcode/lucent-code" class="footer__link">GitHub</a></li>
            <li><a href="https://openrouter.ai" class="footer__link">OpenRouter</a></li>
          </ul>
        </nav>
        <nav class="footer__nav" aria-label="Connect links">
          <p class="footer__nav-heading">Connect</p>
          <ul role="list">
            <li><a href="#" class="footer__link">Twitter / X</a></li>
            <li><a href="#" class="footer__link">VS Code Marketplace</a></li>
          </ul>
        </nav>
      </div>
      <div class="footer__bottom">
        <div class="container footer__bottom-inner">
          <p class="footer__copyright">© {year} Lucent Code · MIT License</p>
          <p class="footer__legal">
            <a href="#" class="footer__link">Privacy</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
