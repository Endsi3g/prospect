/** @type {import('next').NextConfig} */
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
                destination: "http://127.0.0.1:8000/:path*", // Proxy to Backend
            },
        ];
    },
};

module.exports = nextConfig;
