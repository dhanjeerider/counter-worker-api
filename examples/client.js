const API_URL = "https://YOUR-WORKER.workers.dev";
const API_KEY = "YOUR_API_KEY";

async function counterRequest(path, method = "GET", body) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || `Request failed: ${response.status}`);
  }
  return result.data;
}

export const getCounter = () => counterRequest("/api/counter");
export const incrementCounter = (by = 1) => counterRequest("/api/counter/increment", "POST", { by });
export const decrementCounter = (by = 1) => counterRequest("/api/counter/decrement", "POST", { by });
export const resetCounter = () => counterRequest("/api/counter/reset", "POST");
