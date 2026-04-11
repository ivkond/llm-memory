export const HealthIssueType = {
  Orphan: 'orphan',
  Stale: 'stale',
  Contradiction: 'contradiction',
  MissingConcept: 'missing_concept',
  BrokenLink: 'broken_link',
} as const;

export type HealthIssueTypeValue = (typeof HealthIssueType)[keyof typeof HealthIssueType];

export interface HealthIssueData {
  type: HealthIssueTypeValue;
  page: string;
  description: string;
}

export class HealthIssue {
  private constructor(
    public readonly type: HealthIssueTypeValue,
    public readonly page: string,
    public readonly description: string,
  ) {}

  static create(data: HealthIssueData): HealthIssue {
    if (!data.page) {
      throw new Error('HealthIssue.page must not be empty');
    }
    if (!data.description) {
      throw new Error('HealthIssue.description must not be empty');
    }
    return new HealthIssue(data.type, data.page, data.description);
  }

  toData(): HealthIssueData {
    return { type: this.type, page: this.page, description: this.description };
  }
}
