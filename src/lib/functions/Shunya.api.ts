const BACKEND = 'https://api.agenticfoxlabs.com';

// Retry with exponential backoff — Render cold start = 30-50 seconds
const fetchWithRetry = async (url: string, options: RequestInit = {}, retries = 3, baseDelay = 3000): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(20000),
      });
      return res;
    } catch (err) {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, baseDelay * (i + 1)));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
};

export const wakeUpServer = async () => {
  try {
    await fetchWithRetry(`${BACKEND}/api/health`, { method: 'GET' }, 3, 5000);
  } catch {
    // Silent — server might still accept requests
  }
};

export async function shouldUseShunyaAPI(): Promise<boolean> {
  try {
    const hasLicense = localStorage.getItem("active_license") === "true";
    const apiEnabled = localStorage.getItem("shunya_api_enabled") === "true";
    return hasLicense && apiEnabled;
  } catch {
    return false;
  }
}

export async function fetchAndUpdateModels() {
  try {
    const res = await fetchWithRetry(`${BACKEND}/api/config/models`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ⚡ MAGIC FUNCTION: Backend se latest models fetch karega
export const fetchLatestModels = async () => {
  try {
    const response = await fetchWithRetry(`${BACKEND}/api/config/models`);
    if (response.ok) {
      const latestModels = await response.json();
      console.log("✅ Shunya: Latest AI Models fetched from server!");
      return latestModels;
    }
  } catch (error) {
    console.log("⚠️ Shunya: Using default models (Backend sleeping).");
  }
  return null;
};