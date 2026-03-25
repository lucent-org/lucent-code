import { Component, createSignal, createEffect, createMemo, Show, For } from 'solid-js';
import ModelSelector from './ModelSelector';
import type { OpenRouterModel } from '@shared';
import { getVsCodeApi } from '../utils/vscode-api';

interface MentionSource {
  id: string;
  label: string;
  description: string;
  kind: 'context' | 'action' | 'search' | 'model' | 'file';
}

const MENTION_SOURCES: MentionSource[] = [
  { id: 'fix',     label: '@fix',     description: 'Fix code at cursor',              kind: 'action'  },
  { id: 'explain', label: '@explain', description: 'Explain code at cursor',           kind: 'action'  },
  { id: 'terminal', label: '@terminal', description: 'Last 200 lines of active terminal', kind: 'context' },
  { id: 'codebase', label: '@codebase', description: 'Semantic search across all indexed files', kind: 'search' },
  { id: 'model',   label: '@model',   description: 'Switch the active model',          kind: 'model'   },
  { id: 'file',    label: '@file',    description: 'Attach a workspace file as context', kind: 'file'    },
];

interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'text';
  data: string;
  mimeType: string;
  error?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ACCEPTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.cs', '.rb', '.swift', '.kt', '.php',
  '.html', '.css', '.json', '.md', '.yaml', '.toml', '.txt',
]);

function isAcceptedFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.has(ext);
}

interface ChatInputProps {
  onSend: (content: string, images: string[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  onResolveMention: (type: string) => Promise<string | null>;
  skills: { name: string; description: string; source: string }[];
  onResolveSkill: (name: string) => Promise<string | null>;
  pendingChip?: { name: string; content: string };
  onPendingChipConsumed?: () => void;
  models: OpenRouterModel[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  messages: { role: string; content: string }[];
  noCredits?: boolean;
  fileList?: { name: string; relativePath: string }[];
  pendingFileAttachment?: { name: string; relativePath: string; content: string } | null;
  onPendingFileAttachmentConsumed?: () => void;
  pendingFileAttachmentError?: { relativePath: string; error: string } | null;
  onPendingFileAttachmentErrorConsumed?: () => void;
}

const ChatInput: Component<ChatInputProps> = (props) => {
  const [input, setInput] = createSignal('');
  const [showMentions, setShowMentions] = createSignal(false);
  const [mentionFilter, setMentionFilter] = createSignal('');
  const [isResolvingMention, setIsResolvingMention] = createSignal(false);

  const [attachments, setAttachments] = createSignal<Attachment[]>([]);
  const [isDragging, setIsDragging] = createSignal(false);
  const [terminalContent, setTerminalContent] = createSignal<string | null>(null);
  const [terminalError, setTerminalError] = createSignal(false);
  const [showSkills, setShowSkills] = createSignal(false);
  const [skillFilter, setSkillFilter] = createSignal('');
  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(new Set(['claude']));
  const [skillChips, setSkillChips] = createSignal<{ name: string; content: string }[]>([]);
  const [showModelPicker, setShowModelPicker] = createSignal(false);
  const [modelPickerFilter, setModelPickerFilter] = createSignal('');
  const [modelPickerBeforeAt, setModelPickerBeforeAt] = createSignal('');
  const [showFilePicker, setShowFilePicker] = createSignal(false);
  const [filePickerFilter, setFilePickerFilter] = createSignal('');
  const [filePickerBeforeAt, setFilePickerBeforeAt] = createSignal('');
  let fileInputRef: HTMLInputElement | undefined;

  const contextFillPct = createMemo(() => {
    const model = props.models.find((m) => m.id === props.selectedModel);
    if (!model?.context_length || props.messages.length === 0) return undefined;
    const totalChars = props.messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimated = Math.round(totalChars / 4);
    return Math.min(100, Math.round((estimated / model.context_length) * 100));
  });

  createEffect(() => {
    const chip = props.pendingChip;
    if (!chip) return;
    setSkillChips((prev) => {
      if (prev.some((c) => c.name === chip.name)) return prev;
      return [...prev, chip];
    });
    props.onPendingChipConsumed?.();
  });

  createEffect(() => {
    const fa = props.pendingFileAttachment;
    if (!fa) return;
    const id = Math.random().toString(36).slice(2);
    setAttachments((prev) => {
      if (prev.some((a) => a.name === fa.name && a.data === fa.content)) return prev;
      return [...prev, { id, name: fa.name, kind: 'text', data: fa.content, mimeType: 'text/plain' }];
    });
    props.onPendingFileAttachmentConsumed?.();
  });

  createEffect(() => {
    const err = props.pendingFileAttachmentError;
    if (!err) return;
    const id = Math.random().toString(36).slice(2);
    const name = err.relativePath.split(/[\\/]/).pop() ?? err.relativePath;
    setAttachments((prev) => [
      ...prev,
      { id, name, kind: 'text', data: '', mimeType: 'text/plain', error: err.error },
    ]);
    props.onPendingFileAttachmentErrorConsumed?.();
  });

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const id = Math.random().toString(36).slice(2);
      const kind: 'image' | 'text' = file.type.startsWith('image/') ? 'image' : 'text';

      if (file.size > MAX_FILE_SIZE) {
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, kind, data: '', mimeType: file.type, error: 'Too large (max 5 MB)' },
        ]);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const data = (e.target?.result as string) ?? '';
        setAttachments((prev) => [...prev, { id, name: file.name, kind, data, mimeType: file.type }]);
      };
      reader.onerror = () => {
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, kind, data: '', mimeType: file.type, error: 'Read failed' },
        ]);
      };

      if (kind === 'image') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    // Only clear if leaving the wrapper entirely (not a child)
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const accepted = Array.from(files).filter(isAcceptedFile);
      if (accepted.length > 0) handleFiles(accepted);
    }
  };

  const handleFileInputChange = (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) handleFiles(files);
    (e.target as HTMLInputElement).value = ''; // reset so same file can be re-picked
  };

  const handleTerminalButton = async () => {
    if (isResolvingMention()) return;
    setIsResolvingMention(true);
    try {
      const content = await props.onResolveMention('terminal');
      if (content) {
        setTerminalContent(content);
        setTerminalError(false);
      } else {
        setTerminalError(true);
        setTimeout(() => setTerminalError(false), 2000);
      }
    } finally {
      setIsResolvingMention(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showFilePicker()) {
        setShowFilePicker(false);
        setFilePickerFilter('');
        setFilePickerBeforeAt('');
        return;
      }
      setShowMentions(false);
      setShowSkills(false);
      setShowModelPicker(false);
      setModelPickerFilter('');
      setModelPickerBeforeAt('');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions() && !showModelPicker() && !showFilePicker()) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: Event) => {
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    setInput(value);

    // If file picker is open, update filter and request new results
    if (showFilePicker()) {
      const atIdx = value.lastIndexOf('@');
      if (atIdx === -1) {
        setShowFilePicker(false);
      } else {
        const query = value.slice(atIdx + 1);
        setFilePickerFilter(query);
        getVsCodeApi().postMessage({ type: 'listFiles', query });
      }
      return;
    }

    // If model picker is open, use typed text as filter
    if (showModelPicker()) {
      const base = modelPickerBeforeAt();
      if (value.startsWith(base)) {
        setModelPickerFilter(value.slice(base.length));
      } else {
        // User backspaced past the anchor — close picker
        setShowModelPicker(false);
      }
      return;
    }

    // Detect @ trigger — only open at start or after a space
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1 && (lastAt === 0 || value[lastAt - 1] === ' ')) {
      const after = value.slice(lastAt + 1);
      // Only show if no space after @
      if (!after.includes(' ')) {
        setMentionFilter(after.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);

    // Detect / trigger for skills
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash !== -1 && (lastSlash === 0 || value[lastSlash - 1] === ' ')) {
      const afterSlash = value.slice(lastSlash + 1);
      if (!afterSlash.includes(' ')) {
        setSkillFilter(afterSlash.toLowerCase());
        setShowSkills(true);
        return;
      }
    }
    setShowSkills(false);
  };

  const filteredSources = () =>
    MENTION_SOURCES.filter((s) => s.label.toLowerCase().includes(mentionFilter()));

  const actionSources = () => filteredSources().filter((s) => s.kind === 'action');
  const contextSources = () => filteredSources().filter((s) => s.kind === 'context');
  const searchSources = () => filteredSources().filter((s) => s.kind === 'search');
  const modelSources = () => filteredSources().filter((s) => s.kind === 'model');
  const fileSources = () => filteredSources().filter((s) => s.kind === 'file');

  const filteredModelsForPicker = () => {
    const filter = modelPickerFilter().toLowerCase();
    return props.models.filter((m) =>
      m.name.toLowerCase().includes(filter) || m.id.toLowerCase().includes(filter)
    );
  };

  const filteredSkills = () =>
    props.skills.filter((s) => s.name.toLowerCase().includes(skillFilter()));

  const groupedSkills = () => {
    const skills = filteredSkills();
    const order = ['builtin', 'claude', 'github', 'npm', 'marketplace', 'local'];
    const groups = new Map<string, typeof skills>();
    for (const s of skills) {
      const g = s.source || 'builtin';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(s);
    }
    return order.filter(g => groups.has(g)).map(g => {
      const groupSkills = groups.get(g)!;
      // Sort non-builtin groups alphabetically
      if (g !== 'builtin') groupSkills.sort((a, b) => a.name.localeCompare(b.name));
      return { source: g, skills: groupSkills };
    });
  };

  const toggleGroup = (source: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source); else next.add(source);
      return next;
    });
  };

  const sourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      claude: 'Claude', github: 'GitHub', npm: 'npm',
      marketplace: 'Marketplace', local: 'Local',
    };
    return labels[source] ?? source;
  };

  const selectMention = async (source: MentionSource) => {
    setShowMentions(false);
    const value = input();
    const lastAt = value.lastIndexOf('@');
    const beforeAt = lastAt !== -1 ? value.slice(0, lastAt) : value;

    if (source.kind === 'model') {
      // Open model picker secondary dropdown; clear @model text from input
      setModelPickerBeforeAt(beforeAt);
      setModelPickerFilter('');
      setInput(beforeAt);
      setShowModelPicker(true);
      return;
    }

    if (source.kind === 'file') {
      setInput(beforeAt);
      setFilePickerBeforeAt(beforeAt);
      setFilePickerFilter('');
      setShowFilePicker(true);
      getVsCodeApi().postMessage({ type: 'listFiles', query: '' });
      return;
    }

    setIsResolvingMention(true);
    try {
      if (source.kind === 'search') {
        // Insert @codebase marker; user types the query after it
        setInput(`${beforeAt}@${source.id} `);
        setIsResolvingMention(false);
        return;
      }
      const content = await props.onResolveMention(source.id);
      if (content) {
        if (source.kind === 'action') {
          setInput(`${beforeAt}${content} `);
        } else {
          setInput(`${beforeAt}<${source.id} output>\n${content}\n</${source.id} output> `);
        }
      } else {
        setInput(`${beforeAt}[${source.label}: not available] `);
      }
    } finally {
      setIsResolvingMention(false);
    }
  };

  const selectModelFromPicker = (modelId: string) => {
    setShowModelPicker(false);
    props.onSelectModel(modelId);
    // Remove the @model text — restore input to what was before @
    setInput(modelPickerBeforeAt());
  };

  const selectFileFromPicker = (file: { name: string; relativePath: string }) => {
    setShowFilePicker(false);
    setFilePickerFilter('');
    setInput(filePickerBeforeAt());
    getVsCodeApi().postMessage({ type: 'readFileForAttachment', relativePath: file.relativePath });
  };

  const selectSkill = async (skill: { name: string; description: string }) => {
    setShowSkills(false);
    setIsResolvingMention(true);
    // Remove the /filter text from input
    const value = input();
    const lastSlash = value.lastIndexOf('/');
    setInput(lastSlash !== -1 ? value.slice(0, lastSlash) : value);
    try {
      const content = await props.onResolveSkill(skill.name);
      if (content !== null) {
        setSkillChips((prev) => {
          if (prev.some((c) => c.name === skill.name)) return prev; // no duplicates
          return [...prev, { name: skill.name, content }];
        });
      }
    } finally {
      setIsResolvingMention(false);
    }
  };

  const handleSend = () => {
    if (props.isStreaming) return;

    if (skillChips().some((c) => c.name === 'compact')) {
      if (!props.selectedModel) return;
      setSkillChips([]);
      setInput('');
      getVsCodeApi().postMessage({ type: 'compactConversation', model: props.selectedModel });
      return;
    }

    const validAttachments = attachments().filter((a) => !a.error);
    const textFiles = validAttachments.filter((a) => a.kind === 'text');
    const images = validAttachments.filter((a) => a.kind === 'image').map((a) => a.data);

    const terminal = terminalContent();
    const terminalPart = terminal ? `<terminal output>\n${terminal}\n</terminal output>` : null;
    const skillBlocks = skillChips()
      .map((c) => `<skill name="${c.name}">\n${c.content}\n</skill>`)
      .join('\n\n');
    const textParts = textFiles.map((a) => `\`\`\`${a.name}\n${a.data}\n\`\`\``);
    const fullContent = [skillBlocks || null, terminalPart, ...textParts, input().trim()].filter(Boolean).join('\n\n');

    if (!fullContent && images.length === 0) return;

    props.onSend(fullContent, images);
    setInput('');
    setAttachments([]);
    setTerminalContent(null);
    setTerminalError(false);
    setSkillChips([]);
  };

  return (
    <div class="chat-input-container">
      <div
        class={`chat-input-wrapper${isDragging() ? ' drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Show when={showMentions() && filteredSources().length > 0}>
          <div class="mention-dropdown">
            <For each={actionSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
            <Show when={actionSources().length > 0 && contextSources().length > 0}>
              <div class="mention-group-separator" />
            </Show>
            <For each={contextSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
            <Show when={contextSources().length > 0 && searchSources().length > 0}>
              <div class="mention-group-separator" />
            </Show>
            <For each={searchSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
            <Show when={(actionSources().length > 0 || contextSources().length > 0 || searchSources().length > 0) && modelSources().length > 0}>
              <div class="mention-group-separator" />
            </Show>
            <For each={modelSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
            <Show when={(actionSources().length > 0 || contextSources().length > 0 || searchSources().length > 0 || modelSources().length > 0) && fileSources().length > 0}>
              <div class="mention-group-separator" />
            </Show>
            <For each={fileSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={showFilePicker()}>
          <div class="mention-dropdown">
            <Show when={(props.fileList ?? []).length > 0} fallback={
              <div class="mention-item mention-item--disabled">
                {filePickerFilter().length > 0 ? 'No files found' : 'Type to search files…'}
              </div>
            }>
              <For each={props.fileList ?? []}>
                {(file) => (
                  <button
                    class="mention-item"
                    onMouseDown={(e) => { e.preventDefault(); selectFileFromPicker(file); }}
                  >
                    <span class="mention-item-label">{file.name}</span>
                    <span class="mention-item-desc">{file.relativePath}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
        <Show when={showModelPicker()}>
          <div class="mention-dropdown">
            <Show when={filteredModelsForPicker().length > 0} fallback={
              <div class="mention-item mention-item--disabled">No models available</div>
            }>
              <For each={filteredModelsForPicker()}>
                {(model) => (
                  <button
                    class="mention-item"
                    onMouseDown={(e) => { e.preventDefault(); selectModelFromPicker(model.id); }}
                  >
                    <span class="mention-item-label">{model.name}</span>
                    <span class="mention-item-desc">{model.id}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
        <Show when={showSkills() && filteredSkills().length > 0}>
          <div class="mention-dropdown mention-dropdown--skills">
            <For each={groupedSkills()}>
              {(group, groupIndex) => (
                <>
                  <Show when={group.source !== 'builtin'}>
                    <Show when={groupIndex() > 0 || groupedSkills()[0].source === 'builtin'}>
                      <div class="mention-group-separator" />
                    </Show>
                    <button
                      class={`mention-group-label mention-group-label--toggle${collapsedGroups().has(group.source) ? ' mention-group-label--collapsed' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); toggleGroup(group.source); }}
                    >
                      <span class="mention-group-chevron" />
                      {sourceLabel(group.source)}
                      <span class="mention-group-count">{group.skills.length}</span>
                    </button>
                  </Show>
                  <Show when={group.source === 'builtin' || !collapsedGroups().has(group.source)}>
                    <For each={group.skills}>
                      {(skill) => (
                        <button
                          class={`mention-item${group.source !== 'builtin' ? ' mention-item--indented' : ''}`}
                          onMouseDown={(e) => { e.preventDefault(); void selectSkill(skill); }}
                        >
                          <span class="mention-item-label">/{skill.name}</span>
                          <span class="mention-item-desc">{skill.description}</span>
                        </button>
                      )}
                    </For>
                  </Show>
                </>
              )}
            </For>
          </div>
        </Show>
        <Show when={attachments().length > 0 || terminalContent() !== null || terminalError() || skillChips().length > 0}>
          <div class="attachment-chips">
            <Show when={terminalError()}>
              <div class="attachment-chip attachment-chip--empty-terminal">
                <span class="attachment-name">No active terminal</span>
                <button
                  class="attachment-remove"
                  aria-label="Dismiss"
                  onClick={() => setTerminalError(false)}
                  title="Dismiss"
                >×</button>
              </div>
            </Show>
            <Show when={terminalContent()}>
              {(content) => (
                <div class="attachment-chip attachment-chip--terminal">
                  <span class="attachment-name">&gt;_ Terminal ({content().split('\n').length} lines)</span>
                  <button
                    class="attachment-remove"
                    aria-label="Remove terminal output"
                    onClick={() => setTerminalContent(null)}
                    title="Remove"
                  >×</button>
                </div>
              )}
            </Show>
            <For each={skillChips()}>
              {(chip) => (
                <div class="attachment-chip attachment-chip--skill">
                  <span class="attachment-name">/ {chip.name}</span>
                  <button
                    class="attachment-remove"
                    aria-label={`Remove ${chip.name} skill`}
                    onClick={() => setSkillChips((prev) => prev.filter((c) => c.name !== chip.name))}
                    title="Remove"
                  >×</button>
                </div>
              )}
            </For>
            <For each={attachments()}>
              {(att) => (
                <div class={`attachment-chip${att.error ? ' attachment-chip-error' : ''}`}>
                  <Show when={att.kind === 'image' && !att.error}>
                    <img class="attachment-thumb" src={att.data} alt={att.name} />
                  </Show>
                  <span class="attachment-name" title={att.name}>{att.name}</span>
                  <Show when={!!att.error}>
                    <span class="attachment-error">{att.error}</span>
                  </Show>
                  <button
                    class="attachment-remove"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    title="Remove"
                  >×</button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <textarea
          class="chat-input"
          value={input()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your code..."
          rows={3}
          disabled={props.isStreaming || isResolvingMention() || !!props.noCredits}
        />
      </div>
      <div class="chat-input-actions">
        <input
          ref={fileInputRef}
          type="file"
          style="display:none"
          accept="image/*,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.c,.cpp,.cs,.rb,.swift,.kt,.php,.html,.css,.json,.md,.yaml,.toml,.txt"
          multiple
          onChange={handleFileInputChange}
        />
        <div class="chat-input-actions__left">
          <button
            class="attach-button"
            aria-label="Attach files"
            onClick={() => fileInputRef?.click()}
            title="Attach files"
            disabled={props.isStreaming || !!props.noCredits}
          ><svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05L12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
          <button
            class="attach-button"
            aria-label="Add terminal output"
            onClick={() => void handleTerminalButton()}
            title="Add terminal output"
            disabled={props.isStreaming || isResolvingMention() || !!props.noCredits}
          >&gt;_</button>
          <button
            class="attach-button"
            aria-label="Browse skills"
            onClick={() => { setSkillFilter(''); setShowSkills(true); }}
            title="Browse skills (or type / in the input)"
            disabled={props.isStreaming || props.skills.length === 0 || !!props.noCredits}
          >/…</button>
          <ModelSelector
            models={props.models}
            selectedModel={props.selectedModel}
            onSelect={props.onSelectModel}
            contextFillPct={contextFillPct()}
          />
        </div>
        <Show
          when={props.isStreaming}
          fallback={
            <button
              class="send-button"
              onClick={handleSend}
              disabled={!!props.noCredits || !props.selectedModel || isResolvingMention() || (!input().trim() && attachments().filter((a) => !a.error).length === 0 && terminalContent() === null && skillChips().length === 0)}
            >
              Send
            </button>
          }
        >
          <button class="cancel-button" onClick={props.onCancel}>Stop</button>
        </Show>
      </div>
    </div>
  );
};

export default ChatInput;
