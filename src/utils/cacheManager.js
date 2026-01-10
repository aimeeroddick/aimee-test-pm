// Cache Manager - handles clearing all caches for fresh updates

export const CACHE_VERSION = '2.23.1' // Increment when icons/assets change

/**
 * Clear all caches - service worker, browser cache, localStorage cache flags
 */
export async function clearAllCaches() {
  const results = {
    serviceWorker: false,
    cacheStorage: false,
    localStorage: false
  }

  // 1. Clear Cache Storage (service worker caches)
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))
      results.cacheStorage = true
      console.log('[CacheManager] Cleared cache storage:', cacheNames)
    } catch (err) {
      console.error('[CacheManager] Failed to clear cache storage:', err)
    }
  }

  // 2. Unregister and re-register service worker
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        await registration.unregister()
      }
      results.serviceWorker = true
      console.log('[CacheManager] Unregistered service workers')
    } catch (err) {
      console.error('[CacheManager] Failed to unregister service worker:', err)
    }
  }

  // 3. Clear cache-related localStorage items (not user data)
  try {
    const cacheKeys = ['pwaInstalled', 'pwaPromptDismissed', 'sw-version']
    cacheKeys.forEach(key => localStorage.removeItem(key))
    localStorage.setItem('cache-cleared-at', new Date().toISOString())
    results.localStorage = true
    console.log('[CacheManager] Cleared localStorage cache flags')
  } catch (err) {
    console.error('[CacheManager] Failed to clear localStorage:', err)
  }

  return results
}

/**
 * Force reload the page bypassing cache
 */
export function hardReload() {
  // Clear caches then reload
  clearAllCaches().then(() => {
    // Use cache-busting reload
    window.location.href = window.location.href.split('?')[0] + '?cache=' + Date.now()
  })
}

/**
 * Check if a cache clear is needed (e.g., after version update)
 */
export function checkCacheVersion() {
  const storedVersion = localStorage.getItem('app-cache-version')
  if (storedVersion !== CACHE_VERSION) {
    console.log('[CacheManager] Version changed, clearing caches...')
    clearAllCaches().then(() => {
      localStorage.setItem('app-cache-version', CACHE_VERSION)
    })
    return true
  }
  return false
}

/**
 * Initialize cache management on app load
 */
export function initCacheManager() {
  // Check version on load
  checkCacheVersion()

  // Listen for service worker updates
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available - could show a toast here
              console.log('[CacheManager] New version available')
            }
          })
        }
      })
    })
  }
}
