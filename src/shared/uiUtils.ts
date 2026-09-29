export function parseTags(value: string) {
  return Array.from(new Set(value.split(/[，,、;\r\n]+/).map((tag) => tag.trim()).filter(Boolean)));
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
