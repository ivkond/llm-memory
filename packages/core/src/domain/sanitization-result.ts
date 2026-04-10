export interface RedactionWarning {
  type: string;
  position: number;
  original_length: number;
}

export class SanitizationResult {
  constructor(
    public readonly content: string,
    public readonly warnings: RedactionWarning[],
    public readonly redactedRatio: number,
  ) {}

  get isBlocked(): boolean {
    return this.redactedRatio > 0.5;
  }

  get isClean(): boolean {
    return this.warnings.length === 0;
  }
}
