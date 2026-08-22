import { memo } from 'react';
import { Linking, Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { ChatFonts } from '@/constants/ai-ui';
import type { ColorTokens } from '@/design/tokens';

/**
 * Hand-rolled markdown renderer (AI_CHAT_UI_UX_SPEC §9.4). Two passes:
 * fenced-block split, then inline grammar on every line. No library.
 *
 * The streaming `▌` cursor is appended to the last text line of the last
 * block; if the content is empty, a bare cursor line renders.
 */

const FENCED_RE = /```([^\n`]*)\n?([\s\S]*?)```/g;

// First-match-wins order matters.
const INLINE_RE =
  /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\))/g;

const BLOCK_RE = /^(#{1,3})\s+(.+)$/;
const QUOTE_RE = /^>\s?(.+)$/;
const UL_RE = /^\s*[-*]\s+(.+)$/;
const OL_RE = /^\s*(\d+)\.\s+(.+)$/;

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function openLink(url: string) {
  const trimmed = url.trim();
  // Security: only real web URLs open.
  if (!/^https?:\/\//i.test(trimmed)) return;
  void Linking.openURL(trimmed);
}

function Inline({
  text,
  colors,
  inverted,
  style,
  suffix,
}: {
  text: string;
  colors: {
    textPrimary: string;
    textInverse: string;
    textMuted: string;
    surfaceStrong: string;
    borderSubtle: string;
    accentSol: string;
  };
  inverted: boolean;
  style?: TextStyle | TextStyle[];
  suffix?: React.ReactNode;
}) {
  const base = inverted
    ? {
        codeBg: `${colors.textInverse}20`,
        codeBorder: `${colors.textInverse}30`,
        codeLang: `${colors.textInverse}80`,
        codeText: colors.textInverse,
        link: colors.textInverse,
        textColor: colors.textInverse,
      }
    : {
        codeBg: colors.surfaceStrong,
        codeBorder: colors.borderSubtle,
        codeLang: colors.textMuted,
        codeText: colors.textPrimary,
        link: colors.accentSol,
        textColor: colors.textPrimary,
      };

  const parts = text.split(INLINE_RE);
  return (
    <Text style={[style, { color: base.textColor }]}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={i} style={[styles.markdownInlineCode, { color: base.codeText, backgroundColor: base.codeBg, borderColor: base.codeBorder }]}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith('***') && part.endsWith('***')) {
          return (
            <Text key={i} style={styles.markdownBoldItalic}>
              {part.slice(3, -3)}
            </Text>
          );
        }
        if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
          return (
            <Text key={i} style={styles.markdownBold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('~~') && part.endsWith('~~')) {
          return (
            <Text key={i} style={styles.markdownStrike}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
          return (
            <Text key={i} style={styles.markdownItalic}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          return (
            <Text key={i} style={[styles.markdownLink, { color: base.link }]} onPress={() => openLink(linkMatch[2])}>
              {linkMatch[1]}
            </Text>
          );
        }
        return part;
      })}
      {suffix}
    </Text>
  );
}

type ParsedBlock = { kind: 'code'; lang: string; code: string } | { kind: 'text'; text: string };

function parseFenced(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let lastIndex = 0;
  const re = new RegExp(FENCED_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) blocks.push({ kind: 'text', text: text.slice(lastIndex, match.index) });
    blocks.push({ kind: 'code', lang: match[1], code: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) blocks.push({ kind: 'text', text: text.slice(lastIndex) });
  return blocks;
}

interface MarkdownTextProps {
  text: string;
  theme: ColorTokens;
  invertedSurface?: boolean;
  suffix?: React.ReactNode;
  style?: TextStyle | TextStyle[];
}

export const MarkdownText = memo(
  function MarkdownText({
  text,
  theme,
  invertedSurface = false,
  suffix,
  style,
}: MarkdownTextProps) {
  const blocks = parseFenced(text);

  if (blocks.length === 0) {
    return <Text style={[styles.assistantText, { color: theme.textPrimary }, style]}>{suffix}</Text>;
  }

  const colors = {
    textPrimary: theme.textPrimary,
    textInverse: theme.textInverse,
    textMuted: theme.textMuted,
    surfaceStrong: theme.surfaceStrong,
    borderSubtle: theme.borderSubtle,
    accentSol: theme.accentSol,
  };

  const base = invertedSurface
    ? {
        codeBg: `${theme.textInverse}20`,
        codeBorder: `${theme.textInverse}30`,
        codeLang: `${theme.textInverse}80`,
        codeText: theme.textInverse,
      }
    : {
        codeBg: theme.surfaceStrong,
        codeBorder: theme.borderSubtle,
        codeLang: theme.textMuted,
        codeText: theme.textPrimary,
      };

  let renderedSuffix = suffix;
  let lastTextIndex = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.kind === 'text' && block.text.trim().length > 0) {
      lastTextIndex = i;
      break;
    }
  }

  return (
    <View style={styles.markdownRoot}>
      {blocks.map((block, i) => {
        const isLastText = i === lastTextIndex;
        if (block.kind === 'code') {
          return (
            <View key={i} style={[styles.markdownCodeBlock, { backgroundColor: base.codeBg, borderColor: base.codeBorder }]}>
              {block.lang ? <Text style={[styles.markdownCodeLang, { color: base.codeLang }]}>{block.lang}</Text> : null}
              <Text style={[styles.markdownCodeText, { color: base.codeText }]}>{block.code}</Text>
            </View>
          );
        }
        const lines = block.text.split('\n');
        const nodes: React.ReactNode[] = [];
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          const trimmed = line.trim();
          const lastLineOfBlock = li === lines.length - 1;
          const attachSuffix = isLastText && lastLineOfBlock;
          if (trimmed.length === 0) {
            nodes.push(<View key={`g${li}`} style={styles.markdownGap} />);
            continue;
          }
          const heading = trimmed.match(BLOCK_RE);
          if (heading) {
            const level = heading[1].length;
            nodes.push(
              <Text
                key={li}
                style={[styles.markdownHeading, level === 1 ? styles.markdownH1 : level === 2 ? styles.markdownH2 : styles.markdownH3]}>
                {heading[2]}
                {attachSuffix ? renderedSuffix : null}
              </Text>,
            );
            continue;
          }
          const quote = trimmed.match(QUOTE_RE);
          if (quote) {
            nodes.push(
              <View key={li} style={[styles.markdownQuote, { borderLeftColor: theme.accentSol }]}>
                <Inline
                  text={quote[1]}
                  colors={colors}
                  inverted={invertedSurface}
                  style={[styles.markdownQuoteText, { color: theme.textSecondary }]}
                  suffix={attachSuffix ? renderedSuffix : undefined}
                />
              </View>,
            );
            continue;
          }
          const ul = trimmed.match(UL_RE);
          if (ul) {
            nodes.push(
              <View key={li} style={styles.markdownListRow}>
                <Text style={[styles.markdownListMarker, { color: theme.textMuted }]}>•</Text>
                <View style={styles.markdownListText}>
                  <Inline
                    text={ul[1]}
                    colors={colors}
                    inverted={invertedSurface}
                    style={styles.markdownListBody}
                    suffix={attachSuffix ? renderedSuffix : undefined}
                  />
                </View>
              </View>,
            );
            continue;
          }
          const ol = trimmed.match(OL_RE);
          if (ol) {
            nodes.push(
              <View key={li} style={styles.markdownListRow}>
                <Text style={[styles.markdownListMarker, { color: theme.textMuted }]}>{ol[1]}.</Text>
                <View style={styles.markdownListText}>
                  <Inline
                    text={ol[2]}
                    colors={colors}
                    inverted={invertedSurface}
                    style={styles.markdownListBody}
                    suffix={attachSuffix ? renderedSuffix : undefined}
                  />
                </View>
              </View>,
            );
            continue;
          }
          nodes.push(
            <Inline
              key={li}
              text={trimmed}
              colors={colors}
              inverted={invertedSurface}
              style={[styles.assistantText, { color: theme.textPrimary }]}
              suffix={attachSuffix ? renderedSuffix : undefined}
            />,
          );
        }
        return <View key={i}>{nodes}</View>;
      })}
    </View>
  );
  },
  // Re-parse is the whole cost of this component. The suffix cursor only ever
  // rides a message whose text is changing in the same update (single-shot
  // backend), so text/theme/invertedSurface cover every render-affecting prop;
  // `style` is derived from `theme` by the callers.
  (prev: MarkdownTextProps, next: MarkdownTextProps) =>
    prev.text === next.text &&
    prev.theme === next.theme &&
    prev.invertedSurface === next.invertedSurface,
);

const styles = StyleSheet.create({
  markdownRoot: { gap: 4 },
  markdownBold: { fontFamily: ChatFonts.semiBold },
  markdownItalic: { fontStyle: 'italic' },
  markdownBoldItalic: { fontFamily: ChatFonts.semiBold, fontStyle: 'italic' },
  markdownStrike: { textDecorationLine: 'line-through' },
  markdownLink: { fontFamily: ChatFonts.medium, textDecorationLine: 'underline' },
  markdownInlineCode: {
    fontFamily: MONO,
    fontSize: 13,
    borderRadius: 4,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  markdownCodeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
  },
  markdownCodeLang: { fontSize: 10, fontFamily: ChatFonts.medium, textTransform: 'uppercase', marginBottom: 4 },
  markdownCodeText: { fontFamily: MONO, fontSize: 12, lineHeight: 18 },
  markdownGap: { height: 6 },
  markdownHeading: { fontFamily: ChatFonts.semiBold, marginTop: 4 },
  markdownH1: { fontSize: 19, lineHeight: 25 },
  markdownH2: { fontSize: 17, lineHeight: 23 },
  markdownH3: { fontSize: 15, lineHeight: 21 },
  markdownQuote: { borderLeftWidth: 2, paddingLeft: 10, marginVertical: 4 },
  markdownQuoteText: { fontSize: 15, lineHeight: 24, fontFamily: ChatFonts.regular },
  markdownListRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  markdownListMarker: { width: 20, textAlign: 'right', fontFamily: ChatFonts.regular, fontSize: 15, lineHeight: 24 },
  markdownListText: { flex: 1 },
  markdownListBody: { fontSize: 15, lineHeight: 24, fontFamily: ChatFonts.regular },
  assistantText: { fontSize: 15, lineHeight: 24, fontFamily: ChatFonts.regular, paddingVertical: 2 },
});