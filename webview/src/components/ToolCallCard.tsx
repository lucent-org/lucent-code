import { Component, Show } from 'solid-js';

export interface ToolApprovalData {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
}

interface ToolCallCardProps {
  approval: ToolApprovalData;
  onRespond: (requestId: string, approved: boolean) => void;
}

const ToolCallCard: Component<ToolCallCardProps> = (props) => {
  const argsPreview = () => {
    const entries = Object.entries(props.approval.args);
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  return (
    <div class={`tool-call-card tool-call-card--${props.approval.status}`}>
      <div class="tool-call-header">
        <span class="tool-call-icon">🔧</span>
        <span class="tool-call-name">{props.approval.toolName}</span>
        <Show when={props.approval.status !== 'pending'}>
          <span class={`tool-call-badge tool-call-badge--${props.approval.status}`}>
            {props.approval.status === 'approved' ? 'Allowed' : 'Denied'}
          </span>
        </Show>
      </div>
      <pre class="tool-call-args">{argsPreview()}</pre>
      <Show when={props.approval.status === 'pending'}>
        <div class="tool-call-actions">
          <button
            class="tool-call-btn tool-call-btn--allow"
            onClick={() => props.onRespond(props.approval.requestId, true)}
          >
            Allow
          </button>
          <button
            class="tool-call-btn tool-call-btn--deny"
            onClick={() => props.onRespond(props.approval.requestId, false)}
          >
            Deny
          </button>
        </div>
      </Show>
    </div>
  );
};

export default ToolCallCard;
