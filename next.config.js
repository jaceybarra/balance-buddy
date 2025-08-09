// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true }, // needed for export
  trailingSlash: true,           // makes Pages routing happier
};

export default nextConfig;
