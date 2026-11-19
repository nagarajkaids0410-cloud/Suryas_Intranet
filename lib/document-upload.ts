const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const STANDARD_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const EXTENDED_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export function isValidDocumentFile(
  value: unknown,
  formats: Array<'pdf' | 'doc' | 'docx'>,
  maxBytes: number
): boolean {
  if (!value || typeof value !== 'object') return false;
  const file = value as { name?: unknown; size?: unknown; type?: unknown };
  if (
    typeof file.name !== 'string' ||
    typeof file.size !== 'number' ||
    file.size <= 0 ||
    file.size > maxBytes ||
    typeof file.type !== 'string'
  ) return false;

  const lastDot = file.name.lastIndexOf('.');
  const extension = lastDot > 0 ? file.name.slice(lastDot + 1).toLowerCase() : '';
  if (!extension || !formats.includes(extension as 'pdf' | 'doc' | 'docx')) return false;
  const expectedMime = MIME_TYPES[extension];
  return !file.type || file.type === expectedMime;
}

export function isValidDocumentUpload(
  value: unknown,
  formats: Array<'pdf' | 'doc' | 'docx'>,
  maxBytes: number,
  requireDataUrl = false
): boolean {
  if (!isValidDocumentFile(value, formats, maxBytes)) return false;
  const file = value as { name: string; size: number; type: string; base64?: unknown };
  if (typeof file.base64 !== 'string') return false;

  let encoded = file.base64;
  if (encoded.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(encoded);
    const extension = file.name.toLowerCase().split('.').pop()!;
    if (!match || match[1] !== MIME_TYPES[extension]) return false;
    encoded = match[2];
  } else if (requireDataUrl) {
    return false;
  }

  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return false;
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedSize = (encoded.length / 4) * 3 - padding;
  return decodedSize <= maxBytes && Math.abs(decodedSize - file.size) <= 2;
}