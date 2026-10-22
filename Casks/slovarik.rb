cask "slovarik" do
  version "0.1.0"
  sha256 "466832cf0c75f1ec92fd8b801b3c0ffcb11ffdb33a864e00ad52d7134ea5166e"

  url "https://github.com/NellleT/Slovarik/releases/download/v#{version}/Slovarik_#{version}_universal.dmg"
  name "Slovarik"
  desc "Flashcards for German vocabulary with automatic explanations and translations"
  homepage "https://github.com/NellleT/Slovarik"

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
