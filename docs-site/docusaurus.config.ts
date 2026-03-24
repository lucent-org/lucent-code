import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Lucent Code',
  tagline: 'Write code in a new light',
  favicon: 'img/icon.svg',
  url: 'https://docs.lucentcode.dev',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    image: 'img/icon.svg',
    navbar: {
      title: 'Lucent Code',
      logo: {
        alt: 'Lucent Code Logo',
        src: 'img/icon.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'userGuideSidebar',
          position: 'left',
          label: 'User Guide',
        },
        {
          type: 'docSidebar',
          sidebarId: 'developerSidebar',
          position: 'left',
          label: 'Developer',
        },
        {
          href: 'https://lucentcode.dev',
          label: 'lucentcode.dev',
          position: 'right',
        },
        {
          href: 'https://marketplace.visualstudio.com/items?itemName=lucentcode.lucent-code',
          label: 'Install',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/user-guide/getting-started' },
            { label: 'Skills & Commands', to: '/docs/user-guide/skills-and-commands' },
            { label: 'Developer Reference', to: '/docs/developer/architecture' },
          ],
        },
        {
          title: 'Links',
          items: [
            { label: 'lucentcode.dev', href: 'https://lucentcode.dev' },
            {
              label: 'VS Code Marketplace',
              href: 'https://marketplace.visualstudio.com/items?itemName=lucentcode.lucent-code',
            },
            { label: 'GitHub', href: 'https://github.com/lucent-org/lucent-code' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Lucent Code.`,
    },
    prism: {
      // vsDark for both modes: we prefer dark code blocks even in light mode
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['typescript', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
