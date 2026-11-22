package com.protoevaneglium.scarthehedgerec;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure-Java path/range validation, also tested outside Android. */
public final class AssetRequest {
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private AssetRequest() {}
    public static String assetPath(String url) {
        try {
            URI uri = URI.create(url);
            if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())
                    || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/game/") || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) return null;
            for (String part : path.split("/")) if (part.equals("..") || part.equals(".")) return null;
            return path.substring("/assets/".length());
        } catch (IllegalArgumentException error) { return null; }
    }
    public static final class ByteRange {
        public final int status;
        public final long start, length, total;
        ByteRange(int status, long start, long length, long total) {
            this.status = status; this.start = start; this.length = length; this.total = total;
        }
        public String contentRange() { return status == 416 ? "bytes */" + total : "bytes " + start + "-" + (start + length - 1) + "/" + total; }
    }
    public static ByteRange range(String value, long total) {
        if (total < 0) throw new IllegalArgumentException("Unknown asset length");
        if (value == null) return new ByteRange(200, 0, total, total);
        try {
            Matcher match = RANGE.matcher(value.trim());
            if (!match.matches() || (match.group(1).isEmpty() && match.group(2).isEmpty()) || total == 0) throw new IllegalArgumentException();
            long start, end;
            if (match.group(1).isEmpty()) {
                long suffix = Long.parseLong(match.group(2));
                if (suffix <= 0) throw new IllegalArgumentException();
                start = Math.max(0, total - suffix); end = total - 1;
            } else {
                start = Long.parseLong(match.group(1));
                end = match.group(2).isEmpty() ? total - 1 : Math.min(Long.parseLong(match.group(2)), total - 1);
                if (start >= total || end < start) throw new IllegalArgumentException();
            }
            return new ByteRange(206, start, end - start + 1, total);
        } catch (IllegalArgumentException error) { return new ByteRange(416, 0, 0, total); }
    }
}
