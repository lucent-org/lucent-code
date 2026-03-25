// Each skill lives in its own .md file — esbuild bundles them as text via loader: { '.md': 'text' }.
// No runtime file I/O, survives extension packaging.
import cleanCommits from './clean-commits.md';
import refactor from './refactor.md';
import debugging from './debugging.md';
import codeReview from './code-review.md';
import documentation from './documentation.md';
import doc from './doc.md';
import tests from './tests.md';
import commit from './commit.md';
import onboard from './onboard.md';
import compact from './compact.md';

export const BUILTIN_SKILLS: readonly string[] = [
  cleanCommits,
  refactor,
  debugging,
  codeReview,
  documentation,
  doc,
  tests,
  commit,
  onboard,
  compact,
];
