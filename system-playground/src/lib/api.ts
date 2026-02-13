const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function requestApi<T>(
    path: string,
    init?: RequestInit
): Promise<T> {
    const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

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
            const body = await response.json();
            error = body.detail || error;
        } catch {
            // ignore
        }
        throw new Error(error);
    }

    return response.json();
}
