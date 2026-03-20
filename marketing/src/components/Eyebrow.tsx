import { JSX } from 'solid-js';

interface Props { children: JSX.Element }

export default function Eyebrow(props: Props) {
  return <p class="eyebrow">{props.children}</p>;
}
