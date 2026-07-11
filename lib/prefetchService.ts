import * as FileSystem from 'expo-file-system/legacy';
// Removed direct import to use dynamic require for Expo Go compat

// Keep track of what we've already fetched to avoid duplicate downloads
const prefetchedUrls = new Set<string>();

export async function smartPrefetchPDFs(urls: string[]) {
  if (!urls || urls.length === 0) return;

  try {
    let Network: any;
    try {
      Network = require('expo-network');
    } catch (e) {
      console.log('[Ghost Downloader] expo-network not available. Assuming Wi-Fi.');
    }

    let isWifi = true; // Default to true if network module fails
    if (Network) {
      const networkState = await Network.getNetworkStateAsync();
      // Only prefetch if we have internet
      if (!networkState.isConnected || !networkState.isInternetReachable) {
        return;
      }
      isWifi = networkState.type === Network.NetworkStateType.WIFI;
    }

    // Senior Rule: If Wi-Fi, fetch up to 3 PDFs. If Cellular, only fetch the first one.
    // The user requested Top 3 most recent posts + Smart Caching.
    const urlsToFetch = isWifi ? urls.slice(0, 3) : urls.slice(0, 1);

    for (const url of urlsToFetch) {
      if (!url || prefetchedUrls.has(url)) continue;

      // Ensure it's a PDF or cacheable document
      if (url.includes('.pdf') || url.includes('.doc')) {
        const filename = url.split('/').pop() || 'temp.pdf';
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;

        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        
        if (!fileInfo.exists) {
          // In a real advanced binary streaming setup, you could use FileSystem.createDownloadResumable 
          // and stop after 50KB for cellular. Here, we'll download the whole file but strictly limit the number of files.
          console.log(`[Ghost Downloader] Pre-fetching ${filename} (Network: ${isWifi ? 'Wi-Fi' : 'Cellular'})`);
          
          FileSystem.downloadAsync(url, fileUri).then(({ uri }) => {
            console.log(`[Ghost Downloader] Cached at ${uri}`);
            prefetchedUrls.add(url);
          }).catch(err => {
            console.warn('[Ghost Downloader] Failed:', err);
          });
        } else {
          prefetchedUrls.add(url);
        }
      }
    }
  } catch (error) {
    console.warn('[Ghost Downloader] Error:', error);
  }
}
