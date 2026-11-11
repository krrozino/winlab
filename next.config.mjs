const isDesktopExport = process.env.WINLAB_DESKTOP_EXPORT === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isDesktopExport
    ? {
        output: "export",
        trailingSlash: true,
        distDir: "desktop/src/WinLab.Desktop/wwwroot",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
