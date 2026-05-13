export const IndexConsistencyStatus = {
  Consistent: 'consistent',
  Informational: 'informational',
  Inconsistent: 'inconsistent',
} as const;

export type IndexConsistencyStatusValue =
  (typeof IndexConsistencyStatus)[keyof typeof IndexConsistencyStatus];

export const IndexConsistencySeverity = {
  Info: 'info',
  Warning: 'warning',
  Error: 'error',
} as const;

export type IndexConsistencySeverityValue =
  (typeof IndexConsistencySeverity)[keyof typeof IndexConsistencySeverity];

export const IndexConsistencyComponent = {
  TrackedFiles: 'tracked_files',
  Bm25: 'bm25',
  Vector: 'vector',
  Metadata: 'metadata',
  RuntimeState: 'runtime_state',
} as const;

export type IndexConsistencyComponentValue =
  (typeof IndexConsistencyComponent)[keyof typeof IndexConsistencyComponent];

export const IndexConsistencyFindingType = {
  MissingIndex: 'missing_index',
  StaleFile: 'stale_file',
  UnindexedTrackedFile: 'unindexed_tracked_file',
  OrphanBm25Entry: 'orphan_bm25_entry',
  MissingVectorEntry: 'missing_vector_entry',
  CorruptIndexMetadata: 'corrupt_index_metadata',
  UntrackedMarkdown: 'untracked_markdown',
  RuntimeStateInfo: 'runtime_state_info',
} as const;

export type IndexConsistencyFindingTypeValue =
  (typeof IndexConsistencyFindingType)[keyof typeof IndexConsistencyFindingType];

export interface IndexRepairGuidance {
  summary: string;
  actions: string[];
}

export interface IndexConsistencyFindingData {
  type: IndexConsistencyFindingTypeValue;
  severity: IndexConsistencySeverityValue;
  component: IndexConsistencyComponentValue;
  path?: string;
  message: string;
  repair?: IndexRepairGuidance;
}

export interface IndexConsistencyReportData {
  status: IndexConsistencyStatusValue;
  findings: IndexConsistencyFindingData[];
}

export class IndexConsistencyReport {
  private constructor(
    public readonly status: IndexConsistencyStatusValue,
    public readonly findings: readonly IndexConsistencyFindingData[],
  ) {}

  static empty(): IndexConsistencyReport {
    return new IndexConsistencyReport(IndexConsistencyStatus.Consistent, []);
  }

  static fromFindings(findings: IndexConsistencyFindingData[]): IndexConsistencyReport {
    return new IndexConsistencyReport(
      IndexConsistencyReport.deriveStatus(findings),
      findings.map((finding) => ({
        ...finding,
        repair: finding.repair
          ? { summary: finding.repair.summary, actions: [...finding.repair.actions] }
          : undefined,
      })),
    );
  }

  static fromData(data: IndexConsistencyReportData): IndexConsistencyReport {
    return new IndexConsistencyReport(
      data.status,
      data.findings.map((finding) => ({
        ...finding,
        repair: finding.repair
          ? { summary: finding.repair.summary, actions: [...finding.repair.actions] }
          : undefined,
      })),
    );
  }

  static deriveStatus(findings: readonly IndexConsistencyFindingData[]): IndexConsistencyStatusValue {
    if (findings.length === 0) return IndexConsistencyStatus.Consistent;
    const hasOperationalIssue = findings.some(
      (finding) =>
        finding.severity === IndexConsistencySeverity.Warning ||
        finding.severity === IndexConsistencySeverity.Error,
    );
    return hasOperationalIssue
      ? IndexConsistencyStatus.Inconsistent
      : IndexConsistencyStatus.Informational;
  }

  toData(): IndexConsistencyReportData {
    return {
      status: this.status,
      findings: this.findings.map((finding) => ({
        ...finding,
        repair: finding.repair
          ? { summary: finding.repair.summary, actions: [...finding.repair.actions] }
          : undefined,
      })),
    };
  }
}
