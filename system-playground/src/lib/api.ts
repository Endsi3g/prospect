const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/proxy";
const API_BASE_URL = RAW_BASE_URL.endsWith("/") ? RAW_BASE_URL.slice(0, -1) : RAW_BASE_URL;

export async function requestApi<T>(
    path: string,
    init?: RequestInit
): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${API_BASE_URL}${normalizedPath}`;

    // In a browser environment, cookies are sent automatically for same-origin
    // For cross-origin or manual usage, we assume the cookie is handled or Bearer is used.

    const response = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...init?.headers,
        },
    });

    if (!response.ok) {
        let error = `API Error ${response.status}`;
        try {
            const clone = response.clone();
            const body = await clone.json();
            error = body.detail || error;
        } catch {
            // ignore – body may be empty or non-JSON
        }
        throw new Error(error);
    }

    // Handle empty responses (e.g., 204 No Content)
    if (response.status === 204 || response.headers.get("content-length") === "0") {
        return undefined as T;
    }

    return response.json();
}
