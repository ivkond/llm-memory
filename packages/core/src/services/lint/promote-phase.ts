import { LintPhaseError, LlmUnavailableError } from '../../domain/errors.js';
import type { IFileStore, FileInfo } from '../../ports/file-store.js';
import type { ILlmClient } from '../../ports/llm-client.js';
import { stripCodeFence } from './strip-code-fence.js';

export interface PromotePhaseResult {
  promotedCount: number;
  touchedPaths: string[];
}

interface PromoteProposal {
  target: string;
  title: string;
  content: string;
  sources: string[];
  replacement_marker: string;
}

const PROMOTE_SYSTEM_PROMPT =
  'You are a knowledge curator. Identify reusable practices inside per-project practices.md files ' +
  'and lift them into shared wiki/patterns/ pages. ' +
  'Respond with a JSON object: {"promoted":[{"target":"wiki/patterns/...","title":"...","content":"...","sources":["projects/..."],"replacement_marker":"..."}]}. ' +
  'Only promote a practice when it is non-trivial and would apply to at least one other project. ' +
  '`replacement_marker` must match a heading or line inside each source file so the phase can swap it for a link.';

export class PromotePhase {
  constructor(
    private readonly worktreeFileStore: IFileStore,
    private readonly llmClient: ILlmClient,
  ) {}

  async run(): Promise<PromotePhaseResult> {
    const practicesFiles = await this.collectPracticeFiles();
    if (practicesFiles.length === 0) {
      return { promotedCount: 0, touchedPaths: [] };
    }

    const payload = await this.buildPayload(practicesFiles);
    if (payload.length === 0) {
      return { promotedCount: 0, touchedPaths: [] };
    }

    let proposals: PromoteProposal[];
    try {
      proposals = await this.askLlm(payload);
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(message);
    }

    for (const prop of proposals) {
      this.validateTarget(prop.target);
    }

    const allowedSources = new Set(payload.map((p) => p.path));
    const touchedPaths: string[] = [];
    for (const prop of proposals) {
      await this.applyProposal(prop, touchedPaths, allowedSources);
    }

    return { promotedCount: proposals.length, touchedPaths };
  }

  private async applyProposal(
    prop: PromoteProposal,
    touchedPaths: string[],
    allowedSources: Set<string>,
  ): Promise<void> {
    const body = this.renderPage(prop);
    await this.worktreeFileStore.writeFile(prop.target, body);
    touchedPaths.push(prop.target);

    for (const sourcePath of prop.sources) {
      if (!allowedSources.has(sourcePath)) continue;
      await this.rewriteSource(sourcePath, prop, touchedPaths);
    }
  }

  private async rewriteSource(
    sourcePath: string,
    prop: PromoteProposal,
    touchedPaths: string[],
  ): Promise<void> {
    const original = await this.worktreeFileStore.readFile(sourcePath);
    if (original === null) return;
    const rewritten = this.replaceMarkerWithLink(
      original,
      prop.replacement_marker,
      sourcePath,
      prop.target,
    );
    if (rewritten === original) return;
    await this.worktreeFileStore.writeFile(sourcePath, rewritten);
    if (!touchedPaths.includes(sourcePath)) touchedPaths.push(sourcePath);
  }

  private async collectPracticeFiles(): Promise<FileInfo[]> {
    const all = await this.worktreeFileStore.listFiles('projects');
    return all.filter((f) => /^projects\/[^/]+\/practices\.md$/.test(f.path));
  }

  private async buildPayload(files: FileInfo[]): Promise<Array<{ path: string; content: string }>> {
    const payload: Array<{ path: string; content: string }> = [];
    for (const file of files) {
      const content = await this.worktreeFileStore.readFile(file.path);
      if (content) payload.push({ path: file.path, content });
    }
    return payload;
  }

  private async askLlm(
    payload: Array<{ path: string; content: string }>,
  ): Promise<PromoteProposal[]> {
    const response = await this.llmClient.complete({
      system: PROMOTE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            'Project practices files:\n\n' +
            JSON.stringify(payload, null, 2) +
            '\n\nRespond with the {"promoted":[...]} JSON object.',
        },
      ],
      temperature: 0.1,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(response.content));
    } catch (err) {
      throw new LlmUnavailableError(
        `model returned non-JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { promoted?: unknown }).promoted)
    ) {
      throw new LlmUnavailableError('promote response missing "promoted" array');
    }
    const promoted = (parsed as { promoted: unknown[] }).promoted;
    const result: PromoteProposal[] = [];
    for (const raw of promoted) {
      const obj = raw as Partial<PromoteProposal>;
      if (
        typeof obj.target !== 'string' ||
        typeof obj.title !== 'string' ||
        typeof obj.content !== 'string' ||
        !Array.isArray(obj.sources) ||
        typeof obj.replacement_marker !== 'string'
      ) {
        throw new LlmUnavailableError('malformed promote entry');
      }
      result.push(obj as PromoteProposal);
    }
    return result;
  }

  private validateTarget(target: string): void {
    if (!target.startsWith('wiki/patterns/') || !target.endsWith('.md')) {
      throw new LintPhaseError('promote', `target must be wiki/patterns/<name>.md: ${target}`);
    }
    const segments = target.split('/');
    for (const seg of segments) {
      if (seg === '' || seg === '.' || seg === '..') {
        throw new LintPhaseError('promote', `invalid path segment in ${target}`);
      }
    }
  }

  private renderPage(prop: PromoteProposal): string {
    const today = new Date().toISOString().slice(0, 10);
    const sources = prop.sources.map((s) => `  - ${s}`).join('\n');
    const fm = [
      '---',
      `title: ${this.yamlString(prop.title)}`,
      `created: ${today}`,
      `updated: ${today}`,
      'confidence: 0.9',
      `sources:\n${sources}`,
      'supersedes: null',
      'tags: [promoted]',
      '---',
      '',
    ].join('\n');
    return `${fm}\n${prop.content.trim()}\n`;
  }

  private replaceMarkerWithLink(
    original: string,
    marker: string,
    sourcePath: string,
    targetPath: string,
  ): string {
    const relLink = this.relativeLink(sourcePath, targetPath);
    const markerEscaped = marker.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const asHeading = new RegExp(String.raw`^##\s+${markerEscaped}\s*$`, 'm');
    if (asHeading.test(original)) {
      return original.replace(asHeading, `## [${marker}](${relLink})`);
    }
    const asLine = new RegExp(String.raw`^${markerEscaped}\s*$`, 'm');
    if (asLine.test(original)) {
      return original.replace(asLine, `[${marker}](${relLink})`);
    }
    return original;
  }

  private relativeLink(fromFile: string, toFile: string): string {
    const fromSegments = fromFile.split('/').slice(0, -1);
    const toSegments = toFile.split('/');
    const up = '../'.repeat(fromSegments.length);
    return `${up}${toSegments.join('/')}`;
  }

  private yamlString(value: string): string {
    if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
    return JSON.stringify(value);
  }
}
