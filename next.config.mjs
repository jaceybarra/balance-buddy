/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',              // produce /out for static hosting
  images: { unoptimized: true }, // GH Pages doesn't run Image Optimization
  trailingSlash: true,
  // If running in GitHub Actions, set basePath/assetPrefix to /<repo>
  ...(process.env.GITHUB_REPOSITORY
    ? (() => {
        const repo = process.env.GITHUB_REPOSITORY.split('/')[1];
        return { basePath: `/${repo}`, assetPrefix: `/${repo}/` };
      })()
    : {})
};

export default nextConfig;
