import { Component } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock: Component<CodeBlockProps> = (props) => {
  const copyCode = () => {
    navigator.clipboard.writeText(props.code);
  };

  const insertAtCursor = () => {
    getVsCodeApi().postMessage({
      type: 'insertCode',
      code: props.code,
    });
  };

  return (
    <div class="code-block">
      <div class="code-block-header">
        <span class="code-block-lang">{props.language || 'text'}</span>
        <div class="code-block-actions">
          <button onClick={copyCode} title="Copy">Copy</button>
          <button onClick={insertAtCursor} title="Insert at cursor">Insert</button>
        </div>
      </div>
      <pre>
        <code class={`language-${props.language || ''}`}>{props.code}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
