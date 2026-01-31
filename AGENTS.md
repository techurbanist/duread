# Agent Notes for DuRead

## Version Updates

When making changes to the app, you must update version numbers in **two places**:

1. **`app.js`** (line 4) - Update `APP_VERSION` constant
   ```javascript
   const APP_VERSION = '1.2.0';
   ```

2. **`sw.js`** (line 2) - Bump the cache version number
   ```javascript
   const CACHE_NAME = 'duread-v4';
   ```

Both must be updated for users to see the new version. The service worker cache version forces browsers to fetch fresh files instead of serving stale cached content.

## Architecture Notes

- Single-page PWA with no backend
- API key encrypted with user passphrase and stored in IndexedDB
- Session token cached in sessionStorage to avoid repeated unlocking
- Service worker provides offline caching with cache-first strategy for static assets
- Translations processed sequentially (one at a time) via queue to avoid overwhelming the API
