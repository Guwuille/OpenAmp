export function toFileUrl(filePath) {
  let normalized = filePath.replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = '/' + normalized;

  const encoded = normalized
    .split('/')
    .map((segment, i) => (i === 1 && /^[a-zA-Z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/');

  return `file://${encoded}`;
}
