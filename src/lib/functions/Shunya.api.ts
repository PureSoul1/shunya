export const wakeUpServer = async () => {
  try {
    await fetch('https://shunya-backend-hotc.onrender.com/api/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
  }
};

export async function shouldUseShunyaAPI(): Promise<boolean> {
  return false;
}

// ⚡ MAGIC FUNCTION: Backend se latest models fetch karega
export const fetchLatestModels = async () => {
  try {
    const response = await fetch('https://shunya-backend-hotc.onrender.com/api/config/models');
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