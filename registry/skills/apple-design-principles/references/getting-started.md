# Getting started

This file covers Apple's eight design principles and the platform overviews: the device traits and
best practices for iOS, iPadOS, macOS, tvOS, visionOS, watchOS, games and iPhone Duo.

## Pages
- [Design principles](#design-principles): the eight principles behind every HIG rule, with their rules
- [Designing for iOS](#designing-for-ios): iPhone traits, inputs, system features and best practices
- [Designing for iPadOS](#designing-for-ipados): iPad traits, combined inputs, multitasking and best practices
- [Designing for macOS](#designing-for-macos): Mac traits, menu bar, windows, keyboard, pointer and touch
- [Designing for tvOS](#designing-for-tvos): TV traits, remote, focus system and multiuser support
- [Designing for visionOS](#designing-for-visionos): space, immersion, passthrough, eyes and hands, comfort
- [Designing for watchOS](#designing-for-watchos): glanceable interactions, Digital Crown, complications, notifications
- [Designing for games](#designing-for-games): game onboarding, text and button sizes, inputs, inclusion
- [Designing for iPhone Duo](#designing-for-iphone-duo): two displays, poses, reserved regions, vertical controls

## Design principles
Source: https://developer.apple.com/design/human-interface-guidelines/design-principles

Eight principles form the base of all HIG guidance. Use them to weigh conflicting priorities and to
justify a design or review decision; there is no single correct way to apply them.

**Purpose** — build something that matters to the people you design for.
- Ask at every stage what the product is for, and check that the design serves that goal.
- Rank features by how people want to use the app; make the most important ones excellent.
- Study existing solutions, do not rebuild them, and make the design show what sets the product apart.

**Agency** — let people work in their own way.
- Get people straight to their task or content; the interface stays unobtrusive but available.
- Do not lock people into fixed flows or modes. Make any required guided flow easy to skip or exit.
- Make actions reversible and previous states reachable, so a mistake costs no time or work.
- Keep people informed about what happens.

**Responsibility** — act in the interest of the people who use the product.
- Make the app's intent clear from the first interaction.
- Explain why when you ask for a permission; say what data you collect and how you use it.
- Collect only the data the product needs, protect it, and plan safeguards against misuse and harm.

**Familiarity** — build on what people already know.
- Draw on real-world and software concepts people already understand.
- Once an element has a look or behavior, use it the same way everywhere.
- Show clearly when controls are available and when content changes; use system patterns for alerts and choices.

**Flexibility** — adapt to many contexts and needs.
- Design for the full diversity of people; make accessibility a priority from the start.
- Keep content and controls in stable, predictable positions across platforms and configurations; ease transitions with natural animation.
- Support as many inputs as you can: voice, touch, keyboard and more.
- Give every supported platform the same level of care, so the app feels native on each.

**Simplicity** — be clear and direct.
- Keep only what is necessary; simplicity is not minimalism. Keep important things close and let the rest recede.
- Use exactly the words a concept or control label needs.
- Make form and function obvious: recognizable controls and a consistent structure that shows where people are and what comes next.

**Craft** — care about every detail.
- Make each decision on purpose: visuals, animation, wording and sound all set the quality.
- Prototype early, try new approaches, discard what fails, and test in real-world settings for reliability and performance.
- Keep the app current with new platform capabilities and patterns after it ships.

**Delight** — make the experience human.
- Choose the emotion the app should cause (energy, calm, thrill) and let it shape the design.
- Treat each interaction, from a button press to an error message, as a chance to add fitting character.
- Never let delight or decoration get in the way of the core task; find the right balance of practical and playful.
- Delight comes from the whole: freedom to act, safety to explore, familiar metaphors, smooth context changes.

Last change: June 8, 2026 — the design principles returned to the guidelines.

## Designing for iOS
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-ios

iPhone's display is mid-sized with high resolution; people hold it in one or both hands at one to two feet,
in portrait or landscape. Sessions range from a minute to more than an hour, with frequent app switching.

**Do**
- Keep onscreen controls few so the primary task and content stay central; make secondary details and actions reachable with little interaction.
- Adapt to orientation changes, Dark Mode and Dynamic Type, and let people choose their configuration.
- Put frequent controls in the middle or bottom of the display, where a hand reaches easily.
- Support swipe to go back and swipe actions in list rows.
- With permission, use platform data (payments, biometric authentication, location) so people do not type data in.

**Platform notes**
- **Inputs:** Multi-Touch gestures, virtual keyboard, voice, gyroscope and accelerometer, personal data, spatial interactions.
- **System features:** widgets, Home Screen quick actions, Spotlight, Shortcuts, activity views.

## Designing for iPadOS
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados

iPad has a large, high-resolution display, held, laid flat or on a stand, usually within about
3 feet. People often run several apps at once and combine input modes.

**Do**
- Use the large display to put content first; keep modal views and full-screen transitions to a minimum.
- Place controls within easy reach but out of the content's way.
- Choose content size and density from the viewing distance and the current input mode.
- Support Multi-Touch, a physical keyboard or trackpad, and Apple Pencil; consider interactions that combine several inputs.
- Adapt to orientation, multitasking modes, Dark Mode and Dynamic Type changes, and run well in macOS.

**Platform notes**
- **Inputs:** Multi-Touch gestures, virtual and physical keyboards, pointing devices, Apple Pencil, voice.
- **System features:** multitasking, widgets, drag and drop.

## Designing for macOS
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-macos

A Mac is stationary, with a large, high-resolution display that people can extend with more displays
or an iPad through Sidecar. Sessions run from minutes to hours, with many apps open at once.

**Do**
- Use the large display to show more content in fewer nested levels with less modality, at a comfortable density.
- Let people resize, hide, show and move windows, and support full-screen mode.
- Put every command people need in the menu bar.
- Support keyboard shortcuts and keyboard-only work.
- Support high-precision input for pixel-exact selection and editing.
- Support standard gestures on trackpads and touch displays; for touch, enlarge tap targets and offer controls that grow while touched.
- Let people customize toolbars, window views, colors and fonts.

**Avoid**
- Changing control size or density for touch; keep them tuned for keyboard and pointer.
- Designing touch for long sessions; people reach forward to the display, so touch use stays brief and deliberate.

**Platform notes**
- **Inputs:** keyboard and pointing device first; also trackpad or touch-display gestures, Siri, Voice Control, game controllers.
- **System features:** the menu bar, file management, full screen, Dock menus.
- Make transitions between active and inactive states smooth when people switch apps.

Last change: October 28, 2026 — guidance for touch input added.

## Designing for tvOS
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos

A TV has a very large, high-resolution display viewed from 8 feet or more, sometimes while people
move around the room. Sessions are often long and immersive, sometimes with picture-in-picture.

**Do**
- Base interactions on the fluid, familiar gestures of the Siri Remote.
- Use the tvOS focus system to highlight and enlarge items, so people always know where they are.
- Use edge-to-edge artwork, subtle fluid animation and rich audio that stay legible from across the room.
- Make sign-in easy and rare, handle shared sign-in, and switch profiles automatically when the viewer changes.

**Platform notes**
- **Inputs:** remote, game controller, voice, apps on the person's other devices.
- **System features:** TV app integration, SharePlay, Top Shelf, TV provider accounts.

Last change: September 14, 2022 — best practices for multiuser support refined.

## Designing for visionOS
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos

Apple Vision Pro places windows, volumes and 3D objects in an unlimited space. Apps launch in the
Shared Space next to other apps; a Full Space runs one app alone, blended with or replacing the surroundings.

**Do**
- Use space, Spatial Audio and immersion, and blend in passthrough and eye-and-hand input naturally.
- Give each key moment the lowest level of immersion that suits it; most moments do not need full immersion.
- Use standard windows (planes in space with familiar controls) for contained, UI-centric tasks.
- Keep content in the field of view, placed relative to the person's head.
- Support indirect gestures that work with hands resting in the lap or at the sides.
- Keep direct-gesture targets close, and keep direct interactions short.
- Use SharePlay with spatial Personas for shared activities.

**Avoid**
- Content that makes people turn their head or change position to interact.
- Motion that is overwhelming, jarring, too fast or lacks a stationary frame of reference.
- Encouraging much physical movement in a fully immersive experience.

**Platform notes**
- **Inputs:** people look at an object and make an indirect gesture (a tap) to activate it, or touch it directly.
- The Digital Crown sets the amount of passthrough. The system scales window content dynamically with distance.
- Accessibility: VoiceOver, Switch Control, Dwell Control, Guided Access, Head Pointer and more; system components include support by default.
- Safety: not for use while driving or operating heavy machinery, or near hazards such as balconies, streets or stairs; for people aged 13 or older.

Last change: February 2, 2024 — a link to the Apple Vision Pro User Guide added.

## Designing for watchOS
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-watchos

Apple Watch has a small, high-resolution display about a foot away, used with the other hand.
Interactions often last under a minute; complications, notifications and Siri get more use than the app.

**Do**
- Support quick, glanceable, single-screen interactions with one or two simple gestures.
- Keep navigation hierarchy shallow; use the Digital Crown for vertical scrolling and screen switching.
- Anticipate needs and use on-device data to offer content relevant now or very soon.
- Use complications for relevant, dynamic data on the watch face that opens the app on tap.
- Use notifications for timely, high-value information and actions that need no app launch.
- Use background color for supporting information and materials for hierarchy and place.
- Make the app work on its own, adding detail beyond notifications and complications.

**Platform notes**
- **Inputs:** Digital Crown, tap, swipe, drag, the Action button, shortcuts, sensors (GPS, blood oxygen, heart, altimeter, accelerometer, gyroscope).
- **System features:** complications, notifications, Always On, watch faces.

Last change: June 5, 2023 — guidance on glanceable, focused apps and Digital Crown navigation strengthened.

## Designing for games
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-games

Guidance for creating or porting a game so it feels native on every Apple platform, from first launch
to input, legibility, inclusion and Apple technologies.

**Do**
- Make the game playable as soon as installation ends; keep the initial download to 30 minutes or less and fetch more in the background.
- Pick defaults from the device: resolution, paired accessories and controllers, accessibility settings.
- Teach mechanics inside a playable tutorial; offer any written tutorial as optional reference.
- Ask for permissions (sensors, hand tracking) inside the scenario that needs them, such as between a cutscene and first hand control.
- Ask for a rating or review only after people have spent quality time playing.
- Keep text high in contrast and at or above each platform's minimum size.
- Use resolution-independent assets, or match the device resolution; in visionOS prefer vector art.
- Respect rounded corners and camera housings by using platform safe areas.
- Make in-game menus work at all aspect ratios (16:10, 19.5:9, 4:3) and both orientations, with relative constraints.
- Support a distraction-free full-screen mode; in visionOS a Full Space can surround the player.
- Support each platform's default input, and check control sizes and menus when moving from pointer to touch.
- Support physical controllers on every platform except watchOS, and always offer an alternative input.
- On iPhone and iPad, offer direct touch on game elements and virtual controls over the content.
- Never rely on color alone; give cutscenes descriptive subtitles.
- Let players customize type size, control mapping, motion intensity and sound balance.
- Offer avatar and identity options that cover a wide range of human characteristics.
- Use Game Center, GameSave, Core Haptics, Spatial Audio and technologies such as AR, ML and HealthKit where they fit.

**Avoid**
- Fixed layouts; build a device-specific layout only when needed.
- Making a written tutorial a requirement before play.
- Stereotypes in characters and stories; treat real cultures and languages with respect.

**Specs**

| Platform | Default text size | Minimum text size |
| --- | --- | --- |
| iOS, iPadOS | 17 pt | 11 pt |
| macOS | 13 pt | 10 pt |
| tvOS | 29 pt | 23 pt |
| visionOS | 17 pt | 12 pt |
| watchOS | 16 pt | 12 pt |

| Platform | Default button size | Minimum button size |
| --- | --- | --- |
| iOS, iPadOS | 44x44 pt | 28x28 pt |
| macOS | 28x28 pt | 20x20 pt |
| tvOS | 66x66 pt | 56x56 pt |
| visionOS | 60x60 pt | 28x28 pt |
| watchOS | 44x44 pt | 28x28 pt |

| Platform | Default interaction methods | Additional interaction methods |
| --- | --- | --- |
| iOS | Touch | Game controller |
| iPadOS | Touch | Game controller, keyboard, mouse, trackpad, Apple Pencil |
| macOS | Keyboard, mouse, trackpad | Game controller, touch |
| tvOS | Remote | Game controller, keyboard, mouse, trackpad |
| visionOS | Touch | Game controller, keyboard, mouse, trackpad, spatial game controller |
| watchOS | Touch | – |

- Core Haptics: iOS, iPadOS, tvOS, visionOS and many game controllers.

**APIs:** GameKit, GameSave, Core Haptics, HealthKit

Last change: June 9, 2025 — guidance for touch controls and Game Center updated.

## Designing for iPhone Duo
Source: https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo

iPhone Duo has an outer and an inner display, each with a front camera, joined by a center hinge
for many poses. It is still an iPhone, so iOS rules apply; apps built with system components and resizing adapt with little work.

Anatomy, in words: when closed, the outer display moves toolbars and tab bars to one side to keep
vertical space for content. The outer camera sits in a corner, always visible, aligned with the side
controls. The inner camera hides behind the display until active. The hinge reduces usable space as the device folds.
Poses include half folded like a book, flat on a surface and standing on an edge.

**Do**
- Use size classes: compact width for the outer display, regular width for the inner; let the layout grow, not change.
- Lay out controls and content with size classes, safe area insets and layout margins.
- Keep functionality and element state the same on both displays; add one more hierarchy level on the inner display when useful (Mail shows list and message side by side).
- Give access to the same controls and content in every pose, even when controls overflow.
- In games, lock orientation if needed but fill the screen in every pose; keep text and control sizes stable.
- Prefer changing a game's aspect ratio; if you must letterbox or pillarbox, fill the padding with artwork.
- Prefer containers that adapt to the fold, such as a split view; use an even number of grid columns.
- Use `ReservedRegion` to keep important elements away from the fold center when the system does not.
- Make only small adjustments as the device folds, so controls stay easy to find.
- Use an arrangement view when the layout already resembles one: HStack or VStack maps to split, ZStack to overlay.
- Put navigation containers (navigation split view, tab view) around an arrangement view, not inside it.
- Use safe areas so side controls, including another app's in Split View, never cover content.
- Keep controls' relative positions similar across poses.
- Order vertical toolbar items: primary navigation (Back, Close) at the top, then prominent actions (Done), then the other groups as they were.
- Set visibility priorities so frequent actions (Compose, New Note) and badged items stay visible longest; items overflow bottom to top by default.
- Consider full-width layouts for visual, non-scrolling screens that do not conflict with the Dynamic Island or status bar.
- Group toolbar items with `ToolbarItemGroup` or `UIBarButtonItemGroup` instead of fixed spacing.
- Keep controls next to the content area they affect (Mail's list controls stay above the leading pane).
- Give every non-text toolbar item both a title and a symbol; the title appears in overflow and expanded forms.
- When space is short, keep the tab bar in navigation-focused views (toolbar items overflow, the default); minimize the tab bar in task-focused views.
- Move your own overflow actions into the system overflow menu; use the ellipsis symbol only for overflow.

**Avoid**
- Fixed widths and dependencies on one display.
- A custom layout per pose.
- Large rearrangements or vanishing controls during folding.
- Text-based toolbar buttons; text labels keep a bar horizontal, so prefer symbols.
- Overriding the default side placement of bars.

**Platform notes**
- Side controls hold the Dynamic Island, status bar, toolbar (with navigation buttons) and tab bar, top to bottom.
- The inner display in portrait keeps standard horizontal bars; the outer display, and the inner display in landscape, put bars on the side.
- In Split View on the inner display, each app puts its controls on its outer edge.
- Side controls stay aligned with the hardware and do not flip in right-to-left languages.
- Reserved regions: the outer camera (always present, grows into the Dynamic Island for Live Activities), the inner camera (only while active; UI moves aside), and the fold region (only when partially open).
- Alerts, context menus and sheets move away from the fold automatically; split views adjust column widths and margins.
- A split view collapses to one pane on the outer display and expands on the inner display.
- A split arrangement divides horizontally when wider than tall, vertically when taller than wide; you can limit its axes.
- An overlay arrangement stacks primary over secondary, and moves them to each side when partially folded; you can collapse the secondary.
- Use Device Hub in Xcode to preview poses.

**APIs:** `safeAreaInsets`, `ReservedRegion`, `UIView.ReservedRegion`, `NavigationSplitView`, `UISplitViewController`, `ArrangementView`, `UIArrangementViewController`, `HStack`, `VStack`, `ZStack`, `ToolbarItemVisibilityPriority`, `UIBarButtonItemVisibilityPriority`, `ToolbarItemGroup`, `UIBarButtonItemGroup`, `Label`, `UIBarButtonItem`, `ToolbarVerticalCompressionBehavior`, `UIVerticalBarCompressionBehavior`, `ToolbarOverflowMenu`, `additionalOverflowItems`

Last change: September 9, 2026 — new page on poses, dual-display layouts and vertical toolbars and tab bars.
