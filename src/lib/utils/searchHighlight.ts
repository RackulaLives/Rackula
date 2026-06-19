/**
 * Search Highlight Utilities
 * Functions for highlighting search matches and truncating text
 */

export interface TextSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Splits text into segments marking which parts match the search query
 * @param text - The text to search within
 * @param query - The search query
 * @returns Array of text segments with match flags
 */
export function highlightMatch(text: string, query: string): TextSegment[] {
  if (!query.trim()) {
    return [{ text, isMatch: false }];
  }

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  const segments: TextSegment[] = [];

  let currentIndex = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery);

  // If no match found, return entire text as non-match
  if (matchIndex === -1) {
    return [{ text, isMatch: false }];
  }

  // Build segments by finding all matches
  while (matchIndex !== -1 && currentIndex < text.length) {
    // Add non-matching text before the match
    if (matchIndex > currentIndex) {
      segments.push({
        text: text.substring(currentIndex, matchIndex),
        isMatch: false,
      });
    }

    // Add matching text
    const matchEnd = matchIndex + normalizedQuery.length;
    segments.push({
      text: text.substring(matchIndex, matchEnd),
      isMatch: true,
    });

    currentIndex = matchEnd;
    matchIndex = normalizedText.indexOf(normalizedQuery, currentIndex);
  }

  // Add remaining non-matching text
  if (currentIndex < text.length) {
    segments.push({
      text: text.substring(currentIndex),
      isMatch: false,
    });
  }

  return segments;
}

/**
 * Truncates text to a maximum length and adds ellipsis if needed
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncateWithEllipsis(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + "...";
}
