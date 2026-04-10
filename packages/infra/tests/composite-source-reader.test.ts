import { describe, it, expect, vi } from 'vitest';
import { CompositeSourceReader } from '../src/composite-source-reader.js';
import { SourceParseError, type ISourceReader, type SourceContent } from '@llm-wiki/core';

function mkContent(uri: string, content = 'x'): SourceContent {
  return { uri, content, bytes: content.length, estimatedTokens: 1 };
}

function stubReader(label: string): ISourceReader & { spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(async (uri: string) => mkContent(`${label}:${uri}`));
  return { read: spy, spy } as unknown as ISourceReader & {
    spy: ReturnType<typeof vi.fn>;
  };
}

describe('CompositeSourceReader', () => {
  it('test_read_httpsUri_routedToHttpReader', async () => {
    const fs = stubReader('fs');
    const http = stubReader('http');
    const composite = new CompositeSourceReader(fs, http);

    const result = await composite.read('https://example.com/docs.md');
    expect(http.spy).toHaveBeenCalledWith('https://example.com/docs.md');
    expect(fs.spy).not.toHaveBeenCalled();
    expect(result.uri).toBe('http:https://example.com/docs.md');
  });

  it('test_read_httpUri_routedToHttpReader', async () => {
    const fs = stubReader('fs');
    const http = stubReader('http');
    const composite = new CompositeSourceReader(fs, http);

    await composite.read('http://example.com/docs.md');
    expect(http.spy).toHaveBeenCalledWith('http://example.com/docs.md');
    expect(fs.spy).not.toHaveBeenCalled();
  });

  it('test_read_fileUri_routedToFsReader', async () => {
    const fs = stubReader('fs');
    const http = stubReader('http');
    const composite = new CompositeSourceReader(fs, http);

    await composite.read('file:///tmp/foo.md');
    expect(fs.spy).toHaveBeenCalledWith('file:///tmp/foo.md');
    expect(http.spy).not.toHaveBeenCalled();
  });

  it('test_read_plainPath_routedToFsReader', async () => {
    const fs = stubReader('fs');
    const http = stubReader('http');
    const composite = new CompositeSourceReader(fs, http);

    await composite.read('/tmp/foo.md');
    expect(fs.spy).toHaveBeenCalledWith('/tmp/foo.md');
    expect(http.spy).not.toHaveBeenCalled();
  });

  it('test_read_unknownScheme_throwsSourceParseError', async () => {
    const fs = stubReader('fs');
    const http = stubReader('http');
    const composite = new CompositeSourceReader(fs, http);

    await expect(composite.read('ftp://example.com/foo')).rejects.toBeInstanceOf(
      SourceParseError,
    );
  });
});
