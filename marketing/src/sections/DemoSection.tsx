import Eyebrow from '../components/Eyebrow';

const STEPS = [
  {
    title: 'Ask a question',
    description: 'Type in the chat panel. The AI has full access to your language server — symbols, types, and live diagnostics included.',
  },
  {
    title: 'Get precise answers',
    description: 'Lucent Code resolves symbols and types — not guessed from text, but read from your LSP. Accurate answers, every time.',
  },
  {
    title: 'Take action',
    description: 'Accept edits, apply quick fixes, rename symbols — with your approval at every step. You stay in control.',
  },
];

export default function DemoSection() {
  return (
    <section class="demo section" id="demo" aria-labelledby="demo-heading">
      <div class="container">
        <div class="section-header">
          <Eyebrow>See it in action</Eyebrow>
          <h2 class="section-heading demo__heading" id="demo-heading">
            Your language server, now in AI
          </h2>
          <p class="section-subtext demo__subtext">
            Every response is grounded in real code intelligence — not pattern matching on text.
          </p>
        </div>

        <div class="demo__layout">
          <div class="demo__showcase">
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

          <ol class="demo__steps" aria-label="How Lucent Code works">
            {STEPS.map((step, i) => (
              <li class="demo__step">
                <div class="demo__step-number" aria-hidden="true">{i + 1}</div>
                <div class="demo__step-content">
                  <h3 class="demo__step-title">{step.title}</h3>
                  <p class="demo__step-description">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
