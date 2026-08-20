import { Config } from '@remotion/cli/config'

/**
 * The screenshots live in `assets/`, not in a `public/` folder, so the promo
 * sits next to the app's own naming. `setPublicDir` is what makes
 * `staticFile()` and `getStaticFiles()` read that directory — both the studio
 * and `remotion render` take it from here, so neither needs a `--public-dir`
 * flag.
 */
Config.setPublicDir('assets')

Config.setVideoImageFormat('jpeg')
Config.setCodec('h264')
// yuv420p is the chroma subsampling every player agrees on; the default 4:4:4
// makes a file QuickTime and most browsers refuse.
Config.setPixelFormat('yuv420p')
// 24, not the default 18: measured on the configr promo, 18 is visually
// lossless and roughly double the bytes for no readable difference on the
// page (31 MB vs 17 MB for the same 52 s). The decision lives here so a bare
// `npm run render` produces the web-ready file without remembering a flag.
Config.setCrf(24)
Config.setOverwriteOutput(true)
