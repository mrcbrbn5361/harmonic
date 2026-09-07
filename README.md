# Harmonic v1.0.0

**⚠️ WORK IN PROGRESS - β Sürüm**

**Premium music streaming experience for Windows 11**

<sub>Proje henüz tamamlama aşamasında. Beklenmedik davranışlar, eksik özellikler veya hatalar olabilir. Katkılar ve özelleştirmeler memmunedir.</sub>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/harmonic-app/harmonic/blob/main/LICENSE)
[![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-blue.svg)](https://github.com/harmonic-app/harmonic/)

## Overview

Harmonic is a professional-grade Electron desktop application that provides YouTube Music integration with a polished, native-like desktop experience. This release marks the first stable 1.0.0 version with production-ready features.

## Key Features

### Music Playback
- **High-quality audio streaming** from YouTube Music via the official API
- **Background playback** - continue listening while using other apps
- **Playback controls** - play, pause, skip, seek, volume control
- **Ad skipping** - automatically skip YouTube ads
- **Queue management** - add songs to playback queue

### Library Management
- **Full library access** - songs, albums, artists, playlists
- **Liked songs** - view and manage your liked tracks
- **Playlist creation** - create and manage custom playlists
- **Recently played** - history of played tracks
- **Search** - find music by title, artist, or album

### User Authentication
- **Google OAuth 2.0** - secure sign-in with Google accounts
- **YouTube Music cookie import** - transfer cookies from Chrome browser
- **Persistent login** - sessions persist across app restarts
- **Account profile** - display user name and picture

### Discord Rich Presence
- **Dynamic presence** - shows current song playing
- **Custom buttons** - link to YouTube Music
- **Gateway fallback** - reliable connection with reconnection support
- **Cover art** - album artwork in Discord status

### Professional Features (v1.0.0)
- **Auto-update** - automatic update checking and installation
- **Crash reporting** - error tracking and reporting
- **Configurable OAuth** - update Google Client ID/Secret via settings
- **Settings export/import** - backup and restore preferences
- **Portable mode** - supports portable installation
- **Theme support** - dark, light, and system themes
- **Accessibility** - high contrast modes, screen reader support

## Project Structure

```
harmonic/
├── desktop/              # Electron desktop application
│   ├── src/main/         # Main process (API, store, window management)
│   │   ├── api/          # YouTube Music API clients
│   │   ├── auth/         # Authentication (Google, YouTube Music)
│   │   ├── main.ts       # Entry point, auto-update, IPC handlers
│   │   └── utils/        # Utilities (store, Discord RPC, gateway)
│   ├── src/renderer/     # Renderer process (HTML, CSS, TypeScript)
│   ├── package.json      # Electron app configuration
│   └── vite.config.ts   # Vite development config
├── website/              # Marketing website (5 pages)
│   ├── index.html        # Home page
│   ├── features.html     # Features page
│   ├── download.html   # Download page
│   └── sss.html          # SSS/FAQ page
│   └── vite.config.js   # Vite config
├── package.json          # Root workspace config
├── LICENSE               # MIT License
└── README.md             # This file
```

## Installation

```bash
# Install dependencies
npm install

# Start development mode
npm run dev

# Build Windows installer
npm run build:installer

# Build portable version
npm run build:portable
```

## Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development (Electron + Vite dev server) |
| `npm run build` | Build Electron app |
| `npm run build:website` | Build static website |
| `npm run build:installer` | Build NSIS installer |
| `npm run build:win` | Build Windows installer |
| `npm run typecheck` | Run TypeScript type checking |

### Adding New Features

1. **API Endpoints** - Add new methods in `desktop/src/main/api/innertube.ts`
2. **Auth Flow** - Implement authentication in `desktop/src/main/auth/`
3. **Renderer UI** - Create new pages in `desktop/src/renderer/`
4. **IPC Handlers** - Add handlers in `desktop/src/main/main.ts`
5. **Store Data** - Manage state in `desktop/src/main/utils/store.ts`

## Known Improvements (v1.0.0)

This release includes significant stability and professional improvements:

- **Fixed YouTube API search suggestions** - robust parsing with fallback strategies
- **Fixed player stream URL retrieval** - reliable audio format extraction
- **Fixed profile fetching** - resolved "accountItem bulunamadı" error
- **Improved Discord gateway stability** - 10 attempt reconnection with exponential backoff
- **Enhanced polling stability** - reduced frequency, state change detection
- **Configurable OAuth credentials** - update via settings UI
- **Auto-update mechanism** - check and install updates automatically
- **TypeScript clean compile** - zero type errors

## License

MIT License - Copyright (c) 2026 Harmonic Team

## Katkıda Bulunma & Özelleştirme

Bu proje açık kaynaklı olup, kişisel kullanım, fork'lenme ve özelleştirme özelliği taşır. Projeyi kendi ihtiyaçlarınıza göre düzenleyebilirsiniz:

- `desktop/src/renderer/` içinde UI değişiklikleri yapabilirsiniz
- `desktop/src/main/` içinde API ve auth flow'ları özelleştirebilirsiniz
- `website/` klasöründeki HTML/CSS sayfaları kendi taramanız için uyarlanabilir
- `package.json` workspace'lar ve script'ler projenizin ihtiyaçlarına göre yeniden yapılandırılabilir

Projeye katkıda bulunmak veya bug raporu vermek için [GitHub Issues](https://github.com/harmonic-app/harmonic/issues) sayfasına göz atabilirsiniz.

<sub>Bu README, projenin "WORK IN PROGRESS" olarak işaretlenmesi amacıyla güncellenmiştir. Proje henüz tam olarak test edilmemiş ve tüm özelliklerinin eksik olabileceği bir aşamada bulunuyor.</sub>

## Contact

- GitHub: [https://github.com/harmonic-app/harmonic](https://github.com/harmonic-app/harmonic)
- Issues: [https://github.com/harmonic-app/harmonic/issues](https://github.com/harmonic-app/harmonic/issues)