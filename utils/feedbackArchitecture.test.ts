import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) ? [file] : [];
});

describe('feedback architecture boundaries', () => {
  it('keeps new delivery APIs and local Ant Design queues out of product modules', () => {
    const violations: string[] = [];
    for (const file of ['App.tsx', ...['components', 'pages', 'hooks', 'utils'].flatMap(sourceFiles)]) {
      const content = fs.readFileSync(file, 'utf8');
      if (/\b(?:message|notification)\s*\.\s*(?:useMessage|useNotification|config)\s*\(/.test(content)
        || /from\s*['"](?:sonner|react-hot-toast|react-toastify|sileo)(?:\/[^'"]*)?['"]/.test(content)) violations.push(file);
    }
    expect(violations).toEqual([]);
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('notificationProvider={refineFeedbackProvider}');
    expect(app).not.toContain('useNotificationProvider');
  });
});
