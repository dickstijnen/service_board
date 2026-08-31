import type { NextConfig } from "next";

const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOST;

const nextConfig: NextConfig = {
    turbopack: {
        root: process.cwd(),
    },
    async redirects() {
        return []
    },
    images: {
        remotePatterns: [
            { protocol: "http", hostname: "localhost", port: "1337", pathname: "/**" },
            ...(mediaHost
                ? [{ protocol: "https" as const, hostname: mediaHost, pathname: "/**" }]
                : []),
        ],
    },
};

export default nextConfig;
