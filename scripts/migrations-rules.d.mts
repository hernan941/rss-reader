export function stripSqlComments(sql: string): string;
export function checkMigrations(input: {
  changes: { status: string; path: string }[];
  baseFiles: string[];
  readFile: (path: string) => string;
  allowDestructive?: boolean;
}): { errors: string[]; added: number };
