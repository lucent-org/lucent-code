import Button from '../components/Button';
import GradientText from '../components/GradientText';
import Badge from '../components/Badge';

interface Props { ctaHref: string; }

export default function HeroSection(props: Props) {
  return (
    <section class="hero" aria-labelledby="hero-heading">
      <div class="hero__glow" aria-hidden="true" />
      <div class="container hero__content">
        <Badge variant="primary">Now with MCP support</Badge>

        <h1 class="hero__heading" id="hero-heading">
          Write code in a new <GradientText>light</GradientText>
        </h1>

        <p class="hero__subtext">
          Other tools search your files. Lucent Code reads your code.<br />
          Symbols, types, references, and live diagnostics — straight from your language server.
        </p>

        <div class="hero__cta-row">
          <Button href={props.ctaHref} size="lg">
            Install for VS Code ›
          </Button>
          <Button href="#demo" variant="secondary" size="lg">
            See how it works →
          </Button>
        </div>

        <div class="hero__showcase-placeholder" aria-label="Lucent Code chat panel demo">
          <div class="code-showcase">
            <div class="code-showcase__bar" aria-hidden="true">
              <span class="code-showcase__dot" />
              <span class="code-showcase__dot" />
              <span class="code-showcase__dot" />
              <span class="code-showcase__title">Lucent Code</span>
            </div>
            <div class="code-showcase__content">
              <p class="code-showcase__placeholder-text">Chat panel screenshot</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
