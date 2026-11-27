# Foundations

This file covers the platform-wide foundations of Apple's Human Interface Guidelines: accessibility, icons, color, type, layout, materials, motion, privacy, localization and writing. Use it for decisions that apply to every screen, before you pick components or patterns.

## Pages
- [Accessibility](#accessibility): text sizes, contrast ratios, control sizes, assistive technologies
- [Branding](#branding): accent color, custom fonts, logos, launch screens
- [Color](#color): system colors, Liquid Glass color, color spaces, RGB values
- [Dark Mode](#dark-mode): semantic colors, contrast, icons and images in dark appearance
- [Icons](#icons): interface glyphs, standard icons, macOS document icons and sizes
- [Images](#images): scale factors, formats, tvOS and watchOS image sizes
- [Immersive experiences](#immersive-experiences): visionOS spaces, immersion styles, comfort, transitions
- [Inclusion](#inclusion): inclusive language, gender, people and avatars, culture
- [Layout](#layout): hierarchy, size classes, safe areas, tvOS margins and grids
- [Materials](#materials): Liquid Glass variants, standard materials, vibrancy per platform
- [Motion](#motion): purposeful animation, Reduce Motion, game and visionOS motion
- [Privacy](#privacy): permission requests, purpose strings, location, data protection
- [Right to left](#right-to-left): RTL text alignment, numbers, controls, image flipping
- [Spatial layout](#spatial-layout): visionOS field of view, depth, ergonomics, content placement
- [Typography](#typography): system fonts, Dynamic Type sizes per platform, tracking tables
- [Writing](#writing): voice, tone, clarity, labels, error and empty-state text

## Accessibility
Source: https://developer.apple.com/design/human-interface-guidelines/accessibility

An accessible interface works for people of every ability, whatever input or output method they use. Check every screen against these rules and audit with Accessibility Inspector.

**Do**
- Let people enlarge text by at least 200 percent (140 percent in watchOS), through Dynamic Type or custom UI.
- Use larger than recommended sizes when a custom font has a thin weight.
- Meet the contrast minimums below; if the default look cannot, offer a higher-contrast scheme when Increase Contrast is on.
- Check contrast in both the light and the dark appearance.
- Prefer system colors: they have accessible variants that adapt to Increase Contrast and appearance changes.
- Pair color with a second cue (shape, icon, text). Red-green and blue-orange pairs are hard for color-blind people.
- Consider letting people customize color schemes, for example chart colors or game characters.
- Describe the interface and content for VoiceOver (see the VoiceOver page).
- Offer text alternatives for audio and video: captions, subtitles, audio descriptions and transcripts; let people style that text.
- Pair audio cues with matching haptics, and with visual indicators that point to off-screen content.
- Meet the control sizes below and add space between controls: about 12 pt around bezeled elements, about 24 pt around visible edges of borderless ones.
- Use the simplest gesture for frequent actions; give every gesture an on-screen alternative, such as a button next to swipe-to-dismiss.
- Label elements so Voice Control, VoiceOver, Switch Control, AssistiveTouch, Full Keyboard Access and Pointer Control work; test with each.
- Support Siri and Shortcuts so people can run key tasks by voice or the Action button.
- Make the full app usable with the keyboard alone.
- Let people start and stop audio and video; respect the autoplay setting and Dim Flashing Lights.
- When Reduce Motion is on: tighten springs, track animations to gestures, avoid z-axis depth animation, replace x/y/z transitions with fades, avoid animating blurs.
- Consider difficulty options in games: easier level criteria, longer reaction time, control assistance.
- For Assistive Access: keep only core features, use one interaction per screen, confirm hard-to-undo actions twice.

**Avoid**
- Overriding system keyboard shortcuts.
- Custom multifinger or multihand gestures for common tasks.
- Views or controls that dismiss themselves on a timer; prefer an explicit dismiss action.
- Excess fast-moving or blinking animation.

**Platform notes**
- **visionOS:** Supports head and hand Pointer Control and a Zoom lens.
  - Keep UI in the field of view; prefer horizontal layouts to avoid neck strain.
  - Slow down animation, especially in the periphery; keep camera motion gentle.
  - Do not anchor content to the head; minimize large or repeated gestures.

**Specs**

Default and minimum text sizes for custom type styles:

| Platform | Default size | Minimum size |
| --- | --- | --- |
| iOS, iPadOS | 17 pt | 11 pt |
| macOS | 13 pt | 10 pt |
| tvOS | 29 pt | 23 pt |
| visionOS | 17 pt | 12 pt |
| watchOS | 16 pt | 12 pt |

Minimum contrast (WCAG Level AA, used by Accessibility Inspector; APCA is an alternative measure):

| Text size | Text weight | Minimum contrast ratio |
| --- | --- | --- |
| Up to 17 pts | All | 4.5:1 |
| 18 pts | All | 3:1 |
| All | Bold | 3:1 |

Control sizes:

| Platform | Default control size | Minimum control size |
| --- | --- | --- |
| iOS, iPadOS | 44x44 pt | 28x28 pt |
| macOS | 28x28 pt | 20x20 pt |
| tvOS | 66x66 pt | 56x56 pt |
| visionOS | 60x60 pt | 28x28 pt |
| watchOS | 44x44 pt | 28x28 pt |

**APIs:** Accessibility framework, Accessibility Inspector, `isVideoAutoplayEnabled`, Music Haptics, Audio graphs, Voice Control, Switch Control, Assistive Access, Animated images, Flashing lights.

Last change: June 9, 2025 — added Assistive Access, Switch Control and Accessibility Nutrition Labels guidance.

## Branding
Source: https://developer.apple.com/design/human-interface-guidelines/branding

Express brand identity through voice, color and type while keeping platform-familiar components and behavior. Branding must never push content aside.

**Do**
- Write all text in the brand's own voice and tone.
- Use the accent color sparingly: primary actions and status indicators such as unread badges or the selected tab icon.
- Move brand color into the content layer, where it scrolls under Liquid Glass controls and tints them.
- Make a custom brand font legible at all sizes, with Bold Text and Dynamic Type support.
- Consider the custom font for headings and the system font for body and captions.
- Build on standard components; when you restyle one, keep its size, placement and behavior familiar.
- Keep standard patterns: expected UI locations, standard symbols, standard navigation and modality.
- Put branding in a welcome or onboarding screen, not the launch screen.
- Follow Apple's trademark guidelines; no Apple trademarks in app names or images.

**Avoid**
- Brand color on every control.
- Elements that only show a brand asset and take space from content.
- Repeating the logo throughout the app unless it gives needed context.
- Using the launch screen for branding.

**Platform notes**
- No additional considerations for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

Last change: September 9, 2026 — refined guidance on brand color.

## Color
Source: https://developer.apple.com/design/human-interface-guidelines/color

Color communicates status, interactivity, hierarchy and brand. Prefer system and dynamic colors, which adapt to appearance, vibrancy and accessibility settings.

**Do**
- Give each color one meaning across the app; do not tint non-interactive text in the color that marks interactive items.
- Make every color work in light, dark and Increase Contrast; give custom colors light and dark variants, each with a clearly stronger high-contrast version.
- Supply light and dark colors even if the app ships in one appearance, so Liquid Glass can adapt.
- Test in bright and dim surroundings, on True Tone displays, on several TV brands (tvOS) and with P3 and sRGB profiles on a Mac.
- Adjust nearby colors when artwork or translucency changes (Maps switches to a dark scheme in satellite mode).
- Use the system color picker (`ColorPicker`) when people pick colors.
- Back up color with text labels or glyph shapes; check that color meaning fits other cultures (red can mean danger or gain).
- Apply system colors through APIs (`Color`, `UIColor`, `NSColor`); the values below are for design reference only and change between releases.
- Use dynamic system colors for their stated purpose only.
- Tint Liquid Glass sparingly: only primary actions or status. Tint the background of a primary action, not its symbol or text.
- Over colorful content, use monochrome toolbars and tab bars or an accent color with strong differentiation; in mostly monochrome apps, the brand color works well as accent.
- Keep the resting state of scrolling content (for example the top of the screen) legible under controls.
- Embed color profiles in images; sRGB is accurate on most displays.
- For wide color, use Display P3 at 16 bits per channel and export PNG; design P3 art on a wide-color display.
- Provide per-color-space image and color variants in the asset catalog when P3 colors or gradients clip or merge on sRGB.

**Avoid**
- Hard-coding system color values.
- Repurposing semantic colors, such as `separator` as text color or `secondaryLabel` as a background.
- Tinting the background of several controls in one bar.
- Similar colors in control labels and a colorful background.

**Platform notes**
- **iOS, iPadOS:** Two dynamic background sets, each with primary, secondary and tertiary levels.
  - System set: `systemBackground`, `secondarySystemBackground`, `tertiarySystemBackground`.
  - Grouped set, for grouped table views: `systemGroupedBackground`, `secondarySystemGroupedBackground`, `tertiarySystemGroupedBackground`.
  - Primary is the whole view, secondary groups inside it, tertiary groups inside secondary.
  - Liquid Glass in toolbars and tab bars switches light/dark with content and uses monochrome symbols; it is more opaque in sidebars.
- **macOS:** Since macOS 11, an app accent color tints buttons, selection and sidebar icons.
  - It applies only while the system accent setting is multicolor; otherwise the person's choice wins.
  - Fixed-color sidebar icons keep their color in every case.
- **tvOS:** Use a small palette that matches the logo. Show focus with scaling and animation, not color alone.
- **visionOS:** Use little color on glass, since surroundings show through.
  - Put color in bold text and large areas.
  - In full immersion, balance brightness; avoid bright, flashing or moving objects on black.
  - System colors use the default dark values.
- **watchOS:** Use background color only when it carries meaning (Activity ring views match ring colors).
  - Avoid full-screen color on long-lived views such as workouts or audio playback.
  - Expect tinted complications that use the wearer's chosen color.

**Specs**

iOS foreground dynamic colors (UIKit):

| Color | Use for | UIKit API |
| --- | --- | --- |
| Label | Primary text | `label` |
| Secondary label | Secondary text | `secondaryLabel` |
| Tertiary label | Tertiary text | `tertiaryLabel` |
| Quaternary label | Quaternary text | `quaternaryLabel` |
| Placeholder text | Placeholders in controls and text views | `placeholderText` |
| Separator | Separator that lets content show through | `separator` |
| Opaque separator | Separator that hides underlying content | `opaqueSeparator` |
| Link | Link text | `link` |

macOS dynamic system colors (AppKit `NSColor`, also in the Color panel's Developer palette):

| Color | Use for | AppKit API |
| --- | --- | --- |
| Alternate selected control text color | Text on a selected list or table surface | `alternateSelectedControlTextColor` |
| Alternating content background colors | Alternating rows or columns in lists, tables, collections | `alternatingContentBackgroundColors` |
| Control accent | Accent chosen in System Settings | `controlAccentColor` |
| Control background color | Background of large elements such as browsers, tables | `controlBackgroundColor` |
| Control color | Control surface | `controlColor` |
| Control text color | Text of an available control | `controlTextColor` |
| Current control tint | System control tint | `currentControlTint` |
| Unavailable control text color | Text of an unavailable control | `disabledControlTextColor` |
| Find highlight color | Find indicator | `findHighlightColor` |
| Grid color | Table gridlines | `gridColor` |
| Header text color | Table header cell text | `headerTextColor` |
| Highlight color | Virtual on-screen light source | `highlightColor` |
| Keyboard focus indicator color | Focus ring for keyboard navigation | `keyboardFocusIndicatorColor` |
| Label color | Primary label text | `labelColor` |
| Link color | Links | `linkColor` |
| Placeholder text color | Placeholder strings | `placeholderTextColor` |
| Quaternary label color | Below tertiary, such as watermarks | `quaternaryLabelColor` |
| Secondary label color | Subheadings, extra info | `secondaryLabelColor` |
| Selected content background color | Selected content in a key window | `selectedContentBackgroundColor` |
| Selected control color | Selected control surface | `selectedControlColor` |
| Selected control text color | Selected control text | `selectedControlTextColor` |
| Selected menu item text color | Selected menu text | `selectedMenuItemTextColor` |
| Selected text background color | Behind selected text | `selectedTextBackgroundColor` |
| Selected text color | Selected text | `selectedTextColor` |
| Separator color | Between content sections | `separatorColor` |
| Shadow color | Shadow of raised objects | `shadowColor` |
| Tertiary label color | Below secondary labels | `tertiaryLabelColor` |
| Text background color | Behind text | `textBackgroundColor` |
| Text color | Document text | `textColor` |
| Under page background color | Behind document content | `underPageBackgroundColor` |
| Unemphasized selected content background color | Selected content in a non-key window | `unemphasizedSelectedContentBackgroundColor` |
| Unemphasized selected text background color | Selected-text background in a non-key window | `unemphasizedSelectedTextBackgroundColor` |
| Unemphasized selected text color | Selected text in a non-key window | `unemphasizedSelectedTextColor` |
| Window background color | Window background | `windowBackgroundColor` |
| Window frame text color | Title bar text | `windowFrameTextColor` |

System colors (SwiftUI), RGB values:

| Name | SwiftUI API | Default (light) | Default (dark) | Increased contrast (light) | Increased contrast (dark) |
| --- | --- | --- | --- | --- | --- |
| Red | `red` | 255,56,60 | 255,66,69 | 233,21,45 | 255,97,101 |
| Orange | `orange` | 255,141,40 | 255,146,48 | 197,83,0 | 255,160,86 |
| Yellow | `yellow` | 255,204,0 | 255,214,0 | 161,106,0 | 254,223,67 |
| Green | `green` | 52,199,89 | 48,209,88 | 0,137,50 | 74,217,104 |
| Mint | `mint` | 0,200,179 | 0,218,195 | 0,133,117 | 84,223,203 |
| Teal | `teal` | 0,195,208 | 0,210,224 | 0,129,152 | 59,221,236 |
| Cyan | `cyan` | 0,192,232 | 60,211,254 | 0,126,174 | 109,217,255 |
| Blue | `blue` | 0,136,255 | 0,145,255 | 30,110,244 | 92,184,255 |
| Indigo | `indigo` | 97,85,245 | 109,124,255 | 86,74,222 | 167,170,255 |
| Purple | `purple` | 203,48,224 | 219,52,242 | 176,47,194 | 234,141,255 |
| Pink | `pink` | 255,45,85 | 255,55,95 | 231,18,77 | 255,138,196 |
| Brown | `brown` | 172,127,94 | 183,138,102 | 149,109,81 | 219,166,121 |

iOS, iPadOS system grays (UIKit), RGB values; SwiftUI `gray` equals `systemGray`:

| Name | UIKit API | Default (light) | Default (dark) | Increased contrast (light) | Increased contrast (dark) |
| --- | --- | --- | --- | --- | --- |
| Gray | `systemGray` | 142,142,147 | 142,142,147 | 108,108,112 | 174,174,178 |
| Gray (2) | `systemGray2` | 174,174,178 | 99,99,102 | 142,142,147 | 124,124,128 |
| Gray (3) | `systemGray3` | 199,199,204 | 72,72,74 | 174,174,178 | 84,84,86 |
| Gray (4) | `systemGray4` | 209,209,214 | 58,58,60 | 188,188,192 | 68,68,70 |
| Gray (5) | `systemGray5` | 229,229,234 | 44,44,46 | 216,216,220 | 54,54,56 |
| Gray (6) | `systemGray6` | 242,242,247 | 28,28,30 | 235,235,240 | 36,36,38 |

**APIs:** `Color` (SwiftUI), `UIColor`, `NSColor`/`Color` (AppKit), `ColorPicker`, `UIWhitePointAdaptivityStyle`.

Last change: December 16, 2025 — updated Liquid Glass guidance.

## Dark Mode
Source: https://developer.apple.com/design/human-interface-guidelines/dark-mode

Dark Mode is the systemwide dark appearance for low light. People expect every app to follow it on iOS, iPadOS, macOS and tvOS.

**Do**
- Follow the system setting; make the app look right in light, dark and Auto, which can switch while the app runs.
- Test legibility in Dark Mode with Increase Contrast and Reduce Transparency, separately and together.
- Use semantic colors (`labelColor`, `controlColor`, `separator`) that adapt; for custom colors add a Color Set in the asset catalog with light and dark variants.
- Keep contrast at least 4.5:1; aim for 7:1 for custom colors, especially small text.
- Darken content images with white backgrounds slightly so they do not glow.
- Use SF Symbols tinted with dynamic colors or vibrancy.
- Make separate light and dark interface icons when an edge disappears (for example add an outline on one background only).
- Reuse one full-color asset if it works in both modes; otherwise adjust it or provide light and dark versions in one named asset.
- Use the system label colors (primary to quaternary) and system text fields and text views, which handle vibrancy.
- Consider a dark-only appearance only in rare cases, such as immersive media viewing (Stocks).

**Avoid**
- An app-specific appearance setting.
- Hard-coded or non-adapting colors; dark colors are not simple inversions of light ones.

**Platform notes**
- **iOS, iPadOS:** Dark backgrounds come in base (dimmer, recedes) and elevated (brighter, advances) sets.
  - The system switches to elevated for popovers, modal sheets, multitasking and multiple windows.
  - Prefer system backgrounds so this keeps working.
- **macOS:** With the graphite accent, window backgrounds take tint from the desktop picture (desktop tinting).
  - Add some transparency to custom components with a visible background or bezel, only in their neutral, uncolored state.
- **tvOS:** No additional considerations.
- **visionOS, watchOS:** Not supported.

**APIs:** `labelColor`, `controlColor` (AppKit), `separator` (UIKit), asset catalog Color Set.

Last change: August 6, 2024 — added artwork comparing light and dark appearances.

## Icons
Source: https://developer.apple.com/design/human-interface-guidelines/icons

Interface icons (glyphs) express one concept with simple shapes, unlike detailed app icons. Draw your own or use SF Symbols; both use black and clear areas that the system can tint.

**Do**
- Simplify to a familiar metaphor tied directly to the action or content.
- Keep size, detail level, stroke weight and perspective consistent across all icons; adjust dimensions so light-weight icons balance heavy ones.
- Match icon weight to adjacent text unless you want to emphasize one.
- Center asymmetric icons optically; bake the offset into the asset as padding so geometric centering of the asset works.
- Use gender-neutral figures and culturally clear imagery.
- Localize any characters in an icon; draw text passages abstractly and provide a flipped version for right-to-left.
- Deliver custom icons as PDF or SVG vectors, or as custom SF Symbols with a matching scale; PNG needs multiple resolutions.
- Give every custom icon an accessibility label for VoiceOver.
- Show Apple hardware only with images from Apple Design Resources or product SF Symbols.

**Avoid**
- Detail that makes the icon unreadable.
- Separate selected-state artwork for icons in toolbars, tab bars and buttons; the system draws the selected state.
- Text in icons unless it carries the meaning.
- Replicas of Apple hardware.

**Platform notes**
- **macOS:** Document icons show a page with a folded top-right corner.
  - Without a custom one, macOS composites the app icon and the file extension.
  - Supply any mix of background fill, center image and text; the system layers and masks them.
  - Use simple shapes and few distinct colors; icons can be as small as 16x16 px.
  - A single rich background fill without a center image works well (Xcode, TextEdit).
  - Reduce detail at small sizes: fewer, thicker grid-aligned lines, none at 16x16 px.
  - Keep important content out of the top-right corner of the fill.
  - Keep most of the center image within a 10% margin (about 80% of the canvas, e.g. 205x205 px in 256x256 px).
  - Replace an unfamiliar extension with a short term (SceneKit shows "scene" for scn); the system scales the text and capitalizes all letters.
- **iOS, iPadOS, tvOS, visionOS, watchOS:** No additional considerations.

**Specs**

macOS document icon background fill sizes: 512x512 px @1x / 1024x1024 px @2x; 256x256 @1x / 512x512 @2x; 128x128 @1x / 256x256 @2x; 32x32 @1x / 64x64 @2x; 16x16 @1x / 32x32 @2x.

macOS document icon center image (half the icon canvas, e.g. 16x16 px for a 32x32 px icon): 256x256 px @1x / 512x512 px @2x; 128x128 @1x / 256x256 @2x; 32x32 @1x / 64x64 @2x; 16x16 @1x / 32x32 @2x.

Standard SF Symbols for common actions:

| Group | Action | Symbol name |
| --- | --- | --- |
| Editing | Cut | `scissors` |
| Editing | Copy | `document.on.document` |
| Editing | Paste | `document.on.clipboard` |
| Editing | Done, Save | `checkmark` |
| Editing | Cancel, Close | `xmark` |
| Editing | Delete | `trash` |
| Editing | Undo | `arrow.uturn.backward` |
| Editing | Redo | `arrow.uturn.forward` |
| Editing | Compose | `square.and.pencil` |
| Editing | Duplicate | `plus.square.on.square` |
| Editing | Rename | `pencil` |
| Editing | Move to, Folder | `folder` |
| Editing | Attach | `paperclip` |
| Editing | Add | `plus` |
| Editing | More | `ellipsis` |
| Selection | Select | `checkmark.circle` |
| Selection | Deselect, Close | `xmark` |
| Selection | Delete | `trash` |
| Text formatting | Superscript | `textformat.superscript` |
| Text formatting | Subscript | `textformat.subscript` |
| Text formatting | Bold | `bold` |
| Text formatting | Italic | `italic` |
| Text formatting | Underline | `underline` |
| Text formatting | Align Left | `text.alignleft` |
| Text formatting | Center | `text.aligncenter` |
| Text formatting | Justified | `text.justify` |
| Text formatting | Align Right | `text.alignright` |
| Search | Search | `magnifyingglass` |
| Search | Find, Find and Replace, Find Next, Find Previous, Use Selection for Find | `text.page.badge.magnifyingglass` |
| Search | Filter | `line.3.horizontal.decrease` |
| Sharing and exporting | Share, Export | `square.and.arrow.up` |
| Sharing and exporting | Print | `printer` |
| Users and accounts | Account, User, Profile | `person.crop.circle` |
| Ratings | Dislike | `hand.thumbsdown` |
| Ratings | Like | `hand.thumbsup` |
| Layer ordering | Bring to Front | `square.3.layers.3d.top.filled` |
| Layer ordering | Send to Back | `square.3.layers.3d.bottom.filled` |
| Layer ordering | Bring Forward | `square.2.layers.3d.top.filled` |
| Layer ordering | Send Backward | `square.2.layers.3d.bottom.filled` |
| Other | Alarm | `alarm` |
| Other | Archive | `archivebox` |
| Other | Calendar | `calendar` |

Last change: June 9, 2025 — added the table of SF Symbols for common actions.

## Images
Source: https://developer.apple.com/design/human-interface-guidelines/images

Deliver bitmap art at the right scale factors and in the right formats so it stays sharp on every device. A point is a pixel-independent unit in 2D; in visionOS it is angular and scales with distance.

**Do**
- Provide high-resolution versions of every bitmap for every supported device; mark them @1x, @2x or @3x in the asset catalog.
- Design at the lowest resolution and scale up; put vector control points on whole values so they align at 1x and its multiples.
- Embed a color profile in each image.
- Test images on a range of real devices for pixelation, stretching or compression.

**Platform notes**
- **tvOS:** Focusable images use parallax: the focused item lifts, sways and shines; after inactivity other content dims.
  - Layered images (2 to 5 layers) are required for the app icon, and strongly encouraged for other focusable images, including Top Shelf.
  - Show layered images in standard views with system focus APIs (`FocusState`) to get parallax automatically.
  - Put prominent elements and text in the foreground, secondary content and shadows in the middle, an opaque backdrop in the back (a transparent background layer is an error).
  - Keep depth subtle; keep essential content inside a safe zone.
  - Preview in Xcode, Parallax Previewer or the Parallax Exporter Photoshop plug-in, then on a real TV.
  - Images loaded from a server at runtime must be runtime layered images (`.lcr`), made with `layerutil` from LSR or Photoshop files; do not embed `.lcr` files.
- **visionOS:** The system scales images over a wide size range; pixels may not map 1:1.
  - The app icon has 2 to 3 layers.
  - Prefer vector art for 2D images.
  - For raster art, @2x looks fine at normal distance but not up close; higher resolutions cost file size and performance, especially above @6x. Above @2x, apply high-quality filtering (`filters`).
  - Spatial photos (stereo photos with spatial metadata from iPhone 15 Pro or later, Apple Vision Pro or compatible cameras) use stereo HEIC with spatial metadata.
  - Place text over spatial photos on the feathered glass background effect (`GlassBackgroundEffect`).
  - Check that disparity adjustments stay comfortable from expected viewing positions.
  - Show spatial photos and scenes in a standalone view such as a sheet or window; if inline, leave generous spacing.
  - Spatial scenes take up to several seconds to generate: offer them for specific moments behind an explicit action, and show few at once.
  - Keep immersive viewing UI minimal; show spatial scenes large and centered for more parallax.
- **watchOS:** Avoid transparency to keep files small, except in template images (complications, menu icons) where it marks the tint area. Use autoscaling PDFs designed for 40mm and 42mm at 2x.
- **iOS, iPadOS, macOS:** No additional considerations.

**Specs**

| Platform | Scale factors |
| --- | --- |
| iPadOS, watchOS | @2x |
| iOS | @2x and @3x |
| visionOS | @2x or higher |
| macOS, tvOS | @1x and @2x |

| Image type | Format |
| --- | --- |
| Bitmap or raster work | De-interlaced PNG |
| PNG graphics that need no full 24-bit color | 8-bit color palette |
| Photos | JPEG (optimized as needed) or HEIC |
| Stereo or spatial photos | Stereo HEIC |
| Flat icons, interface icons, flat art that must scale | PDF or SVG |

watchOS autoscaling PDF image scale:

| Screen size | Image scale |
| --- | --- |
| 38mm | 90% |
| 40mm | 100% |
| 41mm | 106% |
| 42mm | 100% |
| 44mm | 110% |
| 45mm | 119% |
| 49mm | 119% |

**APIs:** `Image` (SwiftUI Images), `UIImageView`, `NSImageView`, `FocusState`, `ImagePresentationComponent`, `GlassBackgroundEffect`, `CALayer` `filters`.

Last change: December 16, 2025 — added guidance on spatial photos and spatial scenes in visionOS.

## Immersive experiences
Source: https://developer.apple.com/design/human-interface-guidelines/immersive-experiences

In visionOS an app runs in the Shared Space beside other apps or alone in a Full Space, and can move between them. Use immersion for the moments that gain from it.

**Do**
- Launch in the Shared Space or the `mixed` style; let people choose when to go deeper.
- Reserve immersion for key tasks and content (Photos browses in a window and opens one photo in a Full Space).
- Guide attention with dimming, tinting, motion, scale and Spatial Audio; start subtle and strengthen only with reason.
- Tint passthrough subtly (visionOS 2 and later, `SurroundingsEffect`); default dimming is black.
- Support accessibility features and several ways to use the app.
- Keep 3D content in the field of view and motion comfortable.
- Choose the immersion style by expected movement: if people may go beyond 1.5 m, do not use `progressive` or `full`, or return to `mixed`.
- Let people interact without moving; for example bring an object to them.
- Switch from `mixed` to `progressive` or `full` when virtual objects would block much of passthrough.
- Use ARKit (with permission) to blend content with surroundings or use hand positions (`SceneReconstructionProvider`).
- Make transitions gentle and trackable; offer a clear enter and exit control and say whether exit goes back a level or quits.
- If exit also quits, let people pause or save first.
- Virtual hands: match the person's hand positions and gestures; fade them out and show real hands when tracking drops, then fade back.
- Environments: keep movement and high-contrast detail low around the main task; spend top-quality assets on focus areas, dim the rest.
- Place interactive objects close; far objects read as non-interactive.
- Keep environment animation gentle, away from the edges of view; make spaces feel expansive.
- Use Spatial Audio soundscapes without heavy looping; lower or stop them when other audio plays.
- Build environments from lit meshes and shaders, always with a ground plane mesh.

**Avoid**
- Sudden entry into deeper immersion, or relying on system controls to leave it.
- Encouraging movement in `progressive` or `full` experiences.
- Bright or dramatic passthrough tints.
- Virtual hands much larger than real hands, or frozen hands.
- Flat 360-degree images as the environment (no sense of scale); add a ground plane if you must.
- Repeating the same assets often.

**Platform notes**
- **visionOS:** Passthrough shows the surroundings.
  - The Digital Crown recenters content (press and hold) or briefly shows passthrough (double-click).
  - In `mixed`, content near physical objects dims or turns semi-opaque; `mixed` has no boundary.
- **iOS, iPadOS, macOS, tvOS, watchOS:** Not supported.

**Specs**
- Immersion styles: dimmed passthrough (Shared Space or Full Space), `mixed` (unbounded content with passthrough), `progressive` (custom environment partly replaces passthrough; portrait or landscape), `full` (360-degree environment replaces passthrough).
- `progressive` default immersion range: 120 to 360 degrees via the Digital Crown, or a custom range.
- `progressive` and `full` boundary: about 1.5 m from the initial head position; the scene fades near it and is replaced by the app icon beyond it.

**APIs:** `ImmersionStyle` (`automatic`, `mixed`, `progressive`, `full`), Immersive spaces, `SurroundingsEffect`, ARKit, `SceneReconstructionProvider`, `CoordinateSpaceProtocol`.

Last change: June 9, 2025 — clarified guidance and noted portrait progressive immersion.

## Inclusion
Source: https://developer.apple.com/design/human-interface-guidelines/inclusion

Inclusive design puts people first through respectful words, diverse images and accessible features. Review copy, imagery and flows from many perspectives (age, gender, race, sexuality, physical and cognitive traits, disability, language, culture, religion, education, opinion, economic context), not only for offense.

**Do**
- Keep the tone clear, direct and respectful; an academic tone can signal that only highly educated people are welcome.
- Address people as "you" and "your"; keep "we" and "our" for the app or company.
- Define any specialized term before use and make it easy to look up; prefer plain language, which also translates better.
- Replace idioms and colloquialisms with plain words; some have exclusionary origins (for example "peanut gallery", "grandfathered in").
- Offer a clear interface and an onboarding path that newcomers can follow and others can skip.
- Write gender-neutral copy ("Subscribers can post recipes" instead of "his or her recipes").
- Let people customize avatars, emoji and characters; show generic people with nongendered figures (SF Symbols person and figure glyphs).
- If you must ask for gender (health, legal), offer options such as nonbinary, self-identify and decline to state; consider asking for pronouns.
- Show people of varied race, body type, age and ability; show familiar, relatable places and objects.
- Base security questions and similar prompts on universal experiences (first friend's name) rather than college, cars or rainbows.
- Support VoiceOver, Display Accommodations, closed captions, Switch Control and Speak Screen.
- Treat disability as a spectrum that includes temporary and situational cases; include people with disabilities in imagery.
- Write people-first about disability and use the self-identification of the people you describe.
- Internationalize first, then localize text and resources; use SF Symbols for language-specific and RTL-ready glyphs.
- Check what each color means in each locale (white can mean grief or purity).

**Avoid**
- A narrow "user" or "player" voice that feels distant.
- Humor that may confuse, tire or insult people in other cultures.
- Stereotypes, such as only male doctors and female nurses, or a fixed idea of family.
- Displays of affluence where they feel out of touch.
- Language that uses a disability to describe something negative.
- Assuming a disability means someone does not want the experience.

**Platform notes**
- No additional considerations for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

**APIs:** Localization (Xcode).

## Layout
Source: https://developer.apple.com/design/human-interface-guidelines/layout

Layout gives content a consistent, adaptable structure across screen sizes, orientations, windows and multitasking. Use SwiftUI or Auto Layout, the system safe areas, margins and guides, and Apple Design Resources templates.

**Do**
- Put the most important items near the top and leading side; use standard components so RTL order adapts.
- Align items for scanning; indent to show subordination; group related items with space, containers or separators.
- Use progressive disclosure (disclosure triangles, menus, nested views, scrolling sections).
- Set controls apart from content with Liquid Glass and a scroll edge effect instead of a solid or semi-opaque backing.
- Extend full-screen backgrounds under sidebars, toolbars and tab bars; use a background extension effect to mirror and blur art under sidebars or inspectors.
- Adapt to size classes, screen sizes, orientations, aspect ratios, the Dynamic Island, external displays, Display Zoom, resizable iPad and Mac windows, text size and locale.
- Resize well even when locked to one orientation.
- Reflow for large Dynamic Type: stack side-by-side views, let rows grow and wrap. In Unity, use Apple's accessibility plug-in.
- Test the largest and smallest layouts first, across size classes, locales and text sizes; use Device Hub to check iPad resizing and iPhone Mirroring.
- Scale background art to fill a new aspect ratio; never distort it. Extend art beyond the usual visible area for very wide or tall windows.
- Decide layout by size class (compact or regular, per axis), never by device idiom or orientation.
- Design for every size class combination in portrait and landscape.
- Keep features the same when size class changes; only show more or less (for example tab bar to sidebar, overflow menu items exposed).
- Keep the layout true to the app's idiom while resizing.
- Respect safe areas so hardware (Dynamic Island) and bars do not cover content; use layout guides for margins and readable text width.

**Platform notes**
- **iOS, iPadOS:** System sets size classes from device, window configuration and multitasking (full screen, Slide Over, mirrored to Mac); any combination can occur.
- **macOS:** Keep controls and critical information away from the window bottom, which often sits off-screen. Keep content out from behind the camera housing.
- **tvOS:** Leave padding between focusable elements, because focused items grow.
  - Keep grid spacing consistent; add vertical space above and below row titles.
  - Keep partly off-screen items equal width on both sides.
  - `UICollectionViewFlowLayout` derives the column count from width and spacing.
- **visionOS:** Lay out in windows, volumes or immersive spaces (see Spatial layout).
  - Support resizing and keep content horizontally centered when very large.
  - Use minimum and maximum sizes only to prevent overlap or unwieldy layouts, not to block resizing.
  - Show inline 3D content in windows only for meaningful moments, inset from the edges; use a volume or immersive space for large 3D content.
  - Show supplemental content in an adjacent window (`defaultWindowPlacement(_:)`), not in an ornament; ornaments are for app controls.
  - Space buttons so their centers are at least 60 pt apart.
- **watchOS:** Put at most three glyph buttons or two text buttons in a row.
  - Full-width text buttons are usually better; two short ones work on a non-scrolling screen.
  - Support autorotation in views people show to others, such as images or QR codes (`isAutorotating`).

**Specs**
- tvOS safe area: inset primary content 60 pt from top and bottom, 80 pt from the sides.

tvOS grids (all with 40 pt horizontal spacing and at least 100 pt vertical spacing):

| Columns | Unfocused content width |
| --- | --- |
| 2 | 860 pt |
| 3 | 560 pt |
| 4 | 410 pt |
| 5 | 320 pt |
| 6 | 260 pt |
| 7 | 217 pt |
| 8 | 184 pt |
| 9 | 160 pt |

**APIs:** `backgroundExtensionEffect()`, `UIBackgroundExtensionView`, `UITraitChangeObservable`, `UserInterfaceSizeClass`, `UILayoutGuide`, `NSLayoutGuide`, `SafeAreaRegions`, `NSPrefersDisplaySafeAreaCompatibilityMode`, `UICollectionViewFlowLayout`, `defaultWindowPlacement(_:)`, `isAutorotating`.

Last change: September 9, 2026 — updated guidance to current best practice.

## Materials
Source: https://developer.apple.com/design/human-interface-guidelines/materials

Materials separate foreground from background and let color pass through to show hierarchy. Liquid Glass is the floating layer for controls and navigation; standard materials structure the content layer beneath it.

**Do**
- Put Liquid Glass only on the control and navigation layer (tab bars, sidebars, toolbars).
- Let standard components adopt Liquid Glass automatically; on custom controls use it only for the most important functional elements.
- Use the regular variant (blurs, adjusts luminosity) where backgrounds threaten legibility or the component holds much text: alerts, sidebars, popovers.
- Use the clear variant only over rich media such as photos and video.
- Over bright content, add a 35% opacity dark dimming layer behind clear glass; skip it over dark content or with AVKit playback controls, which dim on their own.
- Use blur, vibrancy and blending modes to show structure in content beneath Liquid Glass.
- Pick materials and vibrancy by semantic purpose, not by the color they appear to give.
- Put vibrant system colors on top of any material.
- Use thicker (more opaque) materials for fine text and detail, thinner ones to keep background context visible.

**Avoid**
- Liquid Glass in the content layer, such as app backgrounds. Exception: transient controls such as sliders and toggles take on glass while active.
- Liquid Glass on many custom controls.
- Non-vibrant colors (for example `systemGray3`) on materials.
- Opaque window backgrounds in visionOS.
- Removing or replacing default material backgrounds of watchOS modal sheets.

**Platform notes**
- **iOS, iPadOS:** Four standard materials for the content layer: ultra-thin, thin, regular (default), thick.
  - Vibrant labels: `label` (default), `secondaryLabel`, `tertiaryLabel`, `quaternaryLabel`; do not use quaternary on thin or ultraThin.
  - Vibrant fills, on all materials: `fill` (default), `secondaryFill`, `tertiaryFill`.
  - One `separator` vibrancy works on all materials.
- **macOS:** Several purpose-specific materials and vibrant versions of all system colors. Test where vibrancy helps in custom views. Choose a blending mode: behind window or within window.
- **tvOS:** Liquid Glass appears in navigation, Top Shelf and Control Center; image views and buttons adopt it on focus. Standard materials structure content (table below).
- **visionOS:** Windows use the fixed system glass material, which adapts to surroundings; there is no separate Dark Mode.
  - Prefer translucency to opaque color.
  - Custom components: `thin` for interactive elements and selections, `regular` to separate sections such as a sidebar or grouped table.
  - Use `thick` for a dark element on a `regular` background.
  - Vibrancy: `label` for standard text, `secondaryLabel` for footnotes and subtitles, `tertiaryLabel` only for inactive, low-legibility text.
- **watchOS:** Use materials in full-screen modals to orient people and separate controls from content.

**Specs**

tvOS standard materials:

| Material | Recommended for |
| --- | --- |
| `ultraThin` | Full-screen views that need a light color scheme |
| `thin` | Overlays that partly cover content and need a light color scheme |
| `regular` | Overlays that partly cover content |
| `thick` | Overlays that partly cover content and need a dark color scheme |

**APIs:** `glassEffect(_:in:)`, `Glass` `regular` and `clear`, `Material`, `UIVisualEffectView`, `UIBlurEffect`, `UIVibrancyEffect`, `UIVibrancyEffectStyle`, `NSVisualEffectView` (`Material`, `BlendingMode`).

Last change: September 9, 2025 — updated Liquid Glass guidance.

## Motion
Source: https://developer.apple.com/design/human-interface-guidelines/motion

Motion conveys status, feedback and instruction. System components already animate and adapt to accessibility settings and input type (Liquid Glass reacts more strongly to touch than to a trackpad); follow these rules for custom motion.

**Do**
- Add motion only with a purpose.
- Make motion optional: never use it as the only carrier of important information; add haptics or audio.
- Make feedback motion realistic and consistent with the gesture (a view pulled down from the top is not dismissed sideways).
- Keep feedback animations brief and precise.
- Let people interrupt or cancel animations instead of waiting.
- Consider animated SF Symbols (SF Symbols 5 or later).
- In games, hold a steady 30 to 60 fps and ship good default graphics settings per platform.
- Let people trade visual quality for performance or battery, for example power modes when external power is present.

**Avoid**
- Gratuitous or excessive animation.
- Custom motion on frequent UI interactions in apps.

**Platform notes**
- **visionOS:** Motion combines with depth for gaze feedback; avoid discomfort.
  - Keep motion out of the periphery; if unavoidable, match the object's brightness to the rest of the scene.
  - For large moving objects that fill the view, raise translucency or lower contrast; keep movable windows fairly small.
  - Fade an object out and in to relocate it when the path means nothing.
  - Do not let people rotate the virtual world; use instant direction changes during a quick fade.
  - Give people a stationary frame of reference.
  - Avoid sustained oscillation, especially near 0.2 Hz; keep amplitude low and content translucent.
- **watchOS:** Prefer SwiftUI for animation; WatchKit uses `WKInterfaceImage`. Layout and appearance animations always ease in and out; easing cannot be changed.
- **iOS, iPadOS, macOS, tvOS:** No additional considerations.

**APIs:** SwiftUI animations and transitions, `WKInterfaceImage`.

Last change: September 9, 2025 — added Liquid Glass guidance.

## Privacy
Source: https://developer.apple.com/design/human-interface-guidelines/privacy

Be open about the data and resources the app needs and protect what people share. Every App Store submission must declare its privacy practices in App Store Connect for the product page.

**Do**
- Request only the data a feature needs, as narrowly as possible, and only when people use that feature.
- Explain how you collect and use data; respect Hide My Email, Mail Privacy Protection and app tracking rules.
- Process data on device where possible (Apple Neural Engine, Create ML models).
- Use system protections, for example CloudKit encryption for more data types (iOS 15 and later).
- Ask permission for:
  - personal data: location, health, financial, contacts, other identifying data;
  - user content: mail, messages, calendar, gameplay, Apple Music activity, HomeKit, audio, video, photos;
  - protected resources: Bluetooth, home automation, Wi-Fi, local network;
  - camera and microphone; visionOS ARKit data in a Full Space; the advertising identifier.
- Ask at launch only when the app cannot work without it (navigation needs location; a visionOS game that bounces objects off walls needs surroundings data).
- Write the purpose string as one brief, specific, complete sentence in sentence case, active voice, ending with a period. It appears after the app name, above the buttons.
- Good: an active sentence naming what is collected and why. Bad: a vague passive justification, or a bare command to turn access on.
- If context is not enough, show one pre-alert screen with a single button titled like "Continue" or "Next" that opens the system alert.
- Show the system tracking alert before collecting any tracking data.
- Use the Core Location location button (iOS, iPadOS, watchOS) for one-off location needs: attaching a location, finding a store, identifying a plant.
- Customize the location button only in: title (system choices such as "Current Location"), filled or outlined glyph, colors, corner radius.
- Make the location button text fit untruncated at all text sizes and in all languages.
- Prefer passkeys; with passwords, add two-factor authentication; protect kept-signed-in apps with Face ID, Optic ID or Touch ID.
- Store secrets in the keychain; use passkeys, Sign in with Apple or Password AutoFill instead of custom schemes.

**Avoid**
- Asking for data before people show interest in the feature.
- A pre-alert button titled "Allow" or with the weight of the alert's allow button; a second button, close or cancel on a pre-alert screen (unless needed for legal consent).
- Tracking pre-screens that mislead: incentives, imitation requests, images of the alert, annotations pointing at it. App Review rejects these (guideline 5.1.1 (iv)).
- Note: a consent screen required by local privacy law, before or after the tracking alert, is allowed.
- Password-only authentication and plain-text storage of secrets.
- Location button styling the system flags (low contrast, too much translucency); repeated problems disable its location access.

**Platform notes**
- **iOS, iPadOS, watchOS:** Location button behavior:
  - The first tap shows a one-time explainer alert; later taps grant one-time access that expires when the app is not in use.
  - With no authorization status, a tap equals Allow Once; it does not change an existing While Using status.
- **macOS:** Sign apps distributed outside the store with Developer ID.
  - Sandbox the app (required for the Mac App Store).
  - Do not assume who is signed in; fast user switching allows several active users.
- **visionOS:** ARKit runs continuously but sends apps no data in the Shared Space; open a Full Space for ARKit APIs.
  - Plane Estimation, Scene Reconstruction, Image Anchoring and Hand Tracking need permission.
  - Gaze stays private: the system draws hover effects for SwiftUI and RealityKit components.
  - The back camera gives blank input; the front camera feeds spatial Personas only with permission.
  - In ported iOS apps, remove camera features or replace them with content import.
- **tvOS:** No additional considerations.

**APIs:** `LocationButton` (SwiftUI), `CLLocationButton`, App Tracking Transparency, Local Authentication, Keychain services, Password AutoFill, CloudKit, ARKit.

Last change: June 21, 2023 — merged guidance into a new page and added visionOS.

## Right to left
Source: https://developer.apple.com/design/human-interface-guidelines/right-to-left

Mirror the interface for right-to-left (RTL) scripts such as Arabic and Hebrew. System frameworks and standard layouts flip automatically; use these rules to fine-tune text, numbers, controls and images.

**Do**
- Mirror text alignment with the layout when the system does not (left-aligned in LTR becomes right-aligned in RTL).
- Align one- and two-line text to the context direction, but align paragraphs (three or more lines) to their own language.
- Give all items in a list the same alignment, including items in another script.
- Know which numerals each locale uses for number-centric apps: Hebrew uses Western Arabic numerals; Arabic uses Western or Eastern Arabic depending on region. Other apps can rely on system formatting.
- Reverse the order of numerals that show progress or count direction (rating scales, sliders, ordered sequences).
- Flip progress controls such as sliders and progress indicators, and swap their start and end glyphs.
- Flip navigation in a fixed order: back points right in RTL; next and previous swap.
- Enlarge Arabic or Hebrew text by about 2 pt when it sits next to all-caps Latin text in buttons, labels and titles.
- Reverse the positions of images whose order means something (chronological, alphabetical, favorites).
- Use SF Symbols for RTL and localized Arabic and Hebrew variants; set directionality on custom symbols.
- Flip icons that represent text or reading direction, and icons that show forward or backward motion (speaker waves).
- Localize icons that contain real text (signature, rich text, I-beam); redraw without text when the text is unrelated to reading.
- For complex icons, judge each component; keep design-language parts such as the negation backslash unchanged.
- Flip a badge when it depicts flipped UI, or when keeping it unbalances the icon (a cart's plus badge moves to the top-left).
- Keep handed tools in their orientation while flipping the base image if needed.

**Avoid**
- Reversing the digits within a number (phone, card or order numbers).
- Flipping the numeral glyphs themselves.
- Flipping controls that mean a real direction or point to a screen area.
- Flipping photos, illustrations or artwork; make a new version if direction matters. Flipping copyrighted images can be a violation.
- Flipping logos (legal risk) or universal marks such as the checkmark.
- Flipping icons of real-world objects (clocks, right-handed tools like a pencil, game controllers) unless they show direction.

**Platform notes**
- No additional considerations for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

**APIs:** Creating custom SF Symbols, Preparing views for localization (SwiftUI).

## Spatial layout
Source: https://developer.apple.com/design/human-interface-guidelines/spatial-layout

Spatial layout places content comfortably in the unbounded canvas of Apple Vision Pro, using field of view, depth and scale. Use it for any visionOS window, volume or immersive scene.

**Do**
- Center important content in the field of view; keep distracting motion and bright, high-contrast objects out of the periphery. The system does not report a person's field of view.
- Anchor content in the person's space so they can look around freely.
- Give accurate depth cues (distance, occlusion, shadow); conflicting cues cause discomfort.
- Use small amounts of depth even in standard windows; SwiftUI adds depth effects to 2D views.
- Use depth to show hierarchy, for example a window recedes along z when a sheet appears.
- Use depth on large, important elements such as tab bars and toolbars, and limit how many depth levels people must refocus between.
- Use RealityKit for 3D objects, shown anywhere or inside a volume (a frameless window for 3D content).
- Use fixed scale only for non-interactive objects that must look life-size, such as products.
- Prefer indirect gestures; keep direct touch for nearby objects inspected briefly.
- Let the Digital Crown recenter windows; the app needs no work for it.
- Space interactive elements so the hover effect does not crowd neighbors; never overlap controls with other interactive elements.
- Make the app usable with little or no physical movement.
- Place large floor-based immersive content on a horizontal plane aligned with the floor.

**Avoid**
- Anchoring content to the head.
- Depth on text, or depth on small items such as a button's symbol.
- Too many windows; they block surroundings and are hard to move.

**Platform notes**
- **visionOS:** A point is an angle, not a pixel count.
  - Dynamic scale (windows) enlarges a window as it moves away, so it looks the same size at any distance.
  - Fixed scale keeps real size, so the object looks smaller with distance.
- **iOS, iPadOS, macOS, tvOS, watchOS:** Not supported.

**Specs**
- Field-of-view guide rings: 30, 60 and 90 degrees.
- Regular-size buttons: centers at least 60 pt apart, with 16 pt or more between them.

**APIs:** RealityKit, Adding 3D content to your app, Presenting windows and spaces, Positioning and sizing windows.

Last change: March 29, 2024 — stressed that interactive elements must not overlap.

## Typography
Source: https://developer.apple.com/design/human-interface-guidelines/typography

Type carries legibility, hierarchy and brand. Prefer the system fonts and built-in text styles, which support Dynamic Type and accessibility settings; custom fonts must match that behavior.

**Do**
- Meet the default and minimum sizes below for system and custom fonts; go larger for thin custom weights.
- Test text legibility in each context, such as game text on each platform; fix with larger size, more contrast or system fonts.
- Use Regular, Medium, Semibold or Bold for system fonts.
- Show hierarchy with weight, size and color, and keep it intact when text size changes.
- Use as few typefaces as possible.
- When text grows, grow the content people care about (body, dialog), not chrome such as tab titles or transient values.
- Use the built-in text styles for hierarchy and Dynamic Type support.
- Modify styles with symbolic traits: bold for another level, loose leading for wide columns or long passages, tight leading for height-limited rows (never for 3 or more lines).
- Access system fonts through `Font.Design` (`default` for SF, `serif` for New York); do not embed them.
- Adjust tracking in mockups to match the running system font (tables below).
- Make custom fonts legible and support Dynamic Type and Bold Text; in Unity use Apple's plug-ins or offer another text-size control.
- Test all sizes, including Larger Accessibility Text Sizes (Settings > Accessibility > Display & Text Size > Larger Text).
- Enlarge meaningful icons with text; SF Symbols scale with Dynamic Type.
- Show as much useful text at the largest accessibility size as at the largest standard size; let labels use as many lines as needed (`numberOfLines`).
- At large sizes, stack text above secondary items (glyphs, timestamps) and reduce column count (`isAccessibilityCategory`).
- Keep primary elements near the top at every size.

**Avoid**
- Ultralight, Thin and Light weights, especially at small sizes.
- Truncating text in scrollable regions unless people can open the full text.

**Platform notes**
- **iOS, iPadOS:** System font SF Pro; New York (NY) is available.
- **macOS:** System font SF Pro; NY only for Mac Catalyst apps. No Dynamic Type. Use the dynamic system font variants below to match standard controls.
- **tvOS:** System font SF Pro; NY is available.
- **visionOS:** System font SF Pro; with NY, specify the styles you want.
  - Body and title styles are bolder; Extra Large Title 1 and Extra Large Title 2 serve wide editorial layouts.
  - Prefer 2D text with little or no depth; test legibility when people scale text.
  - Keep contrast high; default text is white on the system material.
  - Make text without a background bold rather than adding shadows.
  - Billboard text anchored in space so it always faces the wearer (rotates on the y-axis).
- **watchOS:** System font SF Compact; NY is available; complications use SF Compact Rounded.

**Specs**
- Families: San Francisco (sans serif: SF Pro, SF Compact, SF Arabic, SF Armenian, SF Georgian, SF Hebrew, SF Mono; rounded versions of all but SF Mono) and New York (serif).
- Both ship as variable fonts with dynamic optical sizes; discrete optical sizes (Text, Display) are only for tools without variable-font support.
- Weights Ultralight to Black; SF also has widths including Condensed and Expanded. SF Symbols use matching weights.
- Dynamic Type exists on iOS, iPadOS, tvOS, visionOS and watchOS.
- Emphasized weights come from symbolic traits: `bold()` in SwiftUI, `traitBold` in `UIFontDescriptor`; they can be medium, semibold, bold or heavy.

| Platform | Default size | Minimum size |
| --- | --- | --- |
| iOS, iPadOS | 17 pt | 11 pt |
| macOS | 13 pt | 10 pt |
| tvOS | 29 pt | 23 pt |
| visionOS | 17 pt | 12 pt |
| watchOS | 16 pt | 12 pt |

macOS dynamic system font variants (`NSFont`):

| Variant | API |
| --- | --- |
| Control content | `controlContentFont(ofSize:)` |
| Label | `labelFont(ofSize:)` |
| Menu | `menuFont(ofSize:)` |
| Menu bar | `menuBarFont(ofSize:)` |
| Message | `messageFont(ofSize:)` |
| Palette | `paletteFont(ofSize:)` |
| Title | `titleBarFont(ofSize:)` |
| Tool tips | `toolTipsFont(ofSize:)` |
| Document text (user) | `userFont(ofSize:)` |
| Monospaced document text (user fixed pitch) | `userFixedPitchFont(ofSize:)` |
| Bold system font | `boldSystemFont(ofSize:)` |
| System font | `systemFont(ofSize:)` |

iOS, iPadOS Dynamic Type sizes (cells: size/leading in pt; 144 ppi @2x, 216 ppi @3x):

| Style | Weight | Emphasized | xSmall | Small | Medium | Large (default) | xLarge | xxLarge | xxxLarge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Large Title | Regular | Bold | 31/38 | 32/39 | 33/40 | 34/41 | 36/43 | 38/46 | 40/48 |
| Title 1 | Regular | Bold | 25/31 | 26/32 | 27/33 | 28/34 | 30/37 | 32/39 | 34/41 |
| Title 2 | Regular | Bold | 19/24 | 20/25 | 21/26 | 22/28 | 24/30 | 26/32 | 28/34 |
| Title 3 | Regular | Semibold | 17/22 | 18/23 | 19/24 | 20/25 | 22/28 | 24/30 | 26/32 |
| Headline | Semibold | Semibold | 14/19 | 15/20 | 16/21 | 17/22 | 19/24 | 21/26 | 23/29 |
| Body | Regular | Semibold | 14/19 | 15/20 | 16/21 | 17/22 | 19/24 | 21/26 | 23/29 |
| Callout | Regular | Semibold | 13/18 | 14/19 | 15/20 | 16/21 | 18/23 | 20/25 | 22/28 |
| Subhead | Regular | Semibold | 12/16 | 13/18 | 14/19 | 15/20 | 17/22 | 19/24 | 21/28 |
| Footnote | Regular | Semibold | 12/16 | 12/16 | 12/16 | 13/18 | 15/20 | 17/22 | 19/24 |
| Caption 1 | Regular | Semibold | 11/13 | 11/13 | 11/13 | 12/16 | 14/19 | 16/21 | 18/23 |
| Caption 2 | Regular | Semibold | 11/13 | 11/13 | 11/13 | 11/13 | 13/18 | 15/20 | 17/22 |

iOS, iPadOS larger accessibility sizes (size/leading in pt):

| Style | Weight | Emphasized | AX1 | AX2 | AX3 | AX4 | AX5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Large Title | Regular | Bold | 44/52 | 48/57 | 52/61 | 56/66 | 60/70 |
| Title 1 | Regular | Bold | 38/46 | 43/51 | 48/57 | 53/62 | 58/68 |
| Title 2 | Regular | Bold | 34/41 | 39/47 | 44/52 | 50/59 | 56/66 |
| Title 3 | Regular | Semibold | 31/38 | 37/44 | 43/51 | 49/58 | 55/65 |
| Headline | Semibold | Semibold | 28/34 | 33/40 | 40/48 | 47/56 | 53/62 |
| Body | Regular | Semibold | 28/34 | 33/40 | 40/48 | 47/56 | 53/62 |
| Callout | Regular | Semibold | 26/32 | 32/39 | 38/46 | 44/52 | 51/60 |
| Subhead | Regular | Semibold | 25/31 | 30/37 | 36/43 | 42/50 | 49/58 |
| Footnote | Regular | Semibold | 23/29 | 27/33 | 33/40 | 38/46 | 44/52 |
| Caption 1 | Regular | Semibold | 22/28 | 26/32 | 32/39 | 37/44 | 43/51 |
| Caption 2 | Regular | Semibold | 20/25 | 24/30 | 29/35 | 34/41 | 40/48 |

macOS built-in text styles (144 ppi @2x):

| Text style | Weight | Size (pt) | Line height (pt) | Emphasized weight |
| --- | --- | --- | --- | --- |
| Large Title | Regular | 26 | 32 | Bold |
| Title 1 | Regular | 22 | 26 | Bold |
| Title 2 | Regular | 17 | 22 | Bold |
| Title 3 | Regular | 15 | 20 | Semibold |
| Headline | Bold | 13 | 16 | Heavy |
| Body | Regular | 13 | 16 | Semibold |
| Callout | Regular | 12 | 15 | Semibold |
| Subheadline | Regular | 11 | 14 | Semibold |
| Footnote | Regular | 10 | 13 | Semibold |
| Caption 1 | Regular | 10 | 13 | Medium |
| Caption 2 | Medium | 10 | 13 | Semibold |

tvOS built-in text styles (72 ppi @1x, 144 ppi @2x):

| Text style | Weight | Size (pt) | Leading (pt) | Emphasized weight |
| --- | --- | --- | --- | --- |
| Title 1 | Medium | 76 | 96 | Bold |
| Title 2 | Medium | 57 | 66 | Bold |
| Title 3 | Medium | 48 | 56 | Bold |
| Headline | Medium | 38 | 46 | Bold |
| Subtitle 1 | Regular | 38 | 46 | Medium |
| Callout | Medium | 31 | 38 | Bold |
| Body | Medium | 29 | 36 | Bold |
| Caption 1 | Medium | 25 | 32 | Bold |
| Caption 2 | Medium | 23 | 30 | Bold |

watchOS Dynamic Type sizes (size/leading in pt):

| Style | Weight | Emphasized | xSmall | Small (default 38mm) | Large (default 40mm/41mm/42mm) | xLarge (default 44mm/45mm/49mm) | xxLarge | xxxLarge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Large Title | Regular | Bold | 30/32.5 | 32/34.5 | 36/38.5 | 40/42.5 | 41/43.5 | 42/44.5 |
| Title 1 | Regular | Semibold | 28/30.5 | 30/32.5 | 34/36.5 | 38/40.5 | 39/41.5 | 40/42.5 |
| Title 2 | Regular | Semibold | 24/26.5 | 26/28.5 | 28/30.5 | 30/32.5 | 31/33.5 | 32/34.5 |
| Title 3 | Regular | Semibold | 17/19.5 | 18/20.5 | 19/21.5 | 20/22.5 | 21/23.5 | 22/24.5 |
| Headline | Semibold | Semibold | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 | 18/20.5 | 19/21.5 |
| Body | Regular | Semibold | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 | 18/20.5 | 19/21.5 |
| Caption 1 | Regular | Semibold | 13/15.5 | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 | 18/20.5 |
| Caption 2 | Regular | Semibold | 12/14.5 | 13/15.5 | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 |
| Footnote 1 | Regular | Semibold | 11/13.5 | 12/14.5 | 13/15.5 | 14/16.5 | 15/17.5 | 16/18.5 |
| Footnote 2 | Regular | Semibold | 10/12.5 | 11/13.5 | 12/14.5 | 13/15.5 | 14/16.5 | 15/17.5 |

watchOS larger accessibility sizes (size/leading in pt):

| Style | Weight | Emphasized | AX1 | AX2 | AX3 |
| --- | --- | --- | --- | --- | --- |
| Large Title | Regular | Bold | 44/46.5 | 45/47.5 | 46/48.5 |
| Title 1 | Regular | Semibold | 42/44.5 | 43/46 | 44/47 |
| Title 2 | Regular | Semibold | 34/41 | 35/37.5 | 36/38.5 |
| Title 3 | Regular | Semibold | 24/26.5 | 25/27.5 | 26/28.5 |
| Headline | Semibold | Semibold | 21/23.5 | 22/24.5 | 23/25.5 |
| Body | Regular | Semibold | 21/23.5 | 22/24.5 | 23/25.5 |
| Caption 1 | Regular | Semibold | 18/20.5 | 19/21.5 | 20/22.5 |
| Caption 2 | Regular | Semibold | 17/19.5 | 18/20.5 | 19/21.5 |
| Footnote 1 | Regular | Semibold | 16/18.5 | 17/19.5 | 18/20.5 |
| Footnote 2 | Regular | Semibold | 15/17.5 | 16/17.5 | 17/19.5 |

Tracking (cells: 1/1000 em, then points; SF Pro and SF Pro Rounded and New York apply to iOS, iPadOS, visionOS; SF Compact and SF Compact Rounded to watchOS):

| Size (pt) | SF Pro | SF Pro Rounded | New York | SF Compact | SF Compact Rounded |
| --- | --- | --- | --- | --- | --- |
| 6 | +41, +0.24 | +87, +0.51 | +40, +0.23 | +50, +0.29 | +28, +0.16 |
| 7 | +34, +0.23 | +80, +0.54 | +32, +0.22 | +30, +0.21 | +26, +0.18 |
| 8 | +26, +0.21 | +72, +0.57 | +25, +0.20 | +30, +0.23 | +24, +0.19 |
| 9 | +19, +0.17 | +65, +0.57 | +20, +0.18 | +30, +0.26 | +22, +0.19 |
| 10 | +12, +0.12 | +58, +0.57 | +16, +0.15 | +30, +0.29 | +20, +0.20 |
| 11 | +6, +0.06 | +52, +0.56 | +11, +.12 | +24, +0.26 | +18, +0.19 |
| 12 | 0, 0.0 | +46, +0.54 | +6, +0.07 | +20, +0.23 | +16, +0.19 |
| 13 | -6, -0.08 | +40, +0.51 | +4, +0.05 | +16, +0.20 | +14, +0.18 |
| 14 | -11, -0.15 | +35, +0.48 | +2, +0.03 | +14, +0.19 | +12, +0.16 |
| 15 | -16, -0.23 | +30, +0.44 | +0, +0.00 | +4, +0.06 | +10, +0.15 |
| 16 | -20, -0.31 | +26, +0.41 | -2, -0.03 | 0, 0.00 | +8, +0.12 |
| 17 | -26, -0.43 | +22, +0.37 | -4, -0.07 | -4, -0.07 | +6, +0.10 |
| 18 | -25, -0.44 | +21, +0.37 | -6, -0.11 | -8, -0.14 | +4, +0.07 |
| 19 | -24, -0.45 | +20, +0.37 | -8, -0.15 | -12, -0.22 | +2, +0.04 |
| 20 | -23, -0.45 | +18, +0.36 | -10, -0.20 | 0, 0.00 | 0, 0.00 |
| 21 | -18, -0.36 | +17, +0.35 | -10, -0.21 | -2, -0.04 | -2, -0.04 |
| 22 | -12, -0.26 | +16, +0.34 | -10, -0.23 | -4, -0.09 | -4, -0.09 |
| 23 | -4, -0.10 | +16, +0.35 | -11, -0.25 | -6, -0.13 | -6, -0.13 |
| 24 | +3, +0.07 | +15, +0.35 | -11, -0.26 | -8, -0.19 | -8, -0.19 |
| 25 | +6, +0.15 | +14, +0.35 | -11, -0.27 | -10, -0.24 | -10, -0.24 |
| 26 | +8, +0.22 | +14, +0.36 | -12, -0.29 | -11, -0.28 | -11, -0.28 |
| 27 | +11, +0.29 | +14, +0.36 | -12, -0.32 | -12, -0.30 | -12, -0.30 |
| 28 | +14, +0.38 | +13, +0.36 | -12, -0.33 | -12, -0.34 | -12, -0.34 |
| 29 | +14, +0.40 | +13, +0.37 | -12, -0.34 | -14, -0.38 | -14, -0.38 |
| 30 | +14, +0.40 | +12, +0.37 | -12, -0.37 | -14, -0.42 | -14, -0.42 |
| 31 | +13, +0.39 | +12, +0.36 | -13, -0.39 | -15, -0.45 | -15, -0.45 |
| 32 | +13, +0.41 | +12, +0.38 | -13, -0.41 | -16, -0.50 | -16, -0.50 |
| 33 | +12, +0.40 | +12, +0.39 | -13, -0.42 | -17, -0.55 | -17, -0.55 |
| 34 | +12, +0.40 | +12, +0.38 | -14, -0.45 | -18, -0.60 | -18, -0.60 |
| 35 | +11, +0.38 | +11, +0.38 | -14, -0.48 | -18, -0.63 | -18, -0.63 |
| 36 | +10, +0.37 | +11, +0.39 | -14, -0.49 | -20, -0.69 | -20, -0.69 |
| 37 | +10, +0.36 | +10, +0.38 | — | -20, -0.72 | -20, -0.72 |
| 38 | +10, +0.37 | +10, +0.39 | -14, -0.52 | -20, -0.74 | -20, -0.74 |
| 39 | +10, +0.38 | +10, +0.38 | — | -20, -0.76 | -20, -0.76 |
| 40 | +10, +0.37 | +10, +0.39 | -14, -0.55 | -20, -0.78 | -20, -0.78 |
| 41 | +9, +0.36 | +10, +0.38 | — | -20, -0.80 | -20, -0.80 |
| 42 | +9, +0.37 | +10, +0.39 | -14, -0.57 | -20, -0.82 | -20, -0.82 |
| 43 | +9, +0.38 | +9, +0.38 | — | -20, -0.84 | -20, -0.84 |
| 44 | +8, +0.37 | +8, +0.37 | -14, -0.62 | -20, -0.86 | -20, -0.86 |
| 45 | +8, +0.35 | +8, +0.37 | — | -20, -0.88 | -20, -0.88 |
| 46 | +8, +0.36 | +8, +0.36 | -14, -0.65 | -20, -0.92 | -20, -0.92 |
| 47 | +8, +0.37 | +8, +0.37 | — | -20, -0.94 | -20, -0.94 |
| 48 | +8, +0.35 | +8, +0.35 | -14, -0.68 | -20, -0.96 | -20, -0.96 |
| 49 | +7, +0.33 | +8, +0.36 | — | -21, -1.00 | -21, -1.00 |
| 50 | +7, +0.34 | +7, +0.34 | -14, -0.71 | -21, -1.03 | -21, -1.03 |
| 51 | +7, +0.35 | +6, +0.32 | — | -21, -1.05 | -21, -1.05 |
| 52 | +6, +0.33 | +6, +0.33 | -14, -0.74 | -21, -1.07 | -21, -1.07 |
| 53 | +6, +0.31 | +6, +0.31 | — | -22, -1.11 | -22, -1.11 |
| 54 | +6, +0.32 | +6, +0.32 | -15, -0.79 | -22, -1.13 | -22, -1.13 |
| 56 | +6, +0.30 | +6, +0.30 | — | -22, -1.20 | -22, -1.20 |
| 58 | +5, +0.28 | +4, +0.25 | -15, -0.85 | -22, -1.25 | -22, -1.25 |
| 60 | +4, +0.26 | +4, +0.23 | — | -22, -1.32 | -22, -1.32 |
| 62 | +4, +0.24 | +4, +0.21 | -15, -0.91 | -22, -1.36 | -22, -1.36 |
| 64 | +4, +0.22 | +3, +0.19 | — | -23, -1.44 | -23, -1.44 |
| 66 | +3, +0.19 | +2, +0.16 | -15, -0.97 | -24, -1.51 | -24, -1.51 |
| 68 | +2, +0.17 | +2, +0.13 | — | -24, -1.56 | -24, -1.56 |
| 70 | +2, +0.14 | +2, +0.14 | -16, -1.06 | -24, -1.64 | -24, -1.64 |
| 72 | +2, +0.14 | +2, +0.11 | -16, -1.09 | -24, -1.69 | -24, -1.69 |
| 76 | +1, +0.07 | +1, +0.07 | — | -25, -1.86 | -25, -1.86 |
| 80 | 0, 0 | 0, 0.00 | -16, -1.21 | -26, -1.99 | -26, -1.99 |
| 84 | 0, 0 | 0, 0.00 | — | -26, -2.13 | -26, -2.13 |
| 88 | 0, 0 | 0, 0.00 | -16, -1.33 | -26, -2.28 | -26, -2.28 |
| 92 | 0, 0 | 0, 0.00 | — | -28, -2.47 | -28, -2.47 |
| 96 | 0, 0 | 0, 0.00 | -16, -1.50 | -28, -2.62 | -28, -2.62 |
| 100 | — | — | -16, -1.56 | — | — |
| 120 | — | — | -16, -1.88 | — | — |
| 140 | — | — | -16, -2.26 | — | — |
| 160 | — | — | -16, -2.58 | — | — |
| 180 | — | — | -17, -2.99 | — | — |
| 200 | — | — | -17, -3.32 | — | — |
| 220 | — | — | -18, -3.76 | — | — |
| 240 | — | — | -18, -4.22 | — | — |
| 260 | — | — | -18, -4.57 | — | — |

macOS and tvOS tracking equal the SF Pro column except: macOS 52 pt = +6, +0.31; 53 pt = +6, +0.33; tvOS 52 pt = +6, +0.31; 53 pt = +6, +0.33. Not every tool expresses tracking in 1/1000 em.

**APIs:** `Font.Design`, `leading(_:)`, `bold()`, `UIFontDescriptor` `traitBold`, `numberOfLines`, `isAccessibilityCategory`, SwiftUI Text input and output, UIKit Text display and fonts, AppKit Fonts, `NSFont`.

Last change: December 16, 2025 — added emphasized weights to the Dynamic Type tables for each platform.

## Writing
Source: https://developer.apple.com/design/human-interface-guidelines/writing

Interface text is part of the experience, from onboarding to alerts to accessibility descriptions. Define one voice, adapt tone to the situation, and write short, plain, consistent copy.

**Do**
- Set a voice that fits the audience and the app's values; keep a list of standard terms and reuse it.
- Adapt tone to what people are doing: direct and calm for serious moments (a fall alert), light for achievements.
- Cut every word that is not needed; read the text aloud.
- Write plain, jargon-free, gender-neutral text that localizes and works with VoiceOver.
- Put the most important information first on each screen; split several ideas across screens.
- Label buttons and links with verbs ("Send"); make link text descriptive instead of "Click here".
- Pick a capitalization style per element type (for example title case for all alerts) and keep it.
- Label multistep flows consistently: a start label such as "Get Started", then "Continue" or "Next" (or a hint at the next step), and "Done" at the end.
- Describe gestures correctly per device ("tap" on touch devices, not "click").
- Keep text brief on small screens (iPhone, Apple Watch) and on TVs, which are read from a distance and often by several people.
- Give empty states a clear next action, ideally with a button or link; keep crucial information out of them, since they are temporary.
- Place error messages next to the problem, without blame, and say how to fix it (state the rule, such as a minimum length).
- Match the delivery method (notification, alert, action sheet) to urgency, context and needed detail.
- Name settings plainly; if needed, describe what the on state does. Link directly to a setting rather than describing its path.
- Label every text field and use placeholder text to show the format (an example address or a short description); explain the correct input instead of listing what is wrong.

**Avoid**
- Cute or clever labels where a plain verb works.
- Possessives such as "my" and "your" where they add nothing; switching perspective; "we" in any copy, especially errors (say what failed instead).
- Interjections such as "oops" in errors; vague messages such as "Invalid name".
- Relying on wording to fix an error that many people hit; redesign the interaction instead.

**Platform notes**
- No additional considerations for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

Last change: December 16, 2025 — clarified language patterns and added guidance on possessive pronouns.
