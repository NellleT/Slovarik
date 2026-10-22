# Slovarik (Wortschätzli)

Anki-style flashcards for German vocabulary. Type a word and Slovarik fills in the rest: a German definition, the article, the forms, an example sentence, and English and Russian translations. Reviews are scheduled with FSRS, the same algorithm modern Anki uses.

![Review card](docs/review-light.png)

## Install

**macOS** — with Homebrew:

```bash
brew tap NellleT/slovarik https://github.com/NellleT/Slovarik
brew install --cask slovarik
```

**Windows** — download `Slovarik_*_x64-setup.exe` from the [latest release](https://github.com/NellleT/Slovarik/releases/latest), or use [Scoop](https://scoop.sh) (Homebrew doesn't run on Windows):

```bash
scoop bucket add slovarik https://github.com/NellleT/Slovarik
scoop install slovarik
```

Update with `brew upgrade --cask slovarik` or `scoop update slovarik`.

> The app isn't signed with a paid Apple Developer certificate, so the Homebrew cask clears the quarantine flag after installing. Otherwise macOS would refuse to open it.

## How it works

- **Adding words.** Type a word — with its article if you like (“die Bank”), or with “sich”. Everything comes from the German [Wiktionary](https://de.wiktionary.org). If Wiktionary has no translation, MyMemory fills it in. You can edit any field before saving. Inflected forms lead back to the dictionary form: “Häuser” → *das Haus*, “lief” → *laufen*. You can also paste a whole list of words at once.
- **Reviewing.** A card shows the word; press Space to see the answer. Then rate how well you remembered it: Again, Hard, Good or Easy (keys 1–4). FSRS uses that rating to decide when you'll see the word next: in minutes, days or months.
- **Gender by color:** *der* is blue, *die* is red, *das* is green. You can hide the article on the front of the card and recall it yourself.
- **Also included:** reverse cards (Russian → German), pronunciation with the system voice, stats, and light and dark themes.
- **Interface language:** English, Deutsch or Русский — switch it in Settings.
- **Your data stays on your computer**, in a single `slovarik.json` file with a daily backup next to it. Export and import as JSON or CSV.

![Adding a word](docs/add-dark.png)

## Building from source

You need Node.js 20+ and [Rust](https://rustup.rs).

```bash
npm install
npm run tauri dev     # run the app
npm test              # tests
npm run tauri build   # build an installer
```

To release a new version, run `npm version 0.2.0 && git push --follow-tags`. GitHub Actions builds the macOS and Windows apps, publishes the release and updates the Homebrew and Scoop manifests.

The code is MIT-licensed. Wiktionary content is available under CC BY-SA 4.0.
