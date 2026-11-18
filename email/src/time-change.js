// Only the newest received preview can suggest a change. Quote the sender's words
// verbatim and leave ambiguous times, date changes and cancellations to the reader.
export function proposedTime(message) {
  if (!message || !['inbox', 'archive'].includes(message.folder)) return null;
  const text = String(message.snippet || '').slice(0, 240);
  if (/\b(?:not|don['’]t|can['’]t|cannot|cancel\w*|tomorrow|yesterday|next week|am|pm|gmt|utc|bst|[ecmp][ds]t|cet|cest|ist|jst|aest|time ?zone|local time|your time|my time|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\b\d+[/-]\d+|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d/i.test(text)) return null;
  const times = text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g);
  if (times?.length !== 1) return null;
  const phrase = text.match(/\b(?:can|could|shall) we (?:make it|meet at|move (?:it|this) to) (?:[01]?\d|2[0-3]):[0-5]\d(?: instead)?\s*\?|\b(?:let['’]s|please) (?:move (?:it|this) to|make it) (?:[01]?\d|2[0-3]):[0-5]\d(?: instead)?[.!](?=\s|$)/i);
  if (!phrase) return null;
  return { time: times[0].padStart(5, '0'), evidence: phrase[0], messageId: message.id };
}
