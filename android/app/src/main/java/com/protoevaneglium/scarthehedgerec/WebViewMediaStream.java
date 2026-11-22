package com.protoevaneglium.scarthehedgerec;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Adapts a whole asset to WebView's own range seek, then bounds the response. */
public final class WebViewMediaStream extends FilterInputStream {
    private final long total;
    private boolean atOrigin = true;
    public WebViewMediaStream(InputStream source, AssetRequest.ByteRange range) {
        super(new LimitedInputStream(source, range.start + range.length));
        total = range.total;
    }
    @Override public int available() throws IOException {
        // Chromium InputStreamReader verifies ranges against available() before
        // seeking the supplied stream itself. It needs the whole resource size,
        // including for suffix requests; pre-seeking here would seek twice.
        // https://chromium.googlesource.com/chromium/src/+/124.0.6367.219/components/embedder_support/android/util/input_stream_reader.cc
        return atOrigin ? (int)Math.min(Integer.MAX_VALUE, total) : in.available();
    }
    @Override public long skip(long count) throws IOException {
        long skipped = in.skip(count); if (skipped > 0) atOrigin = false; return skipped;
    }
    @Override public int read() throws IOException { atOrigin = false; return in.read(); }
    @Override public int read(byte[] bytes, int offset, int count) throws IOException {
        if (count > 0) atOrigin = false;
        return in.read(bytes, offset, count);
    }
    @Override public boolean markSupported() { return false; }
    @Override public synchronized void mark(int limit) {}
    @Override public synchronized void reset() throws IOException { throw new IOException("Media stream does not support reset"); }
}
