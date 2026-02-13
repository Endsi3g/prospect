/** @type {import('next').NextConfig} */
const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8000";

const nextConfig = {
    output: "standalone",
    images: {
        unoptimized: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
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
