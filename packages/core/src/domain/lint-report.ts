import type { HealthIssue } from './health-issue.js';

export interface LintReportData {
  consolidated: number;
  promoted: number;
  issues: HealthIssue[];
  commitSha: string | null;
  idempotencyReplayed?: boolean;
}

export class LintReport {
  private constructor(
    public readonly consolidated: number,
    public readonly promoted: number,
    public readonly issues: readonly HealthIssue[],
    public readonly commitSha: string | null,
    public readonly idempotencyReplayed: boolean,
  ) {}

  static empty(): LintReport {
    return new LintReport(0, 0, [], null, false);
  }

  static from(data: LintReportData): LintReport {
    return new LintReport(
      data.consolidated,
      data.promoted,
      [...data.issues],
      data.commitSha,
      data.idempotencyReplayed ?? false,
    );
  }

  merge(other: LintReport): LintReport {
    return new LintReport(
      this.consolidated + other.consolidated,
      this.promoted + other.promoted,
      [...this.issues, ...other.issues],
      other.commitSha ?? this.commitSha,
      this.idempotencyReplayed || other.idempotencyReplayed,
    );
  }

  withCommit(sha: string): LintReport {
    return new LintReport(
      this.consolidated,
      this.promoted,
      [...this.issues],
      sha,
      this.idempotencyReplayed,
    );
  }

  toData(): LintReportData {
    return {
      consolidated: this.consolidated,
      promoted: this.promoted,
      issues: [...this.issues],
      commitSha: this.commitSha,
      idempotencyReplayed: this.idempotencyReplayed,
    };
  }
}
