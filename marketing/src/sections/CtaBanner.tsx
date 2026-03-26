import Button from '../components/Button';

interface Props { ctaHref: string; }

export default function CtaBanner(props: Props) {
  return (
    <section class="cta-banner section" aria-labelledby="cta-heading">
      <div class="container cta-banner__inner">
        <h2 class="cta-banner__heading" id="cta-heading">
          Write code in a new light.
        </h2>
        <p class="cta-banner__subtext">
          Free. No account needed. Install in seconds from the VS Code marketplace.
        </p>
        <Button href={props.ctaHref} size="lg">
          Install for VS Code ›
        </Button>
        <p class="cta-banner__trust">
          No credit card required · Free tier available · Open source
        </p>
      </div>
    </section>
  );
}
