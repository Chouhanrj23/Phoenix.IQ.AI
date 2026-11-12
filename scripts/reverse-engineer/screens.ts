// Turns uploaded screenshots into text evidence: a vision model describes each
// screen (fields, actions, data shown, rules visible on screen). Results are
// cached by image hash, so re-running does not re-spend requests. Each
// screenshot tries the vision models in order; one that no model can read is
// reported as not used rather than failing the whole run.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvidenceFile } from './evidence.ts';
import type { LlmClient } from './llm.ts';
import type { UploadedImage } from './uploads.ts';

const SYSTEM = `You are a business analyst reverse-engineering a banking website from a screenshot.
Describe only what is visible; do not invent features. Return JSON:
{ "screen": "short screen name", "purpose": "what the user does here",
  "fields": ["input fields with any visible format/limits"], "actions": ["buttons/links and what they do"],
  "dataShown": ["data values/tables shown and their columns"], "rulesVisible": ["validation, limits, messages, warnings"],
  "navigation": ["menu items / where the user can go"], "notes": "anything else relevant to requirements" }`;

export interface ScreenshotResult {
  files: EvidenceFile[];
  read: string[];
  failed: { path: string; reason: string }[];
}

export async function describeScreenshots(
  images: UploadedImage[],
  visionModels: LlmClient[],
  cacheDir: string,
  log: (msg: string) => void,
): Promise<ScreenshotResult> {
  mkdirSync(cacheDir, { recursive: true });
  const result: ScreenshotResult = { files: [], read: [], failed: [] };
  for (const [i, img] of images.entries()) {
    const hash = createHash('sha1').update(img.base64).digest('hex').slice(0, 16);
    const cacheFile = join(cacheDir, `${hash}.json`);
    let desc: unknown = null;
    let by = '';
    if (existsSync(cacheFile)) {
      ({ desc, by } = JSON.parse(readFileSync(cacheFile, 'utf8')) as { desc: unknown; by: string });
      log(`    screenshot ${i + 1}/${images.length} ${img.path} — already described (${by})`);
    } else {
      const errors: string[] = [];
      for (const vision of visionModels) {
        log(
          `    screenshot ${i + 1}/${images.length} ${img.path} — describing with ${vision.model}...`,
        );
        try {
          desc = await vision.generateJson({
            system: SYSTEM,
            prompt: `Screenshot "${img.path}" (uploaded for module ${img.moduleId}). Describe it.`,
            images: [{ mimeType: img.mimeType, base64: img.base64 }],
          });
          by = vision.model;
          writeFileSync(cacheFile, JSON.stringify({ by, desc }, null, 2));
          break;
        } catch (err) {
          const reason = (err as Error).message.split('\n')[0]?.slice(0, 160) ?? 'failed';
          errors.push(`${vision.model}: ${reason}`);
          log(
            `      ${vision.model} could not read it (${reason})${visionModels.at(-1) === vision ? '' : '; trying the next model'}`,
          );
        }
      }
      if (!desc) {
        result.failed.push({
          path: img.path,
          reason: `no vision model could read it right now (${errors.join('; ') || 'none configured'})`,
        });
        continue;
      }
    }
    result.read.push(img.path);
    result.files.push({
      path: img.path,
      category: `ui-screenshot (described by ${by}), module ${img.moduleId}`,
      content: JSON.stringify(desc, null, 1),
      truncated: false,
    });
  }
  return result;
}
