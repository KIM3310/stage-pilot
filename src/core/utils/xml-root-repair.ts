function isAsciiLetterOrUnderscore(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    character === "_" ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isValidRootTag(tag: string): boolean {
  if (tag.length === 0 || !isAsciiLetterOrUnderscore(tag[0])) {
    return false;
  }

  for (let index = 1; index < tag.length; index += 1) {
    const character = tag[index];
    const code = character.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    if (
      !(isAsciiLetterOrUnderscore(character) || isDigit) &&
      character !== "-"
    ) {
      return false;
    }
  }

  return true;
}

export function tryRepairXmlSelfClosingRootWithBody(
  rawText: string,
  toolNames: string[]
): string | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const openingLineEnd = trimmed.indexOf("\n");
  const closingLineStart = trimmed.lastIndexOf("\n");
  if (openingLineEnd === -1 || closingLineStart <= openingLineEnd) {
    return null;
  }

  let openingLine = trimmed.slice(0, openingLineEnd);
  if (openingLine.endsWith("\r")) {
    openingLine = openingLine.slice(0, -1);
  }
  if (!openingLine.startsWith("<")) {
    return null;
  }

  const rootTag = openingLine.slice(1).trimEnd();
  if (!(isValidRootTag(rootTag) && toolNames.includes(rootTag))) {
    return null;
  }

  const closingLine = trimmed.slice(closingLineStart + 1);
  if (closingLine.trimStart() !== "/>") {
    return null;
  }

  // Keep leading indentation intact for YAML payloads.
  const body = trimmed.slice(openingLineEnd + 1, closingLineStart).trimEnd();
  if (body.trim().length === 0 || body.includes(`</${rootTag}>`)) {
    return null;
  }

  return `<${rootTag}>\n${body}\n</${rootTag}>`;
}
