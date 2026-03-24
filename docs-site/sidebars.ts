import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  userGuideSidebar: [
    {
      type: 'category',
      label: 'User Guide',
      collapsed: false,
      items: [
        'user-guide/getting-started',
        'user-guide/chat-interface',
        'user-guide/model-selection',
        'user-guide/skills-and-commands',
        'user-guide/file-attachments',
        'user-guide/autonomous-mode',
        'user-guide/mcp-servers',
      ],
    },
  ],
  developerSidebar: [
    {
      type: 'category',
      label: 'Developer Reference',
      collapsed: false,
      items: [
        'developer/architecture',
        'developer/adding-skills',
        'developer/openrouter-integration',
        'developer/tools-and-mcp',
        'developer/building-locally',
        'developer/contributing',
      ],
    },
  ],
};

export default sidebars;
