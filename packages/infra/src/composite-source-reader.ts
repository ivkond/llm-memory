import {
  SourceParseError,
  type ISourceReader,
  type SourceContent,
} from '@llm-wiki/core';

/**
 * Dispatches `ISourceReader.read(uri)` to either a filesystem reader or an
 * HTTP reader based on the URI scheme:
 *
 *   - `http://`  / `https://`  -> HTTP reader
 *   - `file://`                -> filesystem reader
 *   - bare absolute/relative path -> filesystem reader
 *   - anything else              -> SourceParseError
 *
 * Wiring code builds one of these, passes it to `IngestService`, and the
 * service never has to care which backing adapter handles a particular
 * source.
 */
export class CompositeSourceReader implements ISourceReader {
  constructor(
    private readonly fsReader: ISourceReader,
    private readonly httpReader: ISourceReader,
  ) {}

  async read(uri: string): Promise<SourceContent> {
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return this.httpReader.read(uri);
    }
    if (uri.startsWith('file://')) {
      return this.fsReader.read(uri);
    }
    // Reject anything that *looks* like a URI scheme (e.g. `ftp://`,
    // `s3://`) — we only want to fall through to the filesystem for bare
    // paths. The regex matches the RFC-3986 scheme shape.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) {
      throw new SourceParseError(uri, 'unsupported source scheme');
    }
    return this.fsReader.read(uri);
  }
}
