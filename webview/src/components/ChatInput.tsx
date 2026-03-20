import { Component, createSignal, createEffect, Show, For } from 'solid-js';

interface MentionSource {
  id: string;
  label: string;
  description: string;
  kind: 'context' | 'action';
}

const MENTION_SOURCES: MentionSource[] = [
  { id: 'fix',     label: '@fix',     description: 'Fix code at cursor',              kind: 'action'  },
  { id: 'explain', label: '@explain', description: 'Explain code at cursor',           kind: 'action'  },
  { id: 'test',    label: '@test',    description: 'Write tests for code at cursor',   kind: 'action'  },
  { id: 'terminal', label: '@terminal', description: 'Last 200 lines of active terminal', kind: 'context' },
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
  skills: { name: string; description: string }[];
  onResolveSkill: (name: string) => Promise<string | null>;
  pendingChip?: { name: string; content: string };
  onPendingChipConsumed?: () => void;
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
  const [skillChips, setSkillChips] = createSignal<{ name: string; content: string }[]>([]);
  let fileInputRef: HTMLInputElement | undefined;

  createEffect(() => {
    const chip = props.pendingChip;
    if (!chip) return;
    setSkillChips((prev) => {
      if (prev.some((c) => c.name === chip.name)) return prev;
      return [...prev, chip];
    });
    props.onPendingChipConsumed?.();
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
      setShowMentions(false);
      setShowSkills(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions()) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: Event) => {
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    setInput(value);

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

  const filteredSkills = () =>
    props.skills.filter((s) => s.name.toLowerCase().includes(skillFilter()));

  const selectMention = async (source: MentionSource) => {
    setShowMentions(false);
    setIsResolvingMention(true);
    const value = input();
    const lastAt = value.lastIndexOf('@');
    const beforeAt = lastAt !== -1 ? value.slice(0, lastAt) : value;

    try {
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
          </div>
        </Show>
        <Show when={showSkills() && filteredSkills().length > 0}>
          <div class="mention-dropdown">
            <For each={filteredSkills()}>
              {(skill) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectSkill(skill); }}
                >
                  <span class="mention-item-label">/{skill.name}</span>
                  <span class="mention-item-desc">{skill.description}</span>
                </button>
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
          placeholder="Ask about your code... Type @ for mentions, / for skills"
          rows={3}
          disabled={props.isStreaming || isResolvingMention()}
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
        <button
          class="attach-button"
          aria-label="Attach files"
          onClick={() => fileInputRef?.click()}
          title="Attach files"
          disabled={props.isStreaming}
        >📎</button>
        <button
          class="attach-button"
          aria-label="Add terminal output"
          onClick={() => void handleTerminalButton()}
          title="Add terminal output"
          disabled={props.isStreaming || isResolvingMention()}
        >&gt;_</button>
        <button
          class="attach-button"
          aria-label="Browse skills"
          onClick={() => { setSkillFilter(''); setShowSkills(true); }}
          title="Browse skills (or type / in the input)"
          disabled={props.isStreaming || props.skills.length === 0}
        >/…</button>
        <Show
          when={props.isStreaming}
          fallback={
            <button
              class="send-button"
              onClick={handleSend}
              disabled={isResolvingMention() || (!input().trim() && attachments().filter((a) => !a.error).length === 0 && terminalContent() === null && skillChips().length === 0)}
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
