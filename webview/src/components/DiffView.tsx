import { Component, For } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';

export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
}

interface DiffViewProps {
  lines: DiffLine[];
  filename: string;
  fileUri: string;
  onDismiss: () => void;
}

const DiffView: Component<DiffViewProps> = (props) => {
  const apply = () => {
    getVsCodeApi().postMessage({ type: 'confirmApply', fileUri: props.fileUri });
    props.onDismiss();
  };

  return (
    <div class="diff-view">
      <div class="diff-header">
        <span class="diff-filename">{props.filename.split(/[\\/]/).pop()}</span>
        <div class="diff-actions">
          <button class="diff-apply" onClick={apply}>Apply</button>
          <button class="diff-discard" onClick={props.onDismiss}>Discard</button>
        </div>
      </div>
      <pre class="diff-content">
        <For each={props.lines}>
          {(line) => (
            <div class={`diff-line diff-line--${line.type}`}>
              <span class="diff-marker">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span>{line.content}</span>
            </div>
          )}
        </For>
      </pre>
    </div>
  );
};

export default DiffView;
