import { continueRender, delayRender } from 'remotion'

import '@fontsource-variable/jetbrains-mono'

/**
 * JetBrains Mono, bundled rather than fetched: the font ships in
 * `node_modules`, webpack inlines the `@font-face` and the woff2 into the
 * bundle, and the render needs no network.
 *
 * The explicit wait is the part that matters. An `@font-face` loads
 * asynchronously, and Remotion screenshots a frame as soon as React has
 * committed it — without this, early frames render in the fallback monospace
 * and later ones in JetBrains Mono, which is a video whose type changes
 * halfway through. `delayRender` holds every frame until the face is ready.
 */
const handle = delayRender('Loading JetBrains Mono')

const FACES = ['400 40px "JetBrains Mono Variable"', '700 40px "JetBrains Mono Variable"']

Promise.all(FACES.map((face) => document.fonts.load(face)))
  .then(() => document.fonts.ready)
  .then(() => continueRender(handle))
  .catch(() => {
    // A font that will not load must not take the render with it — the
    // fallback monospace is a worse video, not a failed one.
    continueRender(handle)
  })
