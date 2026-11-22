package com.protoevaneglium.scarthehedgerec;
public final class AssetRequestCheck {
    static void check(boolean ok) { if (!ok) throw new AssertionError(); }
    public static void main(String[] args) throws Exception {
        check("game/index.html".equals(AssetRequest.assetPath("https://appassets.androidplatform.net/assets/game/index.html?stage=z2_act3")));
        for (String path : new String[] {"http://appassets.androidplatform.net/assets/game/index.html", "https://evil.test/assets/game/index.html",
                "https://appassets.androidplatform.net/assets/game/%2e%2e/secrets", "https://appassets.androidplatform.net/assets/game/../secrets",
                "https://appassets.androidplatform.net/assets/game/a%5cb", "https://user@appassets.androidplatform.net/assets/game/index.html",
                "https://appassets.androidplatform.net:8080/assets/game/index.html", "https://appassets.androidplatform.net/assets/game/a%00b", "%%%"}) check(AssetRequest.assetPath(path) == null);
        long[][] cases = {{0, 99, 100}, {90, 99, 10}, {99, 99, 1}, {0, 99, 100}};
        String[] values = {"bytes=0-99", "bytes=-10", "bytes=99-", "bytes=0-999"};
        for (int i=0;i<values.length;i++) { AssetRequest.ByteRange r = AssetRequest.range(values[i], 100); check(r.status == 206 && r.start == cases[i][0] && r.length == cases[i][2]); }
        for (String value : new String[] {"bytes=100-", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=1-2,5-6", "bytes=999999999999999999999-", "nope"}) check(AssetRequest.range(value, 100).status == 416);
        check(AssetRequest.range(null, 100).status == 200 && AssetRequest.range(null, 100).length == 100);
        check(AssetRequest.range("bytes=0-", 0).status == 416);
        byte[] source = new byte[100];
        for (int i=0;i<source.length;i++) source[i]=(byte)i;
        LimitedInputStream limited = new LimitedInputStream(new java.io.ByteArrayInputStream(source), 16);
        check(limited.available() == 16 && limited.skip(100) == 16 && limited.available() == 0 && limited.read() == -1);
        limited.close();
        limited = new LimitedInputStream(new java.io.ByteArrayInputStream(source), 16);
        check(limited.read(new byte[50], 0, 50) == 16 && limited.read() == -1 && limited.skip(1) == 0);
        check(limited.read(new byte[0], 0, 0) == 0 && !limited.markSupported());
        boolean resetFailed = false;
        try { limited.reset(); } catch (java.io.IOException expected) { resetFailed = true; }
        check(resetFailed); limited.close();
        for (String value : new String[] {"bytes=0-19", "bytes=4-19", "bytes=-16", "bytes=99-", "bytes=0-999"}) {
            AssetRequest.ByteRange range = AssetRequest.range(value, source.length);
            WebViewMediaStream stream = new WebViewMediaStream(new java.io.ByteArrayInputStream(source), range);
            check(stream.available() == source.length); // Chromium's bounds check.
            if (range.start > 0) check(stream.skip(range.start) == range.start); // Chromium's seek.
            byte[] result = stream.readAllBytes();
            check(result.length == range.length);
            for (int i=0;i<result.length;i++) check(result[i] == source[(int)range.start+i]);
            check(stream.read() == -1 && stream.skip(1) == 0 && stream.available() == 0);
            stream.close();
        }
        int boundaries = 0;
        for (int length=1;length<1000;length++) for (int offset=0;offset<length;offset+=17) {
            AssetRequest.ByteRange r = AssetRequest.range("bytes="+offset+"-", length);
            check(r.status == 206 && r.start >= 0 && r.length > 0 && r.start+r.length == length);
            boundaries++;
        }
        System.out.println("Android asset path/range checks passed, including " + boundaries + " range boundaries.");
    }
}
