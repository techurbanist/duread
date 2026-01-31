# DuRead - Chinese Reading Helper

A Progressive Web App (PWA) for learning Chinese through reading content you already consume. Share articles, messages, or any text from other apps and get AI-powered translations with word-by-word breakdowns, pinyin, and pronunciation.

## About This Project

This is a personal project created to explore and test [Claude Code](https://github.com/anthropics/claude-code), Anthropic's AI-powered coding assistant. The app itself is fully functional and designed for practical daily use in learning Chinese.

## Features

- **Bidirectional Translation** - Translate English to Chinese or Chinese to English
- **Word-by-Word Breakdown** - See each word with pinyin, meaning, and character analysis
- **Text-to-Speech** - Hear Chinese pronunciation at a learner-friendly pace
- **Share Target** - Share text or URLs directly from other apps (Android/iOS)
- **Article Extraction** - Share a URL and automatically extract the article content
- **Offline Support** - Works without internet after initial load
- **Privacy-Focused** - Your API key is encrypted and stored locally; no data leaves your device except for translation requests

## How It Works

1. Install the app on your device (or use it in a browser)
2. Enter your Anthropic API key in Settings (encrypted locally)
3. Paste text or share content from another app
4. Get translations with detailed word breakdowns

When you share an article URL, DuRead fetches the content, extracts the main text, and prepares it for translation. Sentences are translated one at a time as you scroll, making it easy to read at your own pace.

## Installation

### As a PWA (Recommended)

1. Visit the deployed app in your browser
2. Click "Add to Home Screen" or "Install" when prompted
3. The app will be available as a standalone application

### Local Development

```bash
# Clone the repository
git clone https://github.com/techurbanist/duread.git
cd duread

# Serve locally (any static server works)
python -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` in your browser.

## Configuration

### API Key Setup

1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Open Settings in the app
3. Enter your API key and create a passphrase
4. Your key is encrypted with AES-256-GCM and stored locally

The app uses Claude Haiku for fast, cost-effective translations.

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **AI**: Anthropic Claude API (Haiku model)
- **Storage**: IndexedDB with Web Crypto API encryption
- **Speech**: Web Speech API for text-to-speech
- **Caching**: Service Worker for offline support
- **Deployment**: GitHub Pages

## Project Structure

```
duread/
├── index.html      # Main HTML with embedded styles
├── app.js          # Application logic
├── sw.js           # Service worker for offline caching
├── manifest.json   # PWA manifest with share target config
├── icon-192.svg    # App icon (192x192)
├── icon-512.svg    # App icon (512x512)
├── AGENTS.md       # Development notes
└── .github/
    └── workflows/
        └── deploy.yml  # GitHub Pages deployment
```

## Deployment

The app deploys automatically to GitHub Pages on push to the main branch via GitHub Actions.

To deploy your own instance:

1. Fork this repository
2. Enable GitHub Pages in repository settings
3. Push to main branch

## Version Updates

When updating the app version:

1. Update `APP_VERSION` in `app.js` (line 4)
2. Update `CACHE_NAME` in `sw.js` (line 2)

Both must be updated to ensure users receive the new version.

## Privacy & Security

- API keys are encrypted using PBKDF2 (100,000 iterations) + AES-256-GCM
- Encrypted keys are stored in IndexedDB, never transmitted
- Session tokens are cached only in sessionStorage (cleared on tab close)
- All processing happens client-side except translation API calls
- No analytics or tracking

## License

MIT License - feel free to use, modify, and distribute.

## Acknowledgments

- Built with assistance from [Claude Code](https://github.com/anthropics/claude-code)
- Translations powered by [Anthropic Claude](https://www.anthropic.com/)
- Fonts: [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC), [Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC), [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
