const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'with', 'i', 'my', 'this', 'that', 'it', 'have', 'need', 'want']);
const THRESHOLD = 0.08;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Lightweight stemmer: strip common suffixes so "bugs"→"bug", "failing"→"fail", etc. */
function stem(word: string): string {
  return word
    .replace(/ings?$/, '')
    .replace(/ures?$/, '')
    .replace(/ing$/, '')
    .replace(/tion$/, 'te')
    .replace(/ies$/, 'y')
    .replace(/s$/, '');
}

function stemmedSet(tokens: string[]): Set<string> {
  return new Set(tokens.flatMap((t) => [t, stem(t)]));
}

export class SkillMatcher {
  match(
    message: string,
    skills: { name: string; description: string }[],
    topN = 2
  ): string[] {
    if (skills.length === 0) return [];

    const messageTokens = tokenize(message);
    if (messageTokens.length === 0) return [];
    const messageStemmed = stemmedSet(messageTokens);

    const scored = skills.map((skill) => {
      const skillTokens = tokenize(`${skill.name} ${skill.description}`);
      const skillStemmed = stemmedSet(skillTokens);

      // Score from skill side: fraction of skill tokens matched by message
      const skillOverlap = skillTokens.filter((t) => messageStemmed.has(t) || messageStemmed.has(stem(t))).length;
      const skillScore = skillTokens.length > 0 ? skillOverlap / skillTokens.length : 0;

      // Score from message side: fraction of message tokens matched by skill
      const msgOverlap = messageTokens.filter((t) => skillStemmed.has(t) || skillStemmed.has(stem(t))).length;
      const msgScore = messageTokens.length > 0 ? msgOverlap / messageTokens.length : 0;

      const score = Math.max(skillScore, msgScore);
      return { name: skill.name, score };
    });

    return scored
      .filter((s) => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((s) => s.name);
  }
}
