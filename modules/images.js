// Responsive image convention (tools/make-responsive.py writes the files):
// assets/foo.webp → assets/foo-480.webp, assets/foo-960.webp.

const RASTER = /\.(webp|jpe?g|png)$/i;

export function srcsetFor(path) {
    if (!path || !RASTER.test(path)) return '';
    const base = path.replace(RASTER, '');
    return `${base}-480.webp 480w, ${base}-960.webp 960w`;
}
