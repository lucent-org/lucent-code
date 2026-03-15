import { Component } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
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

  const applyToFile = () => {
    getVsCodeApi().postMessage({
      type: 'applyToFile',
      code: props.code,
      language: props.language || '',
      filename: props.filename,
    });
  };

  return (
    <div class="code-block">
      <div class="code-block-header">
        <span class="code-block-lang">{props.filename && props.language
          ? `${props.language} — ${props.filename}`
          : props.filename ?? props.language ?? 'text'}</span>
        <div class="code-block-actions">
          <button onClick={copyCode} title="Copy">Copy</button>
          <button onClick={insertAtCursor} title="Insert at cursor">Insert</button>
          <button onClick={applyToFile} title="Apply to file">Apply</button>
        </div>
      </div>
      <pre>
        <code class={`language-${props.language || ''}`}>{props.code}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
