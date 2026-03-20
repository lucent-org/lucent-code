interface Model { name: string; logo?: string; }
interface Props { models: Model[]; label?: string; }

export default function SocialProofStrip(props: Props) {
  return (
    <div class="proof-strip">
      <p class="proof-strip__label">{props.label ?? 'Works with every major model'}</p>
      <ul class="proof-strip__models" role="list">
        {props.models.map(m => (
          <li class="proof-strip__model">
            {m.logo
              ? <img src={m.logo} alt={m.name} class="proof-strip__logo" />
              : <span class="proof-strip__model-name">{m.name}</span>
            }
          </li>
        ))}
        <li class="proof-strip__model">
          <span class="proof-strip__model-name proof-strip__model-name--muted">+ more via OpenRouter</span>
        </li>
      </ul>
    </div>
  );
}
