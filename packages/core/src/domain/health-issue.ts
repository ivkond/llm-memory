export const HealthIssueType = {
  Orphan: 'orphan',
  Stale: 'stale',
  Contradiction: 'contradiction',
  MissingConcept: 'missing_concept',
  BrokenLink: 'broken_link',
} as const;

export type HealthIssueTypeValue = (typeof HealthIssueType)[keyof typeof HealthIssueType];

export const HealthIssueSeverity = {
  Info: 'info',
  Warning: 'warning',
  Error: 'error',
} as const;

export type HealthIssueSeverityValue =
  (typeof HealthIssueSeverity)[keyof typeof HealthIssueSeverity];

export interface HealthIssueData {
  code: string;
  type: HealthIssueTypeValue;
  severity: HealthIssueSeverityValue;
  page: string;
  description: string;
}

export class HealthIssue {
  private constructor(
    public readonly code: string,
    public readonly type: HealthIssueTypeValue,
    public readonly severity: HealthIssueSeverityValue,
    public readonly page: string,
    public readonly description: string,
  ) {}

  static create(data: HealthIssueData): HealthIssue {
    if (!data.code) {
      throw new Error('HealthIssue.code must not be empty');
    }
    if (!data.page) {
      throw new Error('HealthIssue.page must not be empty');
    }
    if (!data.description) {
      throw new Error('HealthIssue.description must not be empty');
    }
    return new HealthIssue(data.code, data.type, data.severity, data.page, data.description);
  }

  toData(): HealthIssueData {
    return {
      code: this.code,
      type: this.type,
      severity: this.severity,
      page: this.page,
      description: this.description,
    };
  }
}
