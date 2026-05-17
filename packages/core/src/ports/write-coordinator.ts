export interface WriteOperation {
  name: string;
}

export interface IWriteCoordinator {
  runExclusive<T>(operation: WriteOperation, work: () => Promise<T>): Promise<T>;
}
