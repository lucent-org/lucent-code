import { JSX } from 'solid-js';

interface Props { children: JSX.Element }

export default function GradientText(props: Props) {
  return <span class="gradient-text">{props.children}</span>;
}
