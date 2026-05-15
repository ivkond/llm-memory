import { describe, expect, it } from 'vitest';
import {
  IndexConsistencyComponent,
  IndexConsistencyFindingType,
  IndexConsistencyReport,
  IndexConsistencySeverity,
  IndexConsistencyStatus,
  type IndexConsistencyFindingData,
} from '../../src/domain/index-consistency-report.js';

function finding(overrides: Partial<IndexConsistencyFindingData>): IndexConsistencyFindingData {
  return {
    type: IndexConsistencyFindingType.RuntimeStateInfo,
    severity: IndexConsistencySeverity.Info,
    component: IndexConsistencyComponent.RuntimeState,
    message: 'runtime state hint',
    ...overrides,
  };
}

describe('IndexConsistencyReport', () => {
  it('reports consistent when there are no findings', () => {
    const report = IndexConsistencyReport.empty();
    expect(report.status).toBe(IndexConsistencyStatus.Consistent);
    expect(report.findings).toEqual([]);
  });

  it.each([
    {
      name: 'missing index',
      data: finding({
        type: IndexConsistencyFindingType.MissingIndex,
        severity: IndexConsistencySeverity.Error,
        component: IndexConsistencyComponent.Bm25,
      }),
    },
    {
      name: 'stale file',
      data: finding({
        type: IndexConsistencyFindingType.StaleFile,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.TrackedFiles,
        path: 'notes/a.md',
      }),
    },
    {
      name: 'unindexed tracked file',
      data: finding({
        type: IndexConsistencyFindingType.UnindexedTrackedFile,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.TrackedFiles,
      }),
    },
    {
      name: 'orphan bm25 entry',
      data: finding({
        type: IndexConsistencyFindingType.OrphanBm25Entry,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.Bm25,
      }),
    },
    {
      name: 'missing vector entry',
      data: finding({
        type: IndexConsistencyFindingType.MissingVectorEntry,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.Vector,
      }),
    },
    {
      name: 'corrupt index metadata',
      data: finding({
        type: IndexConsistencyFindingType.CorruptIndexMetadata,
        severity: IndexConsistencySeverity.Error,
        component: IndexConsistencyComponent.Metadata,
      }),
    },
    {
      name: 'untracked markdown',
      data: finding({
        type: IndexConsistencyFindingType.UntrackedMarkdown,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.TrackedFiles,
      }),
    },
  ])('maps $name finding to inconsistent status', ({ data }) => {
    const report = IndexConsistencyReport.fromFindings([data]);
    expect(report.status).toBe(IndexConsistencyStatus.Inconsistent);
  });

  it('keeps runtime-state informational findings as informational status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.RuntimeStateInfo,
        severity: IndexConsistencySeverity.Info,
        component: IndexConsistencyComponent.RuntimeState,
        repair: {
          summary: 'No action required',
          actions: ['Observe next ingest run'],
        },
      }),
    ]);
    expect(report.status).toBe(IndexConsistencyStatus.Informational);
    expect(report.findings[0]?.repair?.actions).toEqual(['Observe next ingest run']);
  });
});
