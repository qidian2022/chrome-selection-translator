// Each entry has its own storage key so simultaneous saves in different tabs cannot overwrite the book.
export const libraryPrefix = 'reading:';
export async function saveEntry(kind, data) {
  const fields = kind === 'word'
    ? {word: 160, meaning: 3000, phonetic: 2000, pos: 2000, example: 2000, source: 12000}
    : {source: 12000, question: 2000, answer: 40000};
  const entry = {kind, savedAt: Date.now()};
  for (const [field, length] of Object.entries(fields))
    entry[field] = typeof data?.[field] === 'string' ? data[field].trim().slice(0, length) : '';
  const identity = kind === 'word' ? [entry.word.normalize('NFKC').toLowerCase()] : [entry.source, entry.question, entry.answer];
  if (identity.some(value => !value) || (kind === 'word' && !entry.meaning)) throw new Error('内容尚未完整，无法收藏。');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(identity)));
  const id = libraryPrefix + kind + ':' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  await chrome.storage.local.set({[id]: entry});
}
