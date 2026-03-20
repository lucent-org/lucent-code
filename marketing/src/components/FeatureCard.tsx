import Badge from './Badge';

interface Props {
  icon: string;
  title: string;
  description: string;
  badge?: string;
  variant?: 'light' | 'dark';
}

export default function FeatureCard(props: Props) {
  const variant = () => props.variant ?? 'light';
  return (
    <article class={`feature-card feature-card--${variant()}`}>
      <div class="feature-card__icon" aria-hidden="true">{props.icon}</div>
      <h3 class="feature-card__title">{props.title}</h3>
      <p class="feature-card__description">{props.description}</p>
      {props.badge && <Badge variant="primary">{props.badge}</Badge>}
    </article>
  );
}
