import { JSX, splitProps } from 'solid-js';

interface Props {
  children: JSX.Element;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  disabled?: boolean;
  class?: string;
  onClick?: () => void;
}

export default function Button(props: Props) {
  const [local, rest] = splitProps(props, ['children', 'variant', 'size', 'href', 'class']);
  const variant = () => local.variant ?? 'primary';
  const size = () => local.size ?? 'md';
  const classes = () => `btn btn--${variant()} btn--${size()}${local.class ? ` ${local.class}` : ''}`;

  if (local.href) {
    return <a href={local.href} class={classes()} {...rest}>{local.children}</a>;
  }
  return <button class={classes()} {...rest}>{local.children}</button>;
}
