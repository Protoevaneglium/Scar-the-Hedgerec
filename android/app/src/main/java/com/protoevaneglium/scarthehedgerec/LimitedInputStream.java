package com.protoevaneglium.scarthehedgerec;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

/** A media range must remain bounded through reads, skip and available alike. */
public final class LimitedInputStream extends FilterInputStream {
    private long remaining;
    public LimitedInputStream(InputStream input, long length) {
        super(input);
        if (length < 0) throw new IllegalArgumentException("Negative range length");
        remaining = length;
    }
    @Override public int read() throws IOException {
        if (remaining <= 0) return -1;
        int value = in.read(); if (value >= 0) remaining--; else remaining = 0;
        return value;
    }
    @Override public int read(byte[] buffer, int offset, int count) throws IOException {
        if (buffer == null) throw new NullPointerException();
        if (offset < 0 || count < 0 || count > buffer.length - offset) throw new IndexOutOfBoundsException();
        if (count == 0) return 0;
        if (remaining <= 0) return -1;
        int read = in.read(buffer, offset, (int)Math.min(count, remaining));
        if (read > 0) remaining -= read; else if (read < 0) remaining = 0;
        return read;
    }
    @Override public long skip(long count) throws IOException {
        if (count <= 0 || remaining <= 0) return 0;
        long skipped = in.skip(Math.min(count, remaining)); remaining -= skipped; return skipped;
    }
    @Override public int available() throws IOException { return (int)Math.min(remaining, in.available()); }
    @Override public boolean markSupported() { return false; }
    @Override public synchronized void mark(int limit) {}
    @Override public synchronized void reset() throws IOException { throw new IOException("Media range does not support reset"); }
}
