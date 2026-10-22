// Rewrites the Homebrew cask and the Scoop manifest for a published release.
//
//   node scripts/update-manifests.mjs v0.2.0 <dir with release assets>
//
// GITHUB_REPOSITORY (owner/name) is set by GitHub Actions; pass it yourself when running locally.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [tag, assetsDir] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
if (!tag || !assetsDir || !repo) {
  console.error('usage: GITHUB_REPOSITORY=owner/name node scripts/update-manifests.mjs <tag> <assets dir>');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
const files = readdirSync(assetsDir);
const sha256 = (name) => createHash('sha256').update(readFileSync(join(assetsDir, name))).digest('hex');
const find = (re) => {
  const name = files.find((f) => re.test(f));
  if (!name) throw new Error(`no asset matching ${re} in ${assetsDir}: ${files.join(', ')}`);
  return name;
};

const v = version.replace(/\./g, '\\.');
const dmg = find(new RegExp(`_${v}_universal\\.dmg$`));
const zip = find(new RegExp(`_${v}_x64_portable\\.zip$`));
const base = `https://github.com/${repo}`;

const cask = `cask "slovarik" do
  version "${version}"
  sha256 "${sha256(dmg)}"

  url "${base}/releases/download/v#{version}/Slovarik_#{version}_universal.dmg"
  name "Slovarik"
  desc "Flashcards for German vocabulary with automatic explanations and translations"
  homepage "${base}"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :monterey"

  app "Slovarik.app"

  # Builds are not notarized by Apple, so Gatekeeper would refuse to open them.
  # Removing the quarantine flag is what "Open Anyway" in System Settings does.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Slovarik.app"]
  end

  zap trash: [
    "~/Library/Application Support/io.slovarik.desktop",
    "~/Library/Caches/io.slovarik.desktop",
    "~/Library/WebKit/io.slovarik.desktop",
  ]
end
`;

const scoop = {
  version,
  description: 'Flashcards for German vocabulary with automatic explanations and translations',
  homepage: base,
  license: 'MIT',
  notes: 'Uses the Microsoft Edge WebView2 runtime, which ships with Windows 10 and 11.',
  architecture: {
    '64bit': {
      url: `${base}/releases/download/v${version}/${zip}`,
      hash: sha256(zip),
    },
  },
  shortcuts: [['slovarik.exe', 'Slovarik']],
  checkver: { github: base },
  autoupdate: {
    architecture: {
      '64bit': { url: `${base}/releases/download/v$version/Slovarik_$version_x64_portable.zip` },
    },
  },
};

writeFileSync('Casks/slovarik.rb', cask);
writeFileSync('bucket/slovarik.json', JSON.stringify(scoop, null, 2) + '\n');
console.log(`Updated manifests to ${version}`);
