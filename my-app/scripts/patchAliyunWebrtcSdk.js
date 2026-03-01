const fs = require('fs');
const path = require('path');

const sdkBundlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'aliyun-webrtc-sdk',
  'dist',
  'aliyun-webrtc-sdk.js'
);

const brokenSnippet =
  'fetch(e._apiManager.getAdapt(e.authInfo.gslb)+o,{body:i,method:"POST"})';
const fixedSnippet =
  'fetch(e._apiManager.getAdaptUrl(e._authInfo.gslb)+o,{body:i,method:"POST"})';

if (!fs.existsSync(sdkBundlePath)) {
  console.warn(`[patchAliyunWebrtcSdk] SDK bundle not found: ${sdkBundlePath}`);
  process.exit(0);
}

const bundle = fs.readFileSync(sdkBundlePath, 'utf8');

if (bundle.includes(fixedSnippet) && !bundle.includes(brokenSnippet)) {
  console.log('[patchAliyunWebrtcSdk] SDK bundle already patched.');
  process.exit(0);
}

if (!bundle.includes(brokenSnippet)) {
  console.warn('[patchAliyunWebrtcSdk] Expected SDK snippet not found; skipping patch.');
  process.exit(0);
}

const patchedBundle = bundle.replace(brokenSnippet, fixedSnippet);
fs.writeFileSync(sdkBundlePath, patchedBundle, 'utf8');

console.log('[patchAliyunWebrtcSdk] Patched broken getAdapt fallback in aliyun-webrtc-sdk.');
