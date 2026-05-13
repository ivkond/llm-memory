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

  it('maps missing index finding to inconsistent status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.MissingIndex,
        severity: IndexConsistencySeverity.Error,
        component: IndexConsistencyComponent.Bm25,
      }),
    ]);
    expect(report.status).toBe(IndexConsistencyStatus.Inconsistent);
  });

  it('maps stale file finding to inconsistent status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.StaleFile,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.TrackedFiles,
        path: 'notes/a.md',
      }),
    ]);
    expect(report.status).toBe(IndexConsistencyStatus.Inconsistent);
  });

  it('maps unindexed tracked file finding to inconsistent status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.UnindexedTrackedFile,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.TrackedFiles,
      }),
    ]);
    expect(report.status).toBe(IndexConsistencyStatus.Inconsistent);
  });

  it('maps orphan bm25 entry finding to inconsistent status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.OrphanBm25Entry,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.Bm25,
      }),
    ]);
    expect(report.status).toBe(IndexConsistencyStatus.Inconsistent);
  });

  it('maps missing vector entry finding to inconsistent status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.MissingVectorEntry,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.Vector,
      }),
    ]);
    expect(report.status).toBe(IndexConsistencyStatus.Inconsistent);
  });

  it('maps corrupt index metadata finding to inconsistent status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.CorruptIndexMetadata,
        severity: IndexConsistencySeverity.Error,
        component: IndexConsistencyComponent.Metadata,
      }),
    ]);
    expect(report.status).toBe(IndexConsistencyStatus.Inconsistent);
  });

  it('maps untracked markdown finding to inconsistent status', () => {
    const report = IndexConsistencyReport.fromFindings([
      finding({
        type: IndexConsistencyFindingType.UntrackedMarkdown,
        severity: IndexConsistencySeverity.Warning,
        component: IndexConsistencyComponent.TrackedFiles,
      }),
    ]);
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
