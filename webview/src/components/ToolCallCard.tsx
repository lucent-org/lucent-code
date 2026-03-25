import { Component, Show } from 'solid-js';
import DiffView from './DiffView';
import type { DiffLine } from './DiffView';
import type { ApprovalScope } from '@shared';

export type { ApprovalScope };

export interface ToolApprovalData {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  diff?: DiffLine[];
  currentModel?: string;
}

interface ToolCallCardProps {
  approval: ToolApprovalData;
  onRespond: (requestId: string, approved: boolean, scope?: ApprovalScope) => void;
}

const ToolCallCard: Component<ToolCallCardProps> = (props) => {
  const argsPreview = () => {
    const entries = Object.entries(props.approval.args);
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  const filename = () => {
    const uri = props.approval.args['uri'];
    return typeof uri === 'string' ? uri : '';
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
      <Show
        when={props.approval.diff}
        fallback={
          <Show when={props.approval.toolName !== 'use_model'}>
            <pre class="tool-call-args">{argsPreview()}</pre>
          </Show>
        }
      >
        {(diff) => (
          <DiffView
            lines={diff()}
            filename={filename()}
            fileUri={filename()}
            onDismiss={() => {}}
            readOnly
          />
        )}
      </Show>
      <Show when={props.approval.toolName === 'use_model'}>
        <div class="tool-call-model-switch">
          <span class="tool-call-model-switch__label">Switch model</span>
          <Show when={props.approval.currentModel}>
            <span class="tool-call-model-switch__from">{props.approval.currentModel} →</span>
          </Show>
          <span class="tool-call-model-switch__to">{(props.approval.args.model_id as string)}</span>
          <Show when={props.approval.args.reason as string | undefined}>
            <span class="tool-call-model-switch__reason">{props.approval.args.reason as string}</span>
          </Show>
        </div>
      </Show>
      <Show when={props.approval.status === 'pending'}>
        <div class="tool-call-actions">
          <button
            class="tool-call-btn tool-call-btn--deny"
            onClick={() => props.onRespond(props.approval.requestId, false)}
          >
            Deny
          </button>
          <button
            class="tool-call-btn tool-call-btn--allow"
            onClick={() => props.onRespond(props.approval.requestId, true, 'once')}
          >
            Once
          </button>
          <button
            class="tool-call-btn tool-call-btn--allow-workspace"
            onClick={() => props.onRespond(props.approval.requestId, true, 'workspace')}
          >
            This workspace
          </button>
          <button
            class="tool-call-btn tool-call-btn--allow-global"
            onClick={() => props.onRespond(props.approval.requestId, true, 'global')}
          >
            Always
          </button>
        </div>
      </Show>
    </div>
  );
};

export default ToolCallCard;
