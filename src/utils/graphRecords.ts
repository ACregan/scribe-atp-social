// The Publication a Follow names, and the Document a Like names. The
// site.standard lexicons call these `publication` and `document`; Social
// wrote both as `subject` until 2026-10-28, and those records are still in
// readers' accounts (only the reader's own sign-in could rewrite them), so
// reads accept either.

export function followedPublication(value: unknown): string | undefined {
  const v = value as { publication?: unknown; subject?: unknown };
  const uri = v.publication ?? v.subject;
  return typeof uri === 'string' ? uri : undefined;
}

export function likedDocument(value: unknown): string | undefined {
  const v = value as { document?: unknown; subject?: unknown };
  const uri = v.document ?? v.subject;
  return typeof uri === 'string' ? uri : undefined;
}
