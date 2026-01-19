import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cachedTemplate: string | null = null;

export const getSystemPromptTemplate = (): string => {
  if (cachedTemplate) {
    return cachedTemplate;
  }

  const baseDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = join(baseDir, "system.md");
  cachedTemplate = readFileSync(templatePath, "utf8");
  return cachedTemplate;
};

export const buildSystemPrompt = (promisePhrase: string): string => {
  return getSystemPromptTemplate()
    .split("{{PROMISE}}")
    .join(promisePhrase);
};
