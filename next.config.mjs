/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma must stay in the Node runtime; never bundled for the browser.
  serverExternalPackages: ['@prisma/client', 'prisma'],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
