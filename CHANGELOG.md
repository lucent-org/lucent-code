# Changelog

## [0.4.0](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.3.0...lucent-code-v0.4.0) (2026-03-26)


### Features

* **extension:** wire ProviderRegistry into MessageHandler via dynamic proxy ([73bf428](https://github.com/lucent-org/lucent-code/commit/73bf428a349c399318390e3b9250a3a5b453ec2a))
* Provider UI consolidation — two-level selector, multi-provider support, skill UX fixes ([791d394](https://github.com/lucent-org/lucent-code/commit/791d394ce803774ad9b42393f8684e2c12a3a844))
* **providers:** add Anthropic message/tool translation helpers ([740d7b7](https://github.com/lucent-org/lucent-code/commit/740d7b72c33ccdd45b0b0e00cbdc5c90bdad8cae))
* **providers:** add AnthropicProvider with streaming and tool translation ([4b46976](https://github.com/lucent-org/lucent-code/commit/4b46976042e88285d9c8f73b086e8d2dcce6cf94))
* **providers:** add getProvider() and isConfigured() to ProviderRegistry ([f06a65c](https://github.com/lucent-org/lucent-code/commit/f06a65cf5504e7fb119f8340bda3d87a423aad1b))
* **providers:** add ILLMProvider interface and LLMError ([b43b0cb](https://github.com/lucent-org/lucent-code/commit/b43b0cbd63bf3db867ff4bebcccc7f019d7f317a))
* **providers:** add NvidiaNimProvider with OpenAI-compatible streaming ([d627fd7](https://github.com/lucent-org/lucent-code/commit/d627fd78bfe8208dae3841f22deb7d6ff2afacc0))
* **providers:** add OpenRouterProvider implementing ILLMProvider ([5ad7d63](https://github.com/lucent-org/lucent-code/commit/5ad7d6365eca903b2bf68f50447a94e0205963c7))
* **providers:** add ProviderRegistry with auto-detect and override ([bd8f333](https://github.com/lucent-org/lucent-code/commit/bd8f33331b2d5d37f07bc550b7044d69ffb1b3a9))
* **providers:** handle switchProvider and openProviderSettings; send providersLoaded on ready ([684d24d](https://github.com/lucent-org/lucent-code/commit/684d24d99f327e06569cf841b03e069836462e26))
* **settings:** add provider API key and override configuration ([9c8fe3b](https://github.com/lucent-org/lucent-code/commit/9c8fe3babd4e9c4a05ecdfecbb3a0996f04220b0))
* **skills:** filter by supported_parameters.tools instead of model name allowlist ([5e1bef4](https://github.com/lucent-org/lucent-code/commit/5e1bef4eaab4ad24d80f413890f7a50d7ace067e))
* **statusbar:** merge dual status bar items into single dynamic provider item ([29ac27e](https://github.com/lucent-org/lucent-code/commit/29ac27eb6917bd117d63e12f41bfd722778fbbbc))
* **store:** add provider signals, switchProvider, openProviderSettings; wire in App.tsx ([72cb7c2](https://github.com/lucent-org/lucent-code/commit/72cb7c2eb7622d5bbaa93838ae5df3b84711a726))
* **types:** add providersLoaded, switchProvider, openProviderSettings message types ([2833e07](https://github.com/lucent-org/lucent-code/commit/2833e072cc35a2ca6012d1fc2efb2dd50ed33a03))
* **ui:** add ProviderModelSelector with two-level provider+model picker ([23d35e7](https://github.com/lucent-org/lucent-code/commit/23d35e792f9d9611f1dc3ecf3edc1015e548b89a))
* **webview:** show provider badge next to model name ([84d9b16](https://github.com/lucent-org/lucent-code/commit/84d9b16eb377e41bff5a63d37b4bf530e1e9cd13))


### Bug Fixes

* **docs-site:** npm install before build in deploy script ([030a379](https://github.com/lucent-org/lucent-code/commit/030a3791b67b1f1aff2b3a34726fc94542f00135))
* **docs-site:** use npx for docusaurus and wrangler in deploy script ([f8b5e06](https://github.com/lucent-org/lucent-code/commit/f8b5e0630c21f718f31e5f3d0a90060835cc4f68))
* **handler:** restore worktree auto-create and default error notification ([65d0f26](https://github.com/lucent-org/lucent-code/commit/65d0f26a74f5b2faa71b299c73988569c91f574c))
* **marketing:** replace placeholder links and update copy ([f05c057](https://github.com/lucent-org/lucent-code/commit/f05c057b5ab35d71924421d37746e2e3a906e692))
* post-merge followups (Nemotron cleanup, marketing links, docs-site wrangler) ([4093e2f](https://github.com/lucent-org/lucent-code/commit/4093e2f73053b16be87d59e1696c41c22f67e892))
* **providers:** add optional metadata to LLMError, thread through OpenRouterProvider ([12cc54d](https://github.com/lucent-org/lucent-code/commit/12cc54da36032fe4f27cef30ba323415d14b5ff2))
* **providers:** capture real messageId from stream, add PermissionDeniedError mapping ([0ffb68c](https://github.com/lucent-org/lucent-code/commit/0ffb68c0dd7c7b4e429ff7a333d24288250c9cee))
* **providers:** fix 429 dead code in NvidiaNimProvider — remove from RETRYABLE set ([52216a0](https://github.com/lucent-org/lucent-code/commit/52216a056f85bdc9dd0270ccf9d6d7caca013427))
* **providers:** guard JSON.parse in toAnthropicMessages, document null accumulator behavior ([572c0e7](https://github.com/lucent-org/lucent-code/commit/572c0e7e97f7f19cfbc5a69d133e21ab92f086db))
* **providers:** guard resolveProviderName against resolver exceptions ([4a79913](https://github.com/lucent-org/lucent-code/commit/4a79913305043650a1132df86e76237cbaab284d))
* **providers:** live override update and async callback safety in switchProvider ([a400160](https://github.com/lucent-org/lucent-code/commit/a400160aab5164a9ffcaf4df06f38ccf5fd0feee))
* **providers:** route listModels and getAccountBalance through active provider ([7f3027b](https://github.com/lucent-org/lucent-code/commit/7f3027b7342dd4f77643cd50b74143179f200c0e))
* **skills:** remove Nemotron workarounds from skill injection ([19258d5](https://github.com/lucent-org/lucent-code/commit/19258d5ed4e24e5683774ceacbbadf56d882d8e3))
* **store:** prevent warning timer race condition in receiveModelChange ([93feaf4](https://github.com/lucent-org/lucent-code/commit/93feaf44a9093f541ead7f170d43c999f0460a59))
* **types:** resolve all TypeScript compile errors ([0339dfd](https://github.com/lucent-org/lucent-code/commit/0339dfdf9578bd810dbaa1343778f87649bcb69e))
* **ui:** fix model-item--selected CSS class and remove unused selectedModelProvider prop ([761dff8](https://github.com/lucent-org/lucent-code/commit/761dff8650a7c431c3530a4060d99deddd07185f))
* **ui:** format model prices as per-million-token in ProviderModelSelector ([da59871](https://github.com/lucent-org/lucent-code/commit/da59871b9091354ddc6b73226969f0ac1a22d89d))
* **ui:** keep thinking badge visible on hovered/selected model items ([8753418](https://github.com/lucent-org/lucent-code/commit/8753418fb2cf55c608fed1cb5d8d2a477607f7b5))
* **ui:** show skill badges in YOU message; block skill-only send on all models ([9e678a5](https://github.com/lucent-org/lucent-code/commit/9e678a5927bff40dcb78b39afa5387279fc2842b))
* **ui:** strip redundant (free) suffix from model names, tighten level-2 list height ([af39d74](https://github.com/lucent-org/lucent-code/commit/af39d74befbf4d971037ad3ae3aafea6147e5f1b))


### Refactoring

* **completions:** replace status bar item with onLoadingChange callback ([6218399](https://github.com/lucent-org/lucent-code/commit/621839963b27b2976b57adfd89034d24d564173c))
* **handler:** swap OpenRouterClient for ILLMProvider ([a02157c](https://github.com/lucent-org/lucent-code/commit/a02157c1514419126fad24e8efe9b40584ad2024))
* update InlineProvider and tests to use ILLMProvider ([d426f27](https://github.com/lucent-org/lucent-code/commit/d426f27844c178a0c4726e7dd00335aa63f925d8))


### Documentation

* add LLM provider abstraction design ([764f5ce](https://github.com/lucent-org/lucent-code/commit/764f5ce752812d0ee124a78f3c6fc12e61bd06fa))
* add LLM provider abstraction implementation plan ([9231cb6](https://github.com/lucent-org/lucent-code/commit/9231cb66f9e28873f5a4628490095502bbae57f9))
* add provider UI consolidation design doc ([65894e7](https://github.com/lucent-org/lucent-code/commit/65894e795374eb747e70bfa40cebcb66072de46a))
* add provider UI consolidation implementation plan ([0af7bf0](https://github.com/lucent-org/lucent-code/commit/0af7bf035a37618a0deb7b7aa19633315d996770))
* fix skills list in marketing and add quick-reference table to docs ([ac3ae9f](https://github.com/lucent-org/lucent-code/commit/ac3ae9f3163588a0c8886fad01736727f0ab994b))
* update marketing and docs for multi-provider support ([743e426](https://github.com/lucent-org/lucent-code/commit/743e426ff1a78b74a85cc5f2848976e88c2080d8))
* update README and marketplace metadata for multi-provider support ([0631377](https://github.com/lucent-org/lucent-code/commit/0631377a2e9774a225baa75fc5dd25d2d30f27b7))
* update README and marketplace metadata for multi-provider support ([cf28d44](https://github.com/lucent-org/lucent-code/commit/cf28d4401963201119f30669ceff5315459270d5))

## [0.3.0](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.8...lucent-code-v0.3.0) (2026-03-25)


### Features

* **chat:** add [@file](https://github.com/file) typed mention for keyboard-driven file context injection ([446e317](https://github.com/lucent-org/lucent-code/commit/446e3179c433574fdc067d44930bc811322297c1))
* **chat:** add [@model](https://github.com/model) mention for user-initiated model switching ([26375fe](https://github.com/lucent-org/lucent-code/commit/26375feb7473231ebc1295c2f190ea1a4b2d0620))
* **chat:** add /compact system command — summarize and truncate conversation history ([0a434f3](https://github.com/lucent-org/lucent-code/commit/0a434f395b70a04e37dd40e77a48c9dbaf9c6096))
* **chat:** drop [@test](https://github.com/test) action mention — replaced by /tests skill ([7acdcf5](https://github.com/lucent-org/lucent-code/commit/7acdcf56939d9110837e7ad8ff4d3ada4f6755ea))
* **chat:** style compaction divider and update feature inventory ([83dd4cb](https://github.com/lucent-org/lucent-code/commit/83dd4cbc0de055ed494b0ca620757804fe4baec9))
* **chat:** style use_model approval card and [@model](https://github.com/model) picker empty state ([e3fd7f5](https://github.com/lucent-org/lucent-code/commit/e3fd7f5a28d14bf67c62a8b8c3e2829088c58a23))
* **credits:** add usage types and usageUpdate message ([8897910](https://github.com/lucent-org/lucent-code/commit/88979109afea4006839308437f7bf869c2b81d27))
* **credits:** consolidate status bar, show session cost, credits menu ([ca65f5c](https://github.com/lucent-org/lucent-code/commit/ca65f5cc1b27133b38d044d8e73c67702ee93c8d))
* **credits:** handle usageUpdate and noCredits in webview store ([0e89e63](https://github.com/lucent-org/lucent-code/commit/0e89e635a75a29f7f29d3b6b2f47519e8abcafff))
* **credits:** per-message cost tooltip, no-credits banner, openExternal message ([e3d87f9](https://github.com/lucent-org/lucent-code/commit/e3d87f9893aa3b405e019aaa5736667efd9c6b72))
* **credits:** track session cost and fetch account balance ([1d09ffd](https://github.com/lucent-org/lucent-code/commit/1d09ffdb8d0ba1f994fd438f026b5b177a2526e7))
* **docs:** apply Lucent Code brand styling and home page ([ca2a2a8](https://github.com/lucent-org/lucent-code/commit/ca2a2a8067f5ee909904e2ec03b52fcb1bc2bf8f))
* **docs:** scaffold Docusaurus 3.7 in docs-site/ ([5c311fc](https://github.com/lucent-org/lucent-code/commit/5c311fcaa66acdd71069190ec3cac6d52433a1ba))
* **marketing:** add Docs link to navbar and footer, fix GitHub URL, fix marketplace link ([4ea4b70](https://github.com/lucent-org/lucent-code/commit/4ea4b70c300a8b6ea394552d40f03aa5f4869b8c))
* missing tools + scoped approval system ([26489aa](https://github.com/lucent-org/lucent-code/commit/26489aaaa011b849b9adab7675875421dc9c506c))
* show per-1M-token pricing in model selector dropdown ([175b803](https://github.com/lucent-org/lucent-code/commit/175b80326a37e5954352f6a74c352636cfeb20f2))
* **skills:** add 6 built-in language-agnostic skills ([af1a43e](https://github.com/lucent-org/lucent-code/commit/af1a43e5c3c1ea63ab53ca83649b24b001fe9efe))
* **skills:** add ClaudeCodeSource adapter — auto-loads ~/.claude/skills ([762cfd2](https://github.com/lucent-org/lucent-code/commit/762cfd20a2ae8fe0acb7346bb77017d642d47ff9))
* **skills:** add doc, tests, commit, onboard built-in skills ([813f207](https://github.com/lucent-org/lucent-code/commit/813f2075948fe74504c4659147a13cd5e0e3c316))
* **skills:** add doc, tests, commit, onboard, compact built-in skill files ([3aeebef](https://github.com/lucent-org/lucent-code/commit/3aeebef97b3c8892cc788b09f1d64f0a4bb97921))
* **skills:** pull-only loading — remove SkillMatcher, surface activated skills ([ee45e3d](https://github.com/lucent-org/lucent-code/commit/ee45e3d50968861e9d171ecdaa856ebcf6cf7d3c))
* **skills:** update InstructionsLoader — LUCENT.md filenames + [@skill](https://github.com/skill)() parser ([ab50956](https://github.com/lucent-org/lucent-code/commit/ab509567df0fc5ebedddc77420759a016564b5f7))
* structured OpenRouter error handling for all API error codes ([d6c04c0](https://github.com/lucent-org/lucent-code/commit/d6c04c0270923f101604b3a76ea61e7567907ab5))
* **tools:** add 4-button scoped approval UI to ToolCallCard ([be23d03](https://github.com/lucent-org/lucent-code/commit/be23d03d58a9c251a32ee92feaa8c930c6b82004))
* **tools:** add ToolApprovalManager for scoped tool approvals ([43d1512](https://github.com/lucent-org/lucent-code/commit/43d1512d2be297f9539cebd31bd078357b69de53))
* **tools:** add use_model tool with scoped approval and model switch ([2e69f08](https://github.com/lucent-org/lucent-code/commit/2e69f080de965db05c732af70857dc12e3b525a0))
* **tools:** add write_file, delete_file, run_terminal_command, list_directory, create_directory ([517c6ad](https://github.com/lucent-org/lucent-code/commit/517c6ad3eb490a1a169c874d30ef34605a271096))
* **tools:** extend toolApprovalResponse with scope field ([4a5dc4b](https://github.com/lucent-org/lucent-code/commit/4a5dc4b48110aed6049a3dad8baf100c91086de1))
* **tools:** style scoped approval buttons in ToolCallCard ([23e0850](https://github.com/lucent-org/lucent-code/commit/23e0850dd08ddd578e9c2e10b7888e70d44647f2))
* **tools:** wire ToolApprovalManager into MessageHandler ([871abcd](https://github.com/lucent-org/lucent-code/commit/871abcd94a77a58e3a517b417919e88770ff1e7a))
* **webview:** collapsible skill groups with count badge and indented items ([81a72da](https://github.com/lucent-org/lucent-code/commit/81a72da5ed566407f2f160c81f32e6d769d37bb5))


### Bug Fixes

* **chat:** binary file rejection, error feedback, and case-insensitive file search ([42029d7](https://github.com/lucent-org/lucent-code/commit/42029d76258d2c616cb937d9552216d988344e9d))
* **chat:** fix binary probe, test nesting, path.relative, and attachment dedup ([52c3a83](https://github.com/lucent-org/lucent-code/commit/52c3a83f22a0638817d7ea828e0c7592b1233070))
* **chat:** remove dead [@test](https://github.com/test) handler, add binary/oversized file tests ([5604b9b](https://github.com/lucent-org/lucent-code/commit/5604b9bf60d3e335c5fc21c1068c31f651c9a93e))
* **chat:** remove unnecessary as any casts in compact divider ([8430a98](https://github.com/lucent-org/lucent-code/commit/8430a98a99de45239be7768891079251ef6d970a))
* **chat:** reset model picker state on Escape, add empty-state row ([0b45930](https://github.com/lucent-org/lucent-code/commit/0b459308d3861c395e70cc56b561f41a1d60a197))
* **chat:** resolve TypeScript errors and improve compact robustness ([6305997](https://github.com/lucent-org/lucent-code/commit/63059973daa4885453cc5d1f017f2753941ce135))
* **chat:** restore indent on [@terminal](https://github.com/terminal) entry in MENTION_SOURCES ([0fbc678](https://github.com/lucent-org/lucent-code/commit/0fbc67822eab79518ee265cacaf316ba7e820036))
* **core:** fix notifications command name and context-builder test mocks ([2254c86](https://github.com/lucent-org/lucent-code/commit/2254c86b7260d0c95076008ce2ef0ae3143de940))
* **credits:** correct balance display and type postMessage wrapper safely ([e957ac0](https://github.com/lucent-org/lucent-code/commit/e957ac0d95f90f7ffc4c045471dc31d8624c1dc6))
* **credits:** correct usageUpdate property access in App.tsx ([c9968af](https://github.com/lucent-org/lucent-code/commit/c9968af0b01c161b052c6945d93a4d1074db5e13))
* handle 401 by invalidating auth and prompting re-sign-in ([476c3d7](https://github.com/lucent-org/lucent-code/commit/476c3d7c1e4065280a1c58a02fe45d58876c2ca2))
* **oauth:** handle windowId in callback path, add app_name, move status bar to right ([27954e0](https://github.com/lucent-org/lucent-code/commit/27954e05351ed003ac2951c8e5281a52d511f201))
* **oauth:** remove PKCE (OpenRouter unsupported), consolidate auth commands, improve UX ([b5cce08](https://github.com/lucent-org/lucent-code/commit/b5cce0823eafa831d9ea5c89b83f17473baeb328))
* raise tool loop limit to 15, force text response on final iteration ([89835be](https://github.com/lucent-org/lucent-code/commit/89835be6dabe37ac63a187e422311250bd975c2c))
* **skills:** embed built-in skills as module imports to survive packaging ([2e9807c](https://github.com/lucent-org/lucent-code/commit/2e9807c75612ba372624ef61dad0df3360e36c30))
* **skills:** language-neutral truncation marker, delete dead SkillMatcher ([e3670a0](https://github.com/lucent-org/lucent-code/commit/e3670a0c6243e088059b2e439c02ce7df46e3a6d))
* **skills:** single-pass [@skill](https://github.com/skill)() extraction with anchored regex ([299c7f1](https://github.com/lucent-org/lucent-code/commit/299c7f14ea5c939ae13423a6674cf8453b980c5d))
* **skills:** use source.type as fallback label in load(), update getSummaries test ([4d30b39](https://github.com/lucent-org/lucent-code/commit/4d30b398f3340c7e6f4ff66da9033f02fd523dd6))
* **test:** update AdvancedFeaturesGrid test to match current card title ([14a6100](https://github.com/lucent-org/lucent-code/commit/14a610053d274ebf0c56bc2578d466a0be26890b))
* **tools:** address code quality issues in editor-tools ([a066a24](https://github.com/lucent-org/lucent-code/commit/a066a24077a049729af6ce10bfdb7cec4b856fc5))
* **tools:** autonomous mode bypass, session approval, useTrash on delete ([16a22d1](https://github.com/lucent-org/lucent-code/commit/16a22d1f217feafecc40fed5085a42fa8194b485))
* **tools:** break modelChanged→setModel echo loop — use receiveModelChange for AI-initiated switches ([5aa1186](https://github.com/lucent-org/lucent-code/commit/5aa118653ea5f59795972419cdb21d1acf4fb16e))
* **tools:** fix approval button class names, centralize ApprovalScope type, add scope tests ([fca452d](https://github.com/lucent-org/lucent-code/commit/fca452da7c7ee38d3931d7471a3d2171decf4673))
* **tools:** thread currentModel through webview for use_model approval card ([589a6cb](https://github.com/lucent-org/lucent-code/commit/589a6cb14b1a442ee455bb26c664f5225cdf302d))
* **tools:** validate model_id, improve use_model robustness and card types ([a0e407b](https://github.com/lucent-org/lucent-code/commit/a0e407bbce161f5201948d14dd586d9c0f494179))


### Documentation

* add all 6 developer reference pages ([872a9c7](https://github.com/lucent-org/lucent-code/commit/872a9c71ee6f7207b8cfcd861d37f856eed98ccf))
* add all 7 user guide pages ([86bddd5](https://github.com/lucent-org/lucent-code/commit/86bddd5784d1e5541f1a5634a90e2bb31060497a))
* add Cloudflare deployment notes and verify final build ([b7f64db](https://github.com/lucent-org/lucent-code/commit/b7f64db2fd9ae09a8f9570733d70729c84ca34e3))
* add credits awareness design ([0eae410](https://github.com/lucent-org/lucent-code/commit/0eae410ec59b9dd5830abc64f0fb4f94d3596a62))
* add credits awareness implementation plan ([6be04dc](https://github.com/lucent-org/lucent-code/commit/6be04dc0edae56f81fbd01c4db08c5134a21377b))
* add Lucent Code docs site implementation plan ([3031593](https://github.com/lucent-org/lucent-code/commit/3031593bf6bd29b4a80f03e9b5ff5c08c2bd3be6))
* add Lucent Code documentation site design ([c1993ce](https://github.com/lucent-org/lucent-code/commit/c1993ce089671d71c18d1d1180eb4f5f02a4b690))
* add LUCENT.md, built-in skills & model switching design ([8ca3d06](https://github.com/lucent-org/lucent-code/commit/8ca3d06e225b1721659bb1f3fe7ae34c2aa4c08c))
* add LUCENT.md, built-in skills, use_model, [@model](https://github.com/model) to feature inventory and marketing site ([e772a27](https://github.com/lucent-org/lucent-code/commit/e772a271a49b967fce0489626712015dda300f94))
* add LUCENT.md, skills & model switching implementation plan ([ee29d23](https://github.com/lucent-org/lucent-code/commit/ee29d23a532426ca2eb52b36dd4a9effc17e6112))
* add missing tools + scoped approval design ([12af90b](https://github.com/lucent-org/lucent-code/commit/12af90b2afa29f45d22ee4af0a03c26b6a6fab62))
* add missing tools implementation plan ([399172f](https://github.com/lucent-org/lucent-code/commit/399172f49b626bec28370a5daf677ef003851158))
* design doc for slash commands, /compact, and [@file](https://github.com/file) mention ([d7bbad4](https://github.com/lucent-org/lucent-code/commit/d7bbad4de528b11611952f5514d1443aa20f1873))
* implementation plan for slash commands and [@file](https://github.com/file) mention ([ebb16d2](https://github.com/lucent-org/lucent-code/commit/ebb16d2b490978802dd979159f08b85e1e1fa3aa))

## [0.2.8](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.7...lucent-code-v0.2.8) (2026-03-22)


### Bug Fixes

* remove duplicate API key notification on startup ([eb10d83](https://github.com/lucent-org/lucent-code/commit/eb10d83a9473171f80a806199e3d801479ec898f))
* remove duplicate API key notification on startup ([14689c8](https://github.com/lucent-org/lucent-code/commit/14689c8ef1503451e07398603ae805f1643de225))

## [0.2.7](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.6...lucent-code-v0.2.7) (2026-03-22)


### Bug Fixes

* address code review findings ([875aa71](https://github.com/lucent-org/lucent-code/commit/875aa71fe3a5483593ed49357e14877b0268cd74))
* **auth:** OAuth callback URI and review hardening ([a1e5f8b](https://github.com/lucent-org/lucent-code/commit/a1e5f8b8297ac6da5a48183372b6bb3f0298f1a4))
* **auth:** use correct publisher.extensionId in OAuth callback URI ([5ec8b19](https://github.com/lucent-org/lucent-code/commit/5ec8b199e0a12fb51606dd01d1c304769ac21bed))

## [0.2.6](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.5...lucent-code-v0.2.6) (2026-03-22)


### Bug Fixes

* **auth:** register URI handler for OAuth callback ([80db915](https://github.com/lucent-org/lucent-code/commit/80db915d9559345596705e9e056f5d8c3c438736))
* guard all activate() awaits to prevent activation failure ([60dce9c](https://github.com/lucent-org/lucent-code/commit/60dce9cb5248954fcc6c167e64e1965f6a129e2b))
* register OAuth handler and guard activation awaits ([b5d2e0e](https://github.com/lucent-org/lucent-code/commit/b5d2e0e2846844c5d3e2e3ff665ab5507ff4bb80))

## [0.2.5](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.4...lucent-code-v0.2.5) (2026-03-21)


### Bug Fixes

* guard proposed APIs to prevent blank webview panel ([f3aa678](https://github.com/lucent-org/lucent-code/commit/f3aa6781f5b5cd61505ec306a540cb9aa5b04e0e))
* guard proposed APIs to prevent extension activation failure ([45d76ae](https://github.com/lucent-org/lucent-code/commit/45d76ae843507ef14d7d71f150ce029234096623))

## [0.2.4](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.3...lucent-code-v0.2.4) (2026-03-21)


### Bug Fixes

* lazy-load better-sqlite3 to prevent blank webview panel ([ed8ed0f](https://github.com/lucent-org/lucent-code/commit/ed8ed0f039fdcbfbcb1fb2712681ebc5dac72b4a))
* lazy-load better-sqlite3 to prevent blank webview panel ([9b9928f](https://github.com/lucent-org/lucent-code/commit/9b9928f807d2b0260808b4ce18334aa457fd381c))

## [0.2.3](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.2...lucent-code-v0.2.3) (2026-03-21)


### Documentation

* add regression test report and screenshots for webview (2026-03-21) ([70d5f6d](https://github.com/lucent-org/lucent-code/commit/70d5f6d0f1b48006803dc4a0a3ed10f69322d68c))
* webview regression test report — 2026-03-21 ([b2e40ff](https://github.com/lucent-org/lucent-code/commit/b2e40ff5061263ae8935d88ace6880db1af58807))

## [0.2.2](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.1...lucent-code-v0.2.2) (2026-03-21)


### Bug Fixes

* move chat panel to secondary sidebar ([ee65e04](https://github.com/lucent-org/lucent-code/commit/ee65e049bd17b6534005b06e074ff069f2873f4a))
* move chat panel to secondarySidebar to dock with other chat extensions ([7890c3a](https://github.com/lucent-org/lucent-code/commit/7890c3a4be5576bfd43267b4e206bc44f6340a23))

## [0.2.1](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.2.0...lucent-code-v0.2.1) (2026-03-21)


### Bug Fixes

* **ci:** remove npm cache config that requires missing lock file ([28de64e](https://github.com/lucent-org/lucent-code/commit/28de64e12885a49e709800ada707dc6dc980c243))
* **ci:** remove platform-specific package-lock.json, use npm install in CI ([6b651b2](https://github.com/lucent-org/lucent-code/commit/6b651b2b3845a3cc27026b1f72041d3bd19fad0c))

## [0.2.0](https://github.com/lucent-org/lucent-code/compare/lucent-code-v0.1.0...lucent-code-v0.2.0) (2026-03-21)


### Features

* abort in-flight requests on extension deactivate ([dd83aaa](https://github.com/lucent-org/lucent-code/commit/dd83aaafc3eb0c963c86860200f9c5d1258e10fc))
* add _autonomousMode to MessageHandler with MCP and editor tool gate bypass ([a389a95](https://github.com/lucent-org/lucent-code/commit/a389a9577ac4075bcb2f3b7097777e52769f6c71))
* add [@fix](https://github.com/fix), [@explain](https://github.com/explain), [@test](https://github.com/test) action mentions with group separator ([18d8d88](https://github.com/lucent-org/lucent-code/commit/18d8d8857241d0d5cba8e0366d9dd771bb6704c4))
* add [@mentions](https://github.com/mentions) UI with [@terminal](https://github.com/terminal) support to chat input ([24325c2](https://github.com/lucent-org/lucent-code/commit/24325c2095792fbf07b3ebb7b7d27c50eb074d02))
* add &gt;_ terminal button and terminal chip JSX ([efe5786](https://github.com/lucent-org/lucent-code/commit/efe5786639eed169abbfc84baaaf321ea515c3a5))
* add applyToFile/showDiff/confirmApply message types and diff dependency ([422d3d9](https://github.com/lucent-org/lucent-code/commit/422d3d918798c800a60eb7c5decb07e48abacb62))
* add attachment state and FileReader processing in ChatInput ([a5875ce](https://github.com/lucent-org/lucent-code/commit/a5875ce075e25967d616ec043d6deed5770ec1d0))
* add auth status bar item and signOut/authMenu commands ([37860e4](https://github.com/lucent-org/lucent-code/commit/37860e4e2cb47bce06eac4589cdf34abefe4afc7))
* add AuthManager with SecretStorage-backed API key management ([7ea70c7](https://github.com/lucent-org/lucent-code/commit/7ea70c75db7128f3d0312becd8e9604b00575ebc))
* add autonomous mode toolbar button and message handler in webview ([279179c](https://github.com/lucent-org/lucent-code/commit/279179cbbc715cb865b88e2fa2af16b7ca0240b4))
* add autonomousMode getter to Settings ([62057ca](https://github.com/lucent-org/lucent-code/commit/62057ca1a37bfa4bccc53d2582a546b054947634))
* add autonomousMode signal to chatStore ([a40876f](https://github.com/lucent-org/lucent-code/commit/a40876fdcfe2f0876176f2caa0e94ed6b2e71f1a))
* add autonomousMode VS Code setting and autonomousModeChanged message type ([281f3ac](https://github.com/lucent-org/lucent-code/commit/281f3ac6433edada5a1d7fe7248dd9a77677e932))
* add CapabilityDetector that probes and formats editor capabilities for the LLM ([cca41f3](https://github.com/lucent-org/lucent-code/commit/cca41f3f52f6d02b03a1438c6df867c89a340912))
* add chat UI components — ChatMessage, ChatInput, ModelSelector, CodeBlock ([d73727e](https://github.com/lucent-org/lucent-code/commit/d73727eb8ce46c0af0725c390d61279796e6b58d))
* add ChatViewProvider with CSP-secured webview ([dd05272](https://github.com/lucent-org/lucent-code/commit/dd0527214f1216a5b1fbff1e5a3eb773cf1008f4))
* add CodeIntelligence with hover, definition, references, diagnostics, symbols, and caching ([77c8d34](https://github.com/lucent-org/lucent-code/commit/77c8d340f7576e3cfd544a462c43b81bbd095549))
* add completion prompt builder with windowed context ([a756fbd](https://github.com/lucent-org/lucent-code/commit/a756fbdc9e63199ad67484a71eb1510a1584e15c))
* add ContentPart type and messageText helper ([ac8dd0a](https://github.com/lucent-org/lucent-code/commit/ac8dd0a88f8b90f05980ab83feb4053d0f0b641f))
* add ContextBuilder for active file, selection, and open editors ([1f645db](https://github.com/lucent-org/lucent-code/commit/1f645dbe689a3746c191cb460d530e693f1c3ed3))
* add conversation and persistence types to message protocol ([b272bbd](https://github.com/lucent-org/lucent-code/commit/b272bbd6d6a93606917bdda317fec1d42dc52653))
* add conversation list UI with load, delete, and export actions ([80ab9d7](https://github.com/lucent-org/lucent-code/commit/80ab9d792092377e47eb92b4f052a13badbac083))
* add ConversationHistory with save, load, list, delete, and export ([a99d818](https://github.com/lucent-org/lucent-code/commit/a99d81897b42824540875aea3f83afb2db268137))
* add CSS for skill chip variant ([87065f1](https://github.com/lucent-org/lucent-code/commit/87065f1454b7f0834ebb8a155b501f883f358d0c))
* add DiffView component and showDiff handler for inline diff preview ([a09053f](https://github.com/lucent-org/lucent-code/commit/a09053f9c34e1d66aa0a01f3b63c58578edc1854))
* add EditorToolExecutor with rename, code action, format, insert, and replace tools ([0d90160](https://github.com/lucent-org/lucent-code/commit/0d90160b4954edb93cc6b8e0b33bc7ed4252b6ba))
* add extension icon ([064060a](https://github.com/lucent-org/lucent-code/commit/064060a91b6255ab759fa6c57f1946fdf8af1a92))
* add generate-icon script and rasterise new icon to PNG ([adc3ecf](https://github.com/lucent-org/lucent-code/commit/adc3ecf54e5dfb7d042d791dd496d74c32717fa8))
* add generateCommitMessage command to package.json ([9abc830](https://github.com/lucent-org/lucent-code/commit/9abc830372a0813a7bca3287c16293f0a907d803))
* add GitHub skill source fetcher ([cb8341b](https://github.com/lucent-org/lucent-code/commit/cb8341bbb55050a9d98a9da025dba87494216748))
* add HITL inline approval for destructive LLM tool calls ([576bf2c](https://github.com/lucent-org/lucent-code/commit/576bf2c9604e11b54239a73d93a958f5086375bd))
* add images to webview chat store and sendMessage protocol ([a4e6479](https://github.com/lucent-org/lucent-code/commit/a4e647904b6c466d8ad6519a594cbb767fb7a610))
* add importConversation command to extension ([9aef581](https://github.com/lucent-org/lucent-code/commit/9aef58175149d57548c11f830fa33b7fa420aefa))
* add importFromJson to ConversationHistory ([107ef8d](https://github.com/lucent-org/lucent-code/commit/107ef8d720991cf0ef45ea91163ee1b17cfdd83c))
* add inline completion settings (model, triggerMode, debounce, maxContextLines) ([b37aeda](https://github.com/lucent-org/lucent-code/commit/b37aeda33e2ebb0921e9e25c4e1b881195be8b19))
* add InlineCompletionProvider with debounce, status bar, and model selection ([8ff1caa](https://github.com/lucent-org/lucent-code/commit/8ff1caace21970c8a3643faf37aac279b630a7e7))
* add InstructionsLoader for project-level instructions files ([304b2e3](https://github.com/lucent-org/lucent-code/commit/304b2e3acec2a6af3418dbdd04a37a07187de10c))
* add isAuthenticated and signOut (with server-side revocation) to AuthManager ([f4a77ce](https://github.com/lucent-org/lucent-code/commit/f4a77ce58944060683e478a33d7ba366d7b9572e))
* add keyboard shortcuts for new chat (Ctrl+Shift+N) and focus chat (Ctrl+Shift+L) ([d0d5ea0](https://github.com/lucent-org/lucent-code/commit/d0d5ea0ca532912a6ffc6709d6dbeb03ac36a561))
* add Lucent Code icon (glow on dark background) ([638f768](https://github.com/lucent-org/lucent-code/commit/638f7689c424a6121e87fc5477d005fee28f82e5))
* add MCP config loader (three-tier merge) ([e8c3b76](https://github.com/lucent-org/lucent-code/commit/e8c3b765a166ae1aaa699093a176a96ea5c028f2))
* add McpClientManager (connect, tools, callTool, dispose) ([067aa4e](https://github.com/lucent-org/lucent-code/commit/067aa4e81ec635cae27cc1c189f94ae175f62b91))
* add MessageHandler for webview ↔ extension communication ([dd7459d](https://github.com/lucent-org/lucent-code/commit/dd7459d2e6616417068b039f7ec422262cf5a18a))
* add NotificationService with contextual error messages and recovery actions ([a604eb4](https://github.com/lucent-org/lucent-code/commit/a604eb4f47137ddaf8ad0a55c4c89b9c5e228acb))
* add npm/unpkg skill source fetcher ([9978836](https://github.com/lucent-org/lucent-code/commit/9978836b6d13b39b3b68ecdd39eb0a95784fc0e4))
* add OAuth PKCE flow structure to AuthManager ([fc77f4c](https://github.com/lucent-org/lucent-code/commit/fc77f4cd848b0ef54fff2a7928f1fabdabd862e3))
* add onStreamEnd callback to MessageHandler for completion notification ([24a99a4](https://github.com/lucent-org/lucent-code/commit/24a99a4874bec3f19796f66764fcff6dbec6f457))
* add OpenRouterClient with model listing and streaming chat ([e00faf7](https://github.com/lucent-org/lucent-code/commit/e00faf7828a8b39ec229e0e40d2b87329567b5bb))
* add readOnly prop to DiffView to hide Apply/Discard buttons ([e54aa32](https://github.com/lucent-org/lucent-code/commit/e54aa32db94d154e98dbe87456d7beb43cbc22d1))
* add recentConversationIds signal to chat store ([3d44b63](https://github.com/lucent-org/lucent-code/commit/3d44b63cdbe5b720e6349047e97d038487db5a6d))
* add search_files and grep_files as LSP fallback tools ([6274031](https://github.com/lucent-org/lucent-code/commit/6274031c6235277d8f3e21b5aadc5cabba30942a))
* add search_web, fetch_url, http_request LLM tools ([377b4df](https://github.com/lucent-org/lucent-code/commit/377b4df1b59d29acf14fd53548f72f80abd76960))
* add SessionStrip component with tab/dropdown responsive layout ([245d143](https://github.com/lucent-org/lucent-code/commit/245d143a5421acf1dffaab475dcaad139e1285b3))
* add SessionStrip CSS for tabs and dropdown ([c8aa9f2](https://github.com/lucent-org/lucent-code/commit/c8aa9f2bd47ecee6ff44da79178315ee03315aa2))
* add Settings module with typed config accessors ([5391104](https://github.com/lucent-org/lucent-code/commit/53911047b5ecc9abfefaeb32f7a9084607992a77))
* add shared types for API, message protocol, and code context ([c26ada3](https://github.com/lucent-org/lucent-code/commit/c26ada379a1230c15d11c36fe432f7ed317b9227))
* add skill frontmatter parser ([a5553df](https://github.com/lucent-org/lucent-code/commit/a5553df6f3fbc2f7f70dc90e503993a910f98d43))
* add SkillRegistry with Claude Code cache + local source loading ([f055592](https://github.com/lucent-org/lucent-code/commit/f0555927904ec0daf1d1344ee66a49040b4abbb5))
* add skills.sources setting and three skill commands to package.json ([6b0f834](https://github.com/lucent-org/lucent-code/commit/6b0f83481880654e9a757eafcf69d6a0efbf5fe6))
* add SkillSummary and skill message types to protocol ([beaa328](https://github.com/lucent-org/lucent-code/commit/beaa3281935180b7fa526753af13038fe2864cb4))
* add slash autocomplete and skill chips to ChatInput ([22c21f0](https://github.com/lucent-org/lucent-code/commit/22c21f0de4a882c571d522498059083257c05058))
* add superpowers marketplace skill source fetcher ([c7d08d8](https://github.com/lucent-org/lucent-code/commit/c7d08d898d22c4be65bb799de71ce029c7a24e1e))
* add Tavily premium web search with DuckDuckGo fallback ([49af82b](https://github.com/lucent-org/lucent-code/commit/49af82b08f8fdaca2cb4daed64aee5f36911dd19))
* add TerminalBuffer service — buffers last 200 lines per terminal ([a2e83b8](https://github.com/lucent-org/lucent-code/commit/a2e83b8c00f1bfb84e1bdde9b286c1a9dcb51020))
* add terminalContent signal and handleTerminalButton logic ([9f86d1b](https://github.com/lucent-org/lucent-code/commit/9f86d1b0b976a922a7346475cb531819ebf62ad1))
* add TF-IDF keyword SkillMatcher ([f44a2bb](https://github.com/lucent-org/lucent-code/commit/f44a2bb36d384885f1041a795e1dea89e2b5e0a8))
* add toolApprovalRequest/Response message types ([956490a](https://github.com/lucent-org/lucent-code/commit/956490abeaa7c017fb739ca1aee6d96ff857391c))
* add toolbar wordmark to webview ([7162f98](https://github.com/lucent-org/lucent-code/commit/7162f98ec9bb77ed51c054030157ed51488a69de))
* add ToolCallCard component for inline tool approval ([a6a8bd0](https://github.com/lucent-org/lucent-code/commit/a6a8bd0a67e45236e03451233d61900b2458ce0a))
* add TriggerConfig with debounce, manual trigger, and cancellation ([257ddbc](https://github.com/lucent-org/lucent-code/commit/257ddbc8eff5265a01e6f73f53606a69ab1c497f))
* add webview stores (chat, settings) and utility modules ([fd2d64e](https://github.com/lucent-org/lucent-code/commit/fd2d64ea40fa801344b9a153229bb62cfe9d724f))
* add withRetry exponential backoff for 429/5xx errors ([3efde56](https://github.com/lucent-org/lucent-code/commit/3efde5680495cdcb51f6d30109bac39a2f3605c9))
* add worktree types to shared types ([73688eb](https://github.com/lucent-org/lucent-code/commit/73688eb57632bc351cd2da7e43a81124ada838a7))
* add WorktreeManager finishSession() with merge/PR/discard quick-pick ([1333409](https://github.com/lucent-org/lucent-code/commit/13334098b9e171c8bffc83a930e1b3b08d0ed715))
* add WorktreeManager with create() and remapUri() ([b81a5be](https://github.com/lucent-org/lucent-code/commit/b81a5be2a49f8766f7617fa8466e59dc6ff77604))
* add worktreeStatus signal and toolbar badge to webview ([28c66db](https://github.com/lucent-org/lucent-code/commit/28c66dbf86aff428197ed0eaba277617f72050b8))
* **app:** replace ModelSelector+SessionStrip with ChatTabs in toolbar ([c1a8b03](https://github.com/lucent-org/lucent-code/commit/c1a8b03429794d179654101f733b3c4354aaf328))
* branded empty state with slash logo and tagline ([862bba5](https://github.com/lucent-org/lucent-code/commit/862bba535d929a36e034ae1d039939da1e6d415b))
* compose ContentPart[] in MessageHandler when images attached ([5432b9e](https://github.com/lucent-org/lucent-code/commit/5432b9eda4fa423216f46ce9379f4984b9e8eea4))
* **design:** add design system for Lucent Code marketing site ([0df21f3](https://github.com/lucent-org/lucent-code/commit/0df21f335354abfe7a2d498466a94a3fc0cd4eae))
* drag-and-drop, file picker, and attachment chips in ChatInput ([16fea18](https://github.com/lucent-org/lucent-code/commit/16fea181adb4be8acf1c591adfd1c290c54382d3))
* extend ContextBuilder with LSP enrichment and capability detection ([3a130ea](https://github.com/lucent-org/lucent-code/commit/3a130ea423bfe7896db237a6458b0a9dca3d161b))
* icon v2 — explicit { } brackets with compact 8-node neural net ([d84e786](https://github.com/lucent-org/lucent-code/commit/d84e786b39d5ced62cf961084250f4ab86e6123e))
* icon v3 — rounder brackets, 16 nodes, outside nodes ([13023c7](https://github.com/lucent-org/lucent-code/commit/13023c70becaf9e7d9914222724dcb8325a5499d))
* image thumbnails in chat history and docs update ([247f224](https://github.com/lucent-org/lucent-code/commit/247f224dc4d6266bebd4701dc51d70e4b94baaa0))
* implement applyToFile handler with hunk counting and dual diff paths ([99c2aa7](https://github.com/lucent-org/lucent-code/commit/99c2aa74ce604c73b0b31e98e8baecfe565778d2))
* implement computeToolDiff in MessageHandler (Task 2) ([89958d7](https://github.com/lucent-org/lucent-code/commit/89958d76c7b63f7fdb265e22a74136dc859b5baf))
* implement generateCommitMessage command with Git API + LLM ([9cd6d3b](https://github.com/lucent-org/lucent-code/commit/9cd6d3bc10e49f9b6ba388fbb60d784e9ae15a4c))
* inject available code actions at cursor into system prompt context ([c1c8f78](https://github.com/lucent-org/lucent-code/commit/c1c8f78fe4e1ea3c2cee611f6124423226b425d4))
* inject custom instructions into system prompt from .openrouter-instructions.md or .cursorrules ([d348891](https://github.com/lucent-org/lucent-code/commit/d3488916e26ab7b22c3347cfb16988b69db91339))
* integrate conversation history into MessageHandler with auto-titling ([ef03edd](https://github.com/lucent-org/lucent-code/commit/ef03edd66e6f49d4e54f93f343df5dee5be08137))
* integrate enriched context and tool-use types into MessageHandler ([ea53f68](https://github.com/lucent-org/lucent-code/commit/ea53f688a0e0a920bfe4ba7dfcf5e7059d585f8c))
* integrate SkillRegistry and SkillMatcher into MessageHandler with use_skill tool ([b3e0b19](https://github.com/lucent-org/lucent-code/commit/b3e0b195a40818aff309d1871f62c00941afb15e))
* **marketing:** add AdvancedFeaturesGrid, CtaBanner, and Footer sections ([ceb82a5](https://github.com/lucent-org/lucent-code/commit/ceb82a5192d5bd14376c0513cd187044aca8fc72))
* **marketing:** add Button, Badge, Eyebrow, GradientText components ([851cfd6](https://github.com/lucent-org/lucent-code/commit/851cfd6fdc88604d9883b83433d9b3ca9cf11577))
* **marketing:** add CSS design tokens and base styles ([5e01b54](https://github.com/lucent-org/lucent-code/commit/5e01b548f1d53d4f98fa28ee8d7bcc980f2e8456))
* **marketing:** add DemoSection with code showcase and step callouts ([685fe7e](https://github.com/lucent-org/lucent-code/commit/685fe7eee8d1a1f40434db507fc88eddb239189a))
* **marketing:** add FeatureCard component and CoreFeaturesGrid section ([ba259fc](https://github.com/lucent-org/lucent-code/commit/ba259fc06a86efcaa309c275cb71674fab5bff4d))
* **marketing:** add HeroSection with gradient headline and CTA ([8b94abf](https://github.com/lucent-org/lucent-code/commit/8b94abf1011824ddd8c628dcb45bf276484e3c44))
* **marketing:** add NavBar component with scroll state and mobile menu ([67de07e](https://github.com/lucent-org/lucent-code/commit/67de07e288b1788cc7da10c5466e450c35c23fc9))
* **marketing:** add SocialProofStrip model logos section ([05cfb47](https://github.com/lucent-org/lucent-code/commit/05cfb47d21aafa6457f898d78297f55a41db00dc))
* **marketing:** assemble full single-page marketing site ([72b29f9](https://github.com/lucent-org/lucent-code/commit/72b29f90dc23f1484771adbf040ca0852fb15149))
* **marketing:** replace placeholder text with real webview screenshots ([d9403d6](https://github.com/lucent-org/lucent-code/commit/d9403d66cf9e66c15cc7cf5a8782418dadba11f6))
* **marketing:** scaffold SolidJS marketing site ([ad4e3bf](https://github.com/lucent-org/lucent-code/commit/ad4e3bf881a51c4dd637fdb132dec09e79658db8))
* merge MCP tools into chat and route mcp__ tool calls ([8d2b49a](https://github.com/lucent-org/lucent-code/commit/8d2b49a2255243ff5ba486332e353c40fe575ec2))
* mount SessionStrip in App and fetch conversations on ready ([59f6793](https://github.com/lucent-org/lucent-code/commit/59f6793181edc084fbc8009089b2198c46bfe846))
* parse filename from code fence and add Apply to file button ([3fd7065](https://github.com/lucent-org/lucent-code/commit/3fd70657fefbeb74c1e7d27843f4475672369e67))
* pass diff through chat store to ToolCallCard ([75218f5](https://github.com/lucent-org/lucent-code/commit/75218f5aeaf90f302bb049f9af5be8aefcfebc6b))
* push initial autonomousModeChanged to webview on activation ([aaa7c1c](https://github.com/lucent-org/lucent-code/commit/aaa7c1c938c450eb4d4581aeb8aa175510416504))
* register context menu commands for Explain/Fix/Improve ([25cd757](https://github.com/lucent-org/lucent-code/commit/25cd757d52ed1bc9daa981862d16e95b283751ff))
* register InlineCompletionProvider and manual trigger command ([b44c1ea](https://github.com/lucent-org/lucent-code/commit/b44c1ea87498473b6b6e42a955ba7223d181eadc))
* register startWorktree command and wire WorktreeManager in extension.ts ([ac3f5e2](https://github.com/lucent-org/lucent-code/commit/ac3f5e25644fabe746014d120858616703ad5196))
* render DiffView in ToolCallCard when diff is present ([a50599c](https://github.com/lucent-org/lucent-code/commit/a50599c1c8384b0181dac1922bb4d5f7505d8b71))
* render headings and lists in markdown output ([570c192](https://github.com/lucent-org/lucent-code/commit/570c19289a1f2d5cda119f6b47732b349003bcdd))
* replace icon with neural-net node cluster (bracket negative space) ([42a8d5f](https://github.com/lucent-org/lucent-code/commit/42a8d5f48c35c5bb78bc7cda7b94309051339ee6))
* replace logo with gradient slash beam mark ([3cc830d](https://github.com/lucent-org/lucent-code/commit/3cc830d19131580a99be2003e6683c707529d193))
* resolve action mentions synchronously in handleResolveMention ([953ed9a](https://github.com/lucent-org/lucent-code/commit/953ed9a1b0d5511f9f39304f2503ab3d82af3a96))
* respect editor.inlineSuggest.enabled kill switch in inline completion provider ([97f77ef](https://github.com/lucent-org/lucent-code/commit/97f77ef884022733531d0e7f36207f523b6ab7c7))
* **search:** add [@codebase](https://github.com/codebase) mention to chat input and intercept in message handler ([71f27f1](https://github.com/lucent-org/lucent-code/commit/71f27f104ccfd38adb337850470703a7533c762f))
* **search:** add file chunker with overlapping 40-line chunks ([cd94b75](https://github.com/lucent-org/lucent-code/commit/cd94b7573e0f0804e58f5babcdc2f446d33a55a6))
* **search:** add Indexer with OpenRouter embeddings, file watcher, and startup reconciliation ([fdc2a69](https://github.com/lucent-org/lucent-code/commit/fdc2a699b9c016d10423cad8ed484bb960692cd0))
* **search:** add semantic_search tool to editor tools ([0c6643a](https://github.com/lucent-org/lucent-code/commit/0c6643a80e2c564e76f195320b12f55d5819c3e3))
* **search:** add VectorStore with SQLite persistence and cosine similarity search ([6eaf3b0](https://github.com/lucent-org/lucent-code/commit/6eaf3b065df120b01a3ca92e334e7ff01a0aeb94))
* **search:** wire indexer into extension — status bar, command, tool, [@codebase](https://github.com/codebase) ([ab271bb](https://github.com/lucent-org/lucent-code/commit/ab271bb511360076fc303656dd6ddcb84e15fa95))
* show 'Response ready' notification when stream ends and panel is hidden ([e57e2c0](https://github.com/lucent-org/lucent-code/commit/e57e2c091efbe687ae95c0e13e07bf0b76f3ed26))
* **store:** add removeFromRecents action ([3ff84ab](https://github.com/lucent-org/lucent-code/commit/3ff84abf34bd63889f0a5aed3bdb49d6f87adeb4))
* terminal chip CSS + mark terminal button feature complete in features.md ([c30c646](https://github.com/lucent-org/lucent-code/commit/c30c64680b144d7a295581bb29d2965677cacb72))
* truncate tool outputs over 8000 chars and save full result to tmpfile ([b7a204d](https://github.com/lucent-org/lucent-code/commit/b7a204db6c8767c8c5d0adc953e3d11fc5d1acb9))
* **ui:** add ChatTabs component with close buttons ([e51d95d](https://github.com/lucent-org/lucent-code/commit/e51d95dc0238806962ed94476045d4edbb5b98c2))
* **ui:** move ModelSelector to chat input bottom-right with context fill % ([e637d5f](https://github.com/lucent-org/lucent-code/commit/e637d5faa756f9cba6b1441ef9297e0dd3cbbb6b))
* wire [@terminal](https://github.com/terminal) — message types, handler case, TerminalBuffer in activate ([58b29d4](https://github.com/lucent-org/lucent-code/commit/58b29d4d4327ef339c854a863339102a24430879))
* wire code intelligence, capability detection, and tool executor into extension ([161db2a](https://github.com/lucent-org/lucent-code/commit/161db2a961a4bbe4f5722e6dd5777439e32a6c28))
* wire context menu Explain/Fix/Improve commands to chat panel ([ddd5c0e](https://github.com/lucent-org/lucent-code/commit/ddd5c0e718757432d772b67d6c126a908746a494))
* wire ConversationHistory into extension using globalStorageUri ([1202048](https://github.com/lucent-org/lucent-code/commit/1202048b12b9cee36252795b179e57dbef3b73c4))
* wire extension entry point — connect auth, client, chat provider, and message handler ([433fc26](https://github.com/lucent-org/lucent-code/commit/433fc261df9ef22e988831665a938295a50cdf44))
* wire inline tool approval cards into webview chat flow ([1dcf80c](https://github.com/lucent-org/lucent-code/commit/1dcf80c3d8ded4438765b3261b0de8fa585bea54))
* wire McpClientManager into extension — connects on activation, reconnects on .mcp.json change ([516840c](https://github.com/lucent-org/lucent-code/commit/516840caa89c7b119ab7b4167a140f1aa4b93c20))
* wire skill list to webview — store, App.tsx, getSkillContent handler ([4f642cd](https://github.com/lucent-org/lucent-code/commit/4f642cdb0ebaa35d9fda6a29bbae3622545a8612))
* wire SkillRegistry in extension — init, commands, status bar, ready handler ([92a2374](https://github.com/lucent-org/lucent-code/commit/92a2374667d1104ef468dda6661900a539a037e0))
* wire tool-use agentic loop with single-depth tool execution ([7004f85](https://github.com/lucent-org/lucent-code/commit/7004f853c582c28d730a2afbc7cba70fa284b174))
* wire WorktreeManager into MessageHandler with URI remapping and start_worktree tool ([425115f](https://github.com/lucent-org/lucent-code/commit/425115f6b742a15814a1e6b675b211f9fffcd673))


### Bug Fixes

* add diff-view CSS styles; unify DiffLine type via import in chat store ([f9a4992](https://github.com/lucent-org/lucent-code/commit/f9a49927e7f5e3db55481c3a060ab28eee6670bc))
* add empty state guidance and API key hint in chat panel ([674b15f](https://github.com/lucent-org/lucent-code/commit/674b15f9ca5e66547d79405fe860ba1e1b03ee44))
* add response.ok guard to httpRequest tool ([2fe8fb1](https://github.com/lucent-org/lucent-code/commit/2fe8fb1742925d2508e5ce46e458fe10af56c591))
* add SVG favicon to marketing site ([480581a](https://github.com/lucent-org/lucent-code/commit/480581ae1410514c72df4c993e1c70e30f20e21b))
* adjust logo position in chat bubble ([c4a28e5](https://github.com/lucent-org/lucent-code/commit/c4a28e521144edafefe2f58f19ca8f435ba924f2))
* align autonomous-button sizing with toolbar convention; simulate listConversations in dev mock ([6577368](https://github.com/lucent-org/lucent-code/commit/65773685720b6d9ecf09a9e600849482979e96ef))
* aria-hidden on decorative toolbar SVG mark ([17c2870](https://github.com/lucent-org/lucent-code/commit/17c2870812bb2118f3097a279c0773e4a70fc0ee))
* cancel in-flight stream on triggerSend; clear pendingApply on ready; status feedback for native diff ([70c47ee](https://github.com/lucent-org/lucent-code/commit/70c47ee6147d4e9d57a79012cdb73187fd16a986))
* cap LSP cache at 100 entries with LRU eviction ([decf680](https://github.com/lucent-org/lucent-code/commit/decf6806b5d8692c9183182c02ee674050c3010c))
* **ci:** align wrangler name with Cloudflare worker name ([d2ea9f6](https://github.com/lucent-org/lucent-code/commit/d2ea9f61d52cad15b93d8b75ae9bc8d18069f3b4))
* **ci:** commit marketing/package-lock.json for Cloudflare Pages npm ci ([38a85f3](https://github.com/lucent-org/lucent-code/commit/38a85f333fe2df8a6d9abe6ba58e99ed46d6eb91))
* clarify applyEdit range end-point; strengthen picker-cancel test assertion ([d2fe7ff](https://github.com/lucent-org/lucent-code/commit/d2fe7ff7e0bfafbd22f0da473dfded98933df3c3))
* clear timeout handle on connect, return tools copy ([8668b87](https://github.com/lucent-org/lucent-code/commit/8668b87924ebada7b59bfb6a3057e90d31c5e7ce))
* correct CSS filename from styles.css to index.css to match Vite build output ([b216c23](https://github.com/lucent-org/lucent-code/commit/b216c235e32b8fc1918325a53c5c205846508891))
* correct CSS filename reference from style.css to styles.css ([a51654d](https://github.com/lucent-org/lucent-code/commit/a51654d4cabafb00b2cd1186acda69091b4718de))
* differentiate dual lightning icons — autonomous mode ⊙, skills / ([df4d13a](https://github.com/lucent-org/lucent-code/commit/df4d13a84cf08789b895aec6c1a197413964ac1c))
* document guard change and add formatEnrichedPrompt test for codeActions ([5c6b5a2](https://github.com/lucent-org/lucent-code/commit/5c6b5a26da6615e9727433de823d01d1e751f7b5))
* error handling in generate-icon and exclude scripts from vsix ([6a1c014](https://github.com/lucent-org/lucent-code/commit/6a1c0145d347dd24699fefe68e04734f159bf726))
* expand worktree-badge CSS to include button reset styles ([cf6fd9d](https://github.com/lucent-org/lucent-code/commit/cf6fd9d0c117f189574921b50070a322d269173a))
* expose isVisible getter on ChatViewProvider to avoid private field access ([c5ec60d](https://github.com/lucent-org/lucent-code/commit/c5ec60d7a950d17f2dd198336011f7939c30e5b7))
* FileReader onerror, drop type filtering, send guard, aria-label ([c96708d](https://github.com/lucent-org/lucent-code/commit/c96708d749a853e71c9288ad21b17752e382c179))
* guard handleTerminalButton against double-click and reset terminalError on send ([8dfafb3](https://github.com/lucent-org/lucent-code/commit/8dfafb344f6164c8918eddef8445731d831258b2))
* handle dismissed quick-pick, type-safe action lookup, add pr test ([d599036](https://github.com/lucent-org/lucent-code/commit/d599036e3618cd142c094af1eeab7e33428786c3))
* handle null worktreeManager in start_worktree tool and log creation errors ([674a905](https://github.com/lucent-org/lucent-code/commit/674a90593fead7780f0c4bd25e1ef2f6687a8c1e))
* handle startWorktree message, call finishSession on new chat, reuse worktreeManager in command ([bc0fdb3](https://github.com/lucent-org/lucent-code/commit/bc0fdb3eadd62c676b91699f579a6dbdd08e54cd))
* handle tool-use iteration cap, malformed args, and redundant filter ([e97cf37](https://github.com/lucent-org/lucent-code/commit/e97cf37ef92280a0010d6d9bf2e4c7eb5002668a))
* high-res webview screenshots and themed scrollbars for marketing site ([83cb2cf](https://github.com/lucent-org/lucent-code/commit/83cb2cf7f91b5cc3d2fec4655d00c7bcc9f66d8b))
* idiomatic Show callback, terminalError dismiss button, Send enabled with terminal-only content ([6a409e9](https://github.com/lucent-org/lucent-code/commit/6a409e964a3f33898401372885b7f5cef3d11669))
* inject NotificationService instead of constructing per-error ([c8394fb](https://github.com/lucent-org/lucent-code/commit/c8394fbd16bfcb8a27c6b661005ef5cbbd5bf750))
* mark initial updateAuthStatus call as void to suppress floating promise ([b818be2](https://github.com/lucent-org/lucent-code/commit/b818be29f01f2ac60fb5cef53a21420e385cecfe))
* **marketing:** add 44px touch target to hamburger, remove dead display:block ([56e7e5b](https://github.com/lucent-org/lucent-code/commit/56e7e5b4d9562f927616402e5f4cc7fc2c651b8b))
* **marketing:** add missing --color-info token to design tokens ([820ab35](https://github.com/lucent-org/lucent-code/commit/820ab352eff9a6482278963c3da13bd9d86008f8))
* **marketing:** add vitest types reference and untrack lock file ([210b7e9](https://github.com/lucent-org/lucent-code/commit/210b7e90501bf22adcfb6dc99bbb113e689370d9))
* **marketing:** fix GitHub nav link URL and replace text with SVG icon ([041d239](https://github.com/lucent-org/lucent-code/commit/041d239b4a19d3e7b782ae4c2bb4044f888e8902))
* **marketing:** focus trap + escape in mobile menu, aria-disabled styles, 2-col tablet grid, card title 24px ([9295ec7](https://github.com/lucent-org/lucent-code/commit/9295ec71de2a86354aecaaf26a92df726b5257e2))
* **marketing:** replace hardcoded primary rgba with color-mix tokens, move advanced-features CSS to own file ([eccbd97](https://github.com/lucent-org/lucent-code/commit/eccbd97092370a3bb4995223c83f752354ad07ff))
* **marketing:** retake screenshots with improved readability styles ([2717edd](https://github.com/lucent-org/lucent-code/commit/2717edde4251fd38b42567d4ecba46b42ba687ed))
* **marketing:** update screenshots with new toolbar tabs and bottom model selector ([39fa0bf](https://github.com/lucent-org/lucent-code/commit/39fa0bf4194fa9f954c4577e2e89c84d081c7d21))
* **marketing:** use color-mix tokens for Button hover glows, fix disabled on anchor ([320ed2b](https://github.com/lucent-org/lucent-code/commit/320ed2bc5be0fa43571aacfc7277ccae0cf0ed61))
* mcp describe nesting, remove double Error prefix, add error path test ([122279b](https://github.com/lucent-org/lucent-code/commit/122279be18c873d3a0971aeb934dd77f6bed93c7))
* move MAX_RECENTS to module scope and use vscode constant in pushRecent ([6568285](https://github.com/lucent-org/lucent-code/commit/6568285fd3e213933abc5b3baa1719cafa8b96ce))
* move OpenRouter logo further up in chat bubble ([3cbeede](https://github.com/lucent-org/lucent-code/commit/3cbeede53c7c3270eca95d2e4e20bcb3c5b2f4ca))
* nudge OpenRouter logo up to center in chat bubble ([ff064c7](https://github.com/lucent-org/lucent-code/commit/ff064c7b347e2937e98e0221caa1ffde2161c7b5))
* null-coalesce body, fix test name, add CRLF and empty-body tests ([666ad70](https://github.com/lucent-org/lucent-code/commit/666ad702d321f5087cac013bf3a31b7a072dfe45))
* pass branch name in creating status and add worktreePath getter test ([708f47a](https://github.com/lucent-org/lucent-code/commit/708f47ac9a9111543843847435cfa3ee01d30a7f))
* pass error.message string to notifications.handleError in generateCommitMessage ([e94e34e](https://github.com/lucent-org/lucent-code/commit/e94e34ecf9d8a50681b1762000965a59280882b9))
* place OpenRouter logo inside a chat bubble icon ([c681827](https://github.com/lucent-org/lucent-code/commit/c681827fffc67b0e1f8822148f13832910c88a95))
* post mcpStatus after connect, guard reconnect against concurrent calls ([d8ff266](https://github.com/lucent-org/lucent-code/commit/d8ff26678cc582172d04fe2648e538c3e00e2631))
* preserve ContentPart[] content in importFromJson round-trip ([b96ff19](https://github.com/lucent-org/lucent-code/commit/b96ff194a5733c7908c27f450f6fda79fb8868b9))
* remove incorrect mockRestore in inlineSuggest kill switch test ([50fbb17](https://github.com/lucent-org/lucent-code/commit/50fbb1799c7d9929a40c050f92dc7ca07da14f00))
* rename attachment-chip-empty-terminal to BEM double-dash modifier ([ff7783e](https://github.com/lucent-org/lucent-code/commit/ff7783ec842ecb4026265678b5ebe3d2487b4df4))
* rename_symbol uses executeDocumentRenameProvider instead of opening dialog ([c1daeaf](https://github.com/lucent-org/lucent-code/commit/c1daeaf2219de2a8bf8abe09a27da876d592bf61))
* replace conflicting ctrl+shift+n keybinding with ctrl+shift+alt+n ([9d475d1](https://github.com/lucent-org/lucent-code/commit/9d475d1fe1f5ed8ec698ac9c5f9a715c54d1a638))
* replace monkey-patched resolveWebviewView with onResolve callback ([c68c30e](https://github.com/lucent-org/lucent-code/commit/c68c30e8f3d750f125face0a30022b321a9f722a))
* replace paperclip emoji with clean SVG attach icon ([58252a3](https://github.com/lucent-org/lucent-code/commit/58252a34d60b66ec628432c7ccefcffdd598641b))
* replace sync fs with fs.promises in ConversationHistory ([73b7768](https://github.com/lucent-org/lucent-code/commit/73b7768f490dc9c2796e636290e4ad0d16c0753e))
* reset streaming state before sendMessage in triggerSend handler ([0d78ac0](https://github.com/lucent-org/lucent-code/commit/0d78ac07ef2e3fc04bed10c616c993c10a429698))
* route mention type dynamically and disable textarea during async resolution ([331b565](https://github.com/lucent-org/lucent-code/commit/331b565e4029ca3f3f282d803dbfa283d55fcefa))
* safe lastError fallback and abort listener cleanup in withRetry ([6f52df5](https://github.com/lucent-org/lucent-code/commit/6f52df518a988415661554e1e97e773c82f29b6c))
* **search:** add upsertChunks/deleteFile tests and guard NaN cosine scores ([80d2825](https://github.com/lucent-org/lucent-code/commit/80d28252a1701eb1c2be24811144a8830b8a05b2))
* **search:** dispose file watcher on deactivation, resolve API key once per embed call ([9335eb6](https://github.com/lucent-org/lucent-code/commit/9335eb62e1dc9afe735d54313f37f76d089c60d5))
* **search:** handle undefined API key gracefully, add command category ([223c877](https://github.com/lucent-org/lucent-code/commit/223c877054d9b0dce8c73b02b2ace4467ed6c3c4))
* **search:** render [@codebase](https://github.com/codebase) in mention dropdown and reset isResolvingMention ([4d7d952](https://github.com/lucent-org/lucent-code/commit/4d7d952715058242d6ac48bfe0b0ab424ae11c2a))
* **search:** shouldIndex prefix bug, batch loadIntoMemory, scoped watcher, status bar UX ([c606890](https://github.com/lucent-org/lucent-code/commit/c60689097297ce30f1266e7ec960a0c34bf81c27))
* send button with skill-only content, browseSkills chip insert, duplicate regex, npm path filter, post skillsLoaded on refresh ([4866f03](https://github.com/lucent-org/lucent-code/commit/4866f030a23fcf744e73e76aa7e88f61b98f2675))
* shorten chat input placeholder to prevent wrapping at narrow widths ([22f5e57](https://github.com/lucent-org/lucent-code/commit/22f5e57d31fc242406a96f5e866615f1a1d73b69))
* skills button label /… to distinguish from keyboard trigger ([e3354c4](https://github.com/lucent-org/lucent-code/commit/e3354c4c540cc008b611ae2a577154d23e8629f0))
* type postMessageToWebview param and queue messages before panel resolves ([e7d8c86](https://github.com/lucent-org/lucent-code/commit/e7d8c86c535a3f9ceba7f5142da7d09be6d826ae))
* **ui:** align input bar — left group for actions, Send alone on right ([20ba809](https://github.com/lucent-org/lucent-code/commit/20ba8095954c7707e40239ec4b0e3c335da4212d))
* update chat input placeholder to say 'mentions' not 'context' ([9d22c66](https://github.com/lucent-org/lucent-code/commit/9d22c66633d56821aa1bf8f2800abfe98c7fec12))
* update component imports to use [@shared](https://github.com/shared) types directly; use type guard in handleConversationLoaded ([3cf7933](https://github.com/lucent-org/lucent-code/commit/3cf7933d5f589109c6a4ca54fedd1be53a6a756e))
* update icon with actual OpenRouter logo (dual-arrow routing motif) ([a657bf1](https://github.com/lucent-org/lucent-code/commit/a657bf1abb7f60ad8468bc78b5a486569e7696ae))
* upgrade vitest from 1.x to 2.x for Node 24 compatibility ([2179c3d](https://github.com/lucent-org/lucent-code/commit/2179c3d5356927b6a3e591898c627efa11f221a3))
* use buildEnrichedContext in ready handler so LSP context is sent on panel open ([7dd0dd3](https://github.com/lucent-org/lucent-code/commit/7dd0dd359c57491a64ba84a5c1999e99de9078ac))
* use createMemo for recentConversations in SessionStrip ([29dde12](https://github.com/lucent-org/lucent-code/commit/29dde1286bd0b6dfba28a37871afa8274968b8f2))
* use derived signal accessors in mention dropdown for correct Solid reactivity ([6a26810](https://github.com/lucent-org/lucent-code/commit/6a268101b5e90de7190a0b7a48baabbde79e7630))
* use em units for attach SVG so it scales with VS Code zoom ([72de888](https://github.com/lucent-org/lucent-code/commit/72de888ee77d85c7dde0207030988ae7e739c2c7))
* use mockFetch alias consistently in Tavily tests ([1e97f80](https://github.com/lucent-org/lucent-code/commit/1e97f80035c00c264f92bf67cc13fd857b26e83b))
* use named ContentPart import instead of inline dynamic import ([3f69fd3](https://github.com/lucent-org/lucent-code/commit/3f69fd3326ddb99f2bfd5e5623991c276f94e186))
* use path.join consistently in mcp-config-loader ([e6dc9da](https://github.com/lucent-org/lucent-code/commit/e6dc9da236d5414595d888945903d75939d1132d))
* **webview:** code block background fills full width, update screenshots ([a22759a](https://github.com/lucent-org/lucent-code/commit/a22759aabc3405a36150eab65f6d782148ec2c05))
* **webview:** improve conversation readability — role labels, message separation, padding, heading spacing ([a4a5be1](https://github.com/lucent-org/lucent-code/commit/a4a5be19831d64b579614372d9074b1fc353ae3f))
* **webview:** normalize message content spacing, update screenshots ([7f05d21](https://github.com/lucent-org/lucent-code/commit/7f05d2188956dec0a5b0c4f84810a9fbd9e88a04))
* **webview:** style scrollbars to match VS Code dark theme ([98b4b98](https://github.com/lucent-org/lucent-code/commit/98b4b989ea048d5876fc62fbade1c04141d1e039))


### Refactoring

* delete SessionStrip (replaced by ChatTabs in toolbar) ([e477a5d](https://github.com/lucent-org/lucent-code/commit/e477a5d5362ea71e25a9b399e0338e2778b627d9))
* move Attachment interface and MAX_FILE_SIZE to module scope ([7d7a314](https://github.com/lucent-org/lucent-code/commit/7d7a3149be76748b7c108b3c52138e8ba07a6c57))
* move chatProvider and postMcpStatus before watcher setup ([6127588](https://github.com/lucent-org/lucent-code/commit/6127588f0d60d5b0110fa51b89d9047924e8d825))
* move postMcpStatus after mcpClientManager declaration ([ca9062b](https://github.com/lucent-org/lucent-code/commit/ca9062ba471c4a8b2d4e04f822f896d0db17bad0))
* normalize command category field for all package.json commands ([a3de9e5](https://github.com/lucent-org/lucent-code/commit/a3de9e50fde885d4d0b9b79e336319952a906362))
* remove non-null assertions in activate by closing over local handler ref ([fb64129](https://github.com/lucent-org/lucent-code/commit/fb64129e125d9e75318a3bca54af10043909b596))
* replace imperative scrollToBottom calls with reactive createEffect ([3f2b4f7](https://github.com/lucent-org/lucent-code/commit/3f2b4f79dadad9f75fee4345cf62cd9ef38edb55))
* unify ConversationSummary and Model types via [@shared](https://github.com/shared) alias ([be22b30](https://github.com/lucent-org/lucent-code/commit/be22b3003f11c29a55a708121b41b82e3f699be4))
* use InstructionsProvider interface in ContextBuilder; add system prompt integration test ([3a2179f](https://github.com/lucent-org/lucent-code/commit/3a2179f2fc5e1c0fd2894519f813f9afce84c693))


### Documentation

* action mentions design ([@fix](https://github.com/fix), [@explain](https://github.com/explain), [@test](https://github.com/test)) ([1516905](https://github.com/lucent-org/lucent-code/commit/1516905cba7105584d7581a19a5534997882477c))
* action mentions implementation plan (3 tasks) ([230c669](https://github.com/lucent-org/lucent-code/commit/230c66931a43d23e6830c27e11ed68b24eedeba9))
* add autonomous mode design doc ([ea6e7f7](https://github.com/lucent-org/lucent-code/commit/ea6e7f7c1044367b1fc3162b87f76b0b2d5acb51))
* add autonomous mode plan and regression reports ([8820835](https://github.com/lucent-org/lucent-code/commit/88208359fd82af9b2a5d5b032b28d9992d4c3f86))
* add CHANGELOG and marketplace metadata ([3ad8824](https://github.com/lucent-org/lucent-code/commit/3ad8824803c5bb4bab15f3d0a502408f9220af49))
* add code review findings to features.md backlog ([f9b15fb](https://github.com/lucent-org/lucent-code/commit/f9b15fb315165f1895c47ba4197918b1674823cf))
* add comprehensive README with setup, config, architecture, and testing ([c7fd568](https://github.com/lucent-org/lucent-code/commit/c7fd56814193eb93a097aa5db500e8c7e99614ed))
* add design doc for 7 important backlog fixes ([7039431](https://github.com/lucent-org/lucent-code/commit/703943177b5c49908063e1e6ed6627cdf7a8c6b4))
* add design doc for P1 editor integration features ([a75972f](https://github.com/lucent-org/lucent-code/commit/a75972f40757e36b4525239a09c57f15acc3833f))
* add design doc for P1 quick-wins (enriched ready, kill switch, retry, deactivate) ([fa7b700](https://github.com/lucent-org/lucent-code/commit/fa7b7008809c553966cc59fa354e314c9ec2515d))
* add design doc for P2 XS items (completion notification, idiomatic scroll) ([7393036](https://github.com/lucent-org/lucent-code/commit/7393036fd8a30da5e309048e588d442218b6dbdd))
* add design doc for v1 features (import conversations, type unification, OAuth management) ([6e91075](https://github.com/lucent-org/lucent-code/commit/6e91075a2e82fe2e16f31b9e0d96709f90f8f6b5))
* add diff preview design doc ([917a029](https://github.com/lucent-org/lucent-code/commit/917a0296d3a4a36e907c2264c479cbb753e08880))
* add future feature backlog inspired by kilocode ([e79169d](https://github.com/lucent-org/lucent-code/commit/e79169d7d2453dedc145857e258985487de1003b))
* add git worktree isolation design doc ([c3373f2](https://github.com/lucent-org/lucent-code/commit/c3373f24ccc3793e22f27ffc4fcebad51bf4838a))
* add git worktree isolation implementation plan ([920f5e4](https://github.com/lucent-org/lucent-code/commit/920f5e434205a4dee6a39a7689168abdb5059ca8))
* add implementation plan for 7 backlog fixes ([39a29de](https://github.com/lucent-org/lucent-code/commit/39a29de7ef0c7ee7d6b1a350c4588b94a941ea47))
* add implementation plan for P1 quick-wins ([591f4f2](https://github.com/lucent-org/lucent-code/commit/591f4f2db9fa4ac9fe7f20efaf6e8ee503a4b1b6))
* add implementation plan for P2 XS items (completion notification, idiomatic scroll) ([d2f1e7b](https://github.com/lucent-org/lucent-code/commit/d2f1e7bc05dd5854937875abac37f57ab5359602))
* add implementation plan for v1 features (import, type unification, OAuth management) ([1e58910](https://github.com/lucent-org/lucent-code/commit/1e58910318a217e7894d0dac86db9c1c5ea2cc90))
* add Lucent Code full marketing story ([b37a879](https://github.com/lucent-org/lucent-code/commit/b37a8793e844fa4844890520a1f2b763c039eb9d))
* add Lucent Code rebrand entry to CHANGELOG ([377931f](https://github.com/lucent-org/lucent-code/commit/377931f72fac094ad5ab74511b15a0310ceb9cbe))
* add Lucent Code rebrand implementation plan ([af8e9a4](https://github.com/lucent-org/lucent-code/commit/af8e9a45178de8dbd4e35104ad1901b19731eb2a))
* add marketing site implementation plan ([ea3cae3](https://github.com/lucent-org/lucent-code/commit/ea3cae38c100baaa7cef963241be5a92449b74f7))
* add MCP client implementation plan ([9435c08](https://github.com/lucent-org/lucent-code/commit/9435c08c951020d90b1ebb40ee1872923305becd))
* add MCP client support design doc ([16b152f](https://github.com/lucent-org/lucent-code/commit/16b152fcdd70113be0b379d69424954dc45372b7))
* add P2 features design doc ([0c7aab6](https://github.com/lucent-org/lucent-code/commit/0c7aab625c48b7b844d5f1a432a3cff5ed8442dd))
* add P2 features implementation plan ([f3d0caa](https://github.com/lucent-org/lucent-code/commit/f3d0caa75553888b1fc9db6e4b2ffb9d0fc10406))
* add Prism rebrand design doc ([616b7f7](https://github.com/lucent-org/lucent-code/commit/616b7f71caaf2b99b33f23e2b4ff77459d383f46))
* add S-tools design — new LLM tools, HITL approval, large output offloading ([1a411c8](https://github.com/lucent-org/lucent-code/commit/1a411c80321a8f8a8a0b2daf79165adba4f95242))
* add S-tools implementation plan ([4b63fc0](https://github.com/lucent-org/lucent-code/commit/4b63fc02a136f34434f8be30a57340bc62d8dc09))
* add semantic codebase search design — OpenRouter embeddings, SQLite, dual surface ([5f381f7](https://github.com/lucent-org/lucent-code/commit/5f381f764ef25c7609dd934006b7f66a00e45cc9))
* add semantic codebase search implementation plan ([af22a5f](https://github.com/lucent-org/lucent-code/commit/af22a5f074126a6fb55462f8fcdd1ed31390aae2))
* add session strip design doc ([eb6d485](https://github.com/lucent-org/lucent-code/commit/eb6d48508dea8f5c69589fe71e18431f7552bf3d))
* add session strip implementation plan ([e364521](https://github.com/lucent-org/lucent-code/commit/e364521b3ae981e381eb86b832258261b25ce442))
* add skill sets feature inventory to features.md ([249a625](https://github.com/lucent-org/lucent-code/commit/249a625b68b891ae9d1bad5adcdacfc179cad45d))
* add webview branding design — slash logo, toolbar wordmark, empty state, dual lightning fix ([7b9dd80](https://github.com/lucent-org/lucent-code/commit/7b9dd80b6fc49bcad6cdd1c88129b511045c6ab8))
* add webview branding implementation plan ([f50985d](https://github.com/lucent-org/lucent-code/commit/f50985decafeb44e82681590fbcd6d90fefe695d))
* consolidate and reprioritize backlog into P1-P4 tiers ([e59104a](https://github.com/lucent-org/lucent-code/commit/e59104a6557e4248bdf17318748cabed88d2ecf7))
* design doc for toolbar chat tabs and bottom model selector ([c818173](https://github.com/lucent-org/lucent-code/commit/c818173f4e4d511f77bd20fdcc13df3456526560))
* document [@mentions](https://github.com/mentions) system and action mentions in features.md ([0a0ef16](https://github.com/lucent-org/lucent-code/commit/0a0ef16451d9a8cec3b6251bd721d6e36cdf89d3))
* file attachments design (images + drag-and-drop) ([bb42b2c](https://github.com/lucent-org/lucent-code/commit/bb42b2c678803880e22fdda1c91ee23a3d4d0242))
* file attachments implementation plan (6 tasks) ([46e833e](https://github.com/lucent-org/lucent-code/commit/46e833ee2c1651e177ca66a57fc6142ad5e31099))
* fix phase column format (P2 -&gt; 2) in [@mentions](https://github.com/mentions) rows ([3cc99e2](https://github.com/lucent-org/lucent-code/commit/3cc99e2b274526c159066e692f07a8588ae032a4))
* implementation plan for toolbar tabs and bottom model selector ([ede403c](https://github.com/lucent-org/lucent-code/commit/ede403c4ee93331d4ea43c08337f3324017e7a8a))
* logo redesign design — neural net with bracket negative space ([6957778](https://github.com/lucent-org/lucent-code/commit/6957778ad5f9363050d73da23d6e23d0b461ba04))
* logo redesign implementation plan ([cbd67b9](https://github.com/lucent-org/lucent-code/commit/cbd67b9ccf17cdf38e3d1fe8fb9e7e5ab04693a5))
* logo redesign v2 design — explicit brackets + compact neural net ([25724e4](https://github.com/lucent-org/lucent-code/commit/25724e40cb01ecb135eab41468635209a07a81c8))
* logo redesign v2 implementation plan ([0bb75e5](https://github.com/lucent-org/lucent-code/commit/0bb75e5d9ab04d6b066930517a8ad190d8c23cc1))
* mark all 3 critical security issues as resolved ([df37337](https://github.com/lucent-org/lucent-code/commit/df37337e250bc57080c3a62959830c12c002f36d))
* mark all 7 important backlog issues as resolved ([fe11b97](https://github.com/lucent-org/lucent-code/commit/fe11b979ff4f24ab5dcf21fc82aafae9b8849d46))
* mark all P1 quick-wins items as resolved in features.md ([21b1581](https://github.com/lucent-org/lucent-code/commit/21b1581e3a5b744f9fc20b0418801265478d92d6))
* mark all phases complete, update icon with OpenRouter logo ([d7e751e](https://github.com/lucent-org/lucent-code/commit/d7e751ebd7d9dc4d378a751d80829d73deca255c))
* mark contextual code actions as implemented ([293f264](https://github.com/lucent-org/lucent-code/commit/293f2640dd641f8c64976efbdb47857a245cd0d9))
* mark custom instructions, context menu actions, and apply-to-file as implemented ([9ca1b80](https://github.com/lucent-org/lucent-code/commit/9ca1b80fd2b3b0595b2fce161a7aa5a17513ff50))
* mark diff preview and session strip as implemented in features.md ([8b1e85d](https://github.com/lucent-org/lucent-code/commit/8b1e85daaf81f381d3ffc0b34fdf5b27e123cba8))
* mark generate commit message and premium web search as implemented ([ff5d12f](https://github.com/lucent-org/lucent-code/commit/ff5d12f6c8c2344a00cbcd1a3c7cc32c5e668596))
* mark git worktree isolation as implemented in features.md ([8b836fd](https://github.com/lucent-org/lucent-code/commit/8b836fd4506560a33d15b065be3e9e348ea8f01f))
* mark P2 XS items as implemented in features.md ([53afb83](https://github.com/lucent-org/lucent-code/commit/53afb833156109730d134dac2d97b718a554541b))
* mark Phase 3 code intelligence features as complete ([3645231](https://github.com/lucent-org/lucent-code/commit/364523149c296ce7ca82ff7520ffd9cd4a18db59))
* mark Phase 4 features complete, update README and test counts ([fd360c5](https://github.com/lucent-org/lucent-code/commit/fd360c5f46e41f2b9c68a021a08259478d37d63a))
* mark S-tools features as implemented in features.md ([96d9b19](https://github.com/lucent-org/lucent-code/commit/96d9b1949cf41a7286af06d674e34cf6865cd843))
* mark v1 features as implemented in features.md ([19295d1](https://github.com/lucent-org/lucent-code/commit/19295d1c9433aae7709c62fc2944a8bba2887a5d))
* rewrite README with Lucent Code marketing copy ([f7f098c](https://github.com/lucent-org/lucent-code/commit/f7f098ce4f687860ef6eb50dc8552df53169929b))
* skill sets design — hybrid Claude Code cache + own sources ([335dd0c](https://github.com/lucent-org/lucent-code/commit/335dd0ca9da9b750dc187f529d8549baef05335f))
* skill sets implementation plan — 14 tasks, TDD, all sources + runtime injection ([2b616bf](https://github.com/lucent-org/lucent-code/commit/2b616bf34ab98b1594cc68c03f87d657611c45da))
* terminal button design — &gt;_ chip with onResolveMention reuse ([8b60867](https://github.com/lucent-org/lucent-code/commit/8b60867b9b6cf5734c66d9b9ad4558fa72e008dd))
* **ui:** add ui contract for marketing site v1 ([4a4b81e](https://github.com/lucent-org/lucent-code/commit/4a4b81ecdd00f60a2ec2d7e38589d93cdc401fef))
* update features.md for MCP client, autonomous mode, markdown improvements, test count ([cc8f58b](https://github.com/lucent-org/lucent-code/commit/cc8f58b06dfaa1a68659bacb5e5ac2b0df3d1ba9))
* update features.md with implementation status ([21ea327](https://github.com/lucent-org/lucent-code/commit/21ea327a9da082eb90a45874050ffabf5d1946e7))
* update README with Phase 3 code intelligence features ([4114299](https://github.com/lucent-org/lucent-code/commit/411429976f06bcd700f07968b7d075dd219bb25c))

## [Unreleased] — Rebrand to Lucent Code

### Changed
- Extension renamed from **OpenRouter Chat** to **Lucent Code**
- Publisher ID: `lucentcode`, Extension ID: `lucentcode.lucent-code`
- All command IDs updated: `openRouterChat.*` → `lucentCode.*`
- All setting keys updated: `openRouterChat.*` → `lucentCode.*`
- New icon: glowing light source on dark `#0d0d1a` background
- New dark gallery banner (`#0d0d1a`) — distinct from all other AI extensions on the marketplace
- Updated marketplace description, README, and keywords

> **Migration note:** If you have custom keybindings pointing to `openRouterChat.*` commands, update them to `lucentCode.*`.

---

## [0.1.0] - 2026-03-14

### Added

#### Phase 1 — Chat Panel
- Side panel chat UI with Solid.js webview
- Streaming responses via SSE
- Markdown rendering with syntax-highlighted code blocks
- Copy and Insert at Cursor actions on code blocks
- Model selector with search across the full OpenRouter catalog
- API key authentication via VSCode SecretStorage
- Basic code context (active file, selection, open editors)
- Empty state with quick-start suggestions

#### Phase 2 — Inline Completions
- Ghost text suggestions as you type (auto mode)
- Manual trigger via Alt+\
- Configurable debounce, trigger mode, and context window
- Separate model setting for completions
- Status bar indicator with loading state

#### Phase 3 — Code Intelligence
- VSCode language service integration (hover, definition, references, diagnostics, symbols)
- 5-second TTL cache for language service results
- Editor capability detection per language
- Dynamic system prompt with available editor capabilities
- Tool-use support (rename symbol, apply code action, format document, insert/replace code)

#### Phase 4 — Persistence & Auth
- Conversation history saved locally (JSON files in globalStorageUri)
- Auto-titling conversations via LLM
- Export conversations as JSON or Markdown
- Conversation list UI with load, delete, and export actions
- OAuth PKCE flow structure for OpenRouter

#### Phase 5 — Polish
- Keyboard shortcuts: Ctrl+Shift+N (new chat), Ctrl+Shift+L (focus chat), Alt+\ (trigger completion)
- Contextual error notifications with recovery actions
- Extension icon and marketplace metadata
