/** @type {import('next').NextConfig} */
const configuredApiBaseUrl = process.env.API_BASE_URL;
const normalizedConfiguredApiBaseUrl =
    configuredApiBaseUrl && configuredApiBaseUrl.trim()
        ? configuredApiBaseUrl.replace(/\/$/, "")
        : "";
const apiBaseUrl = normalizedConfiguredApiBaseUrl || "http://127.0.0.1:8000";
const isHostedProductionBuild =
    process.env.NODE_ENV === "production" && (process.env.VERCEL === "1" || Boolean(process.env.NETLIFY));

if (isHostedProductionBuild && !normalizedConfiguredApiBaseUrl) {
    throw new Error("API_BASE_URL is required in production for system-playground.");
}

const nextConfig = {
    output: "standalone",
    images: {
        unoptimized: true,
    },
    typescript: {
        ignoreBuildErrors: false,
    },
    async rewrites() {
        return [
            {
                source: "/api/proxy/:path*",
                destination: `${apiBaseUrl}/:path*`,
            },
        ];
    },
};

module.exports = nextConfig;
