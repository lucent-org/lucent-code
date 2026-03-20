import { JSX } from 'solid-js';

interface Props {
  children: JSX.Element;
  variant?: 'primary' | 'cyan' | 'muted';
}

export default function Badge(props: Props) {
  const variant = () => props.variant ?? 'primary';
  return <span class={`badge badge--${variant()}`}>{props.children}</span>;
}
