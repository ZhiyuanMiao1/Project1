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

const patches = [
  {
    description: 'broken getAdapt fallback',
    broken:
      'fetch(e._apiManager.getAdapt(e.authInfo.gslb)+o,{body:i,method:"POST"})',
    fixed:
      'fetch(e._apiManager.getAdaptUrl(e._authInfo.gslb)+o,{body:i,method:"POST"})',
  },
  {
    description: 'missing _stopRequest helper in STS retry flow',
    broken:
      'e._stopRequest(),e._requestStsToken()',
    fixed:
      'e._requesting=!1,e._stopDelayTimer(),e._requestStsToken()',
  },
];

if (!fs.existsSync(sdkBundlePath)) {
  console.warn(`[patchAliyunWebrtcSdk] SDK bundle not found: ${sdkBundlePath}`);
  process.exit(0);
}

let bundle = fs.readFileSync(sdkBundlePath, 'utf8');
let appliedCount = 0;

patches.forEach(({ description, broken, fixed }) => {
  if (bundle.includes(fixed) && !bundle.includes(broken)) return;
  if (!bundle.includes(broken)) {
    console.warn(`[patchAliyunWebrtcSdk] Expected SDK snippet not found for ${description}; skipping.`);
    return;
  }

  bundle = bundle.replace(broken, fixed);
  appliedCount += 1;
});

if (appliedCount === 0) {
  console.log('[patchAliyunWebrtcSdk] SDK bundle already patched.');
  process.exit(0);
}

fs.writeFileSync(sdkBundlePath, bundle, 'utf8');
console.log(`[patchAliyunWebrtcSdk] Applied ${appliedCount} patch(es) to aliyun-webrtc-sdk.`);
