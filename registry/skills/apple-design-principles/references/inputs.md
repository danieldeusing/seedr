# Inputs

This file covers the input methods across Apple platforms: hardware buttons, Apple Pencil, eyes,
focus, game controls, gestures, motion sensors, keyboards, nearby interactions, pointers and remotes.

## Pages
- [Action button](#action-button): iPhone and Apple Watch button that runs a chosen function
- [Apple Pencil and Scribble](#apple-pencil-and-scribble): marking, hover, double tap, squeeze, barrel roll, handwriting entry
- [Camera Control](#camera-control): iPhone camera button overlay with sliders and pickers
- [Digital Crown](#digital-crown): crown input on Apple Vision Pro and Apple Watch
- [Eyes](#eyes): gaze targeting, hover effect, spacing and custom hover effects
- [Focus and selection](#focus-and-selection): focus systems, focus rings, highlights and tvOS focus states
- [Game controls](#game-controls): touch controls and physical controllers for games
- [Gestures](#gestures): standard gestures, custom gestures and platform gesture specifics
- [Gyroscope and accelerometer](#gyroscope-and-accelerometer): motion data from device sensors
- [Keyboards](#keyboards): physical keyboard support and standard keyboard shortcuts
- [Nearby interactions](#nearby-interactions): distance and direction awareness between nearby devices
- [Pointing devices](#pointing-devices): pointer, trackpad and mouse behavior, especially on iPad
- [Remotes](#remotes): Siri Remote gestures, buttons and compatible remotes for tvOS

## Action button
Source: https://developer.apple.com/design/human-interface-guidelines/action-button

A hardware button on supported iPhone and Apple Watch models. People assign it an App Shortcut or a
system function at setup or in Settings; pressing it runs the shortcut as Siri or Spotlight would.

**Do**
- Offer a set of your app's essential, frequently used functions as App Shortcuts (for example, "Start Egg Timer").
- Label each action briefly: title-style capitalization, starts with a verb, present tense, no articles or prepositions, three words at most ("Start Race").
- Let the system teach people how to set up the button with your app.

**Avoid**
- A shortcut that only opens your app; the system already offers that.
- Your own tips that repeat the Settings guidance for the button.

**Platform notes**
- **iOS:** run actions without leaving the current context; use Live Activities and custom snippets (Set Timer asks for a duration, then starts a Live Activity).
- **watchOS:** the first press can drop a waypoint, start a dive or start a workout; later presses can mark a segment or move to the next workout modality.
- **watchOS:** make a secondary function follow logically from the first press, because people press without looking. Think twice before adding more than one.
- **watchOS:** use later presses to add functions, not to stop the task; put a stop option in the interface.
- **watchOS:** a press of the Action button and side button together pauses the current function, except where pausing is unsafe, such as during a dive.
- **iPadOS, macOS, tvOS, visionOS:** Not supported.

Last change: September 12, 2023 — guidance for iOS added.

## Apple Pencil and Scribble
Source: https://developer.apple.com/design/human-interface-guidelines/apple-pencil-and-scribble

Apple Pencil gives iPad apps pixel-exact input for notes, sketches, painting and markup, and works as
a pointer. Scribble turns handwriting into text in any text field, with on-device recognition.

**Do**
- Support what people try with real pens and pencils, such as writing in a document's margins.
- Make every control respond to Apple Pencil, so people never must switch to a finger.
- Make a mark the instant the tip touches the screen.
- Use tilt (altitude), pressure, orientation (azimuth) and barrel roll to vary strokes; map pressure to continuous properties like opacity or brush size.
- Make the pencil appear to act directly and immediately on the content it touches.
- Place controls where neither a left nor a right hand covers them; let people move them if needed.
- Hover: show a preview of the mark the tool will make (size, color); keep the preview stable as height changes.
- Hover: preview dynamic values (opacity, flow) at a mid-range value, not the extremes.
- Hover: consider showing tool menus near the tip, for example on squeeze or a keyboard modifier.
- Hover: show previews for Apple Pencil only, not for a pointing device.
- Double tap: honor the person's system setting (switch to eraser, switch to previous tool, show color picker, or nothing) where it fits.
- Double tap: if the system options make no sense, you can use it to switch modes (for example, raise or lower in a mesh tool).
- Double tap: offer custom behavior through a control that shows the current mode; make it discoverable but off by default.
- Squeeze (Apple Pencil Pro): respond to one quick squeeze with a discrete action, and show the result at once.
- Squeeze: show any revealed UI, like a contextual menu, close to the pencil.
- Scribble: let people write in custom text fields without tapping or selecting them first.
- Scribble: support writing wherever text entry feels natural, even in empty space (Reminders creates a new item below the last one).
- Scribble: hide placeholder text as soon as writing starts.
- Scribble: keep the field still while people write; delay any move or resize until they pause.
- Scribble: enlarge small fields before writing starts or during a pause.
- PencilKit: turn off dynamic Dark Mode color adjustment when people mark up a PDF or photo.
- PencilKit: in a compact environment, add undo and redo buttons (for example, in a toolbar); the tool picker has them only in regular width. Consider the 3-finger undo and redo gesture.

**Avoid**
- A button tap or special mode before people can draw.
- Strokes that seem to trigger unrelated actions or change content elsewhere on screen.
- Hover that starts an action, especially a destructive one.
- Double tap or squeeze for actions that change content or risk data loss; keep them easy to undo.
- Holding or repeated squeezes; they tire the hand.
- Barrel roll for navigation or for showing controls; use it only to change the mark.
- Autocompletion while people write, and autoscrolling of transcribed text during writing or selection.

**Platform notes**
- **iPadOS:** the only supported platform. **iOS, macOS, tvOS, visionOS, watchOS:** Not supported.
- Scribble works in all standard text components (text fields, text views, search fields, editable web fields) except password fields, and accepts only Apple Pencil input.
- Squeeze works only while the paired iPad screen is on and the pencil is not touching it; people can map squeeze to an App Shortcut instead.

**APIs:** PencilKit, PaperKit, `UIIndirectScribbleInteraction`, `UIScribbleInteraction`

Last change: May 7, 2024 — Apple Pencil Pro squeeze and barrel roll guidance added.

## Camera Control
Source: https://developer.apple.com/design/human-interface-guidelines/camera-control

A hardware control on iPhone 16 and iPhone 16 Pro that opens your camera experience. A light press shows an
overlay from the bezel; a light double press lists the controls; sliding a finger adjusts the chosen one.

Anatomy, in words: the overlay holds two control types. A slider picks from a range of values (for
example, contrast); a picker chooses discrete options (for example, grid on or off). The system also
offers optional standard zoom and exposure controls.

**Do**
- Use SF Symbols (see the Camera & Photos section) for each control; symbols name the function, not the current state.
- Keep control names short; labels follow Dynamic Type and long ones cover the viewfinder.
- Show units or symbols with slider values, such as EV, % or a custom string.
- Define prominent values (frequent or evenly spaced, like major zoom steps) so sliding lands on them easily.
- Keep your UI out of the overlay area next to the control, in portrait and landscape; make the viewfinder as large as possible.
- Enable or disable controls per camera mode (for example, disable video controls in photo mode).
- Put frequent controls in the middle and rarer ones at the sides; the system reopens the last used control.
- Offer a locked camera capture extension so people can launch your camera from the locked device, the Home Screen or other apps.

**Avoid**
- Custom symbols; the system does not support them.
- Duplicating overlay controls in your own UI while the overlay shows.
- Adding or removing controls at runtime; this is not possible.

**Platform notes**
- **iPadOS, macOS, watchOS, tvOS, visionOS:** Not supported.

**APIs:** `AVCaptureControl`, `AVCaptureSlider` (`localizedValueFormat`, `prominentValues`), LockedCameraCapture

Last change: September 9, 2024 — new page.

## Digital Crown
Source: https://developer.apple.com/design/human-interface-guidelines/digital-crown

A hardware input on Apple Vision Pro and Apple Watch. On Vision Pro it controls only the system; on
Apple Watch apps also receive its rotation for navigation, scrolling and controls.

**Do**
- Base navigation on the crown: vertical lists, tabs and scroll views; also give each crown interaction a touch equivalent.
- Use the crown to inspect data where it does not navigate (World Clock moves the time of day).
- Show visual feedback for every turn; without it people think the crown does nothing.
- Match the rate of change to the speed of the turn, so people can still pick precise values.
- Use the default haptic detents when they fit; turn them off if they clash with your animation.
- For tables whose rows differ a lot in height, switch from per-row detents to linear ones.

**Platform notes**
- **visionOS:** the crown adjusts volume, sets immersion in a portal, Environment or Full Space, recenters content, opens Accessibility settings and returns to the Home View. Apps get no direct crown data.
- **watchOS:** since watchOS 10 the crown is the main navigation input: Smart Stack on the watch face, vertical app list on the Home Screen, vertical tabs, lists and pages in apps.
- **watchOS:** apps cannot respond to crown presses; the system reserves them.
- **watchOS:** most models give linear haptic detents per turn distance; some system controls, like tables, tick per row.
- **iOS, iPadOS, macOS, tvOS:** Not supported.

**APIs:** `WKCrownDelegate`

Last change: December 5, 2023 — artwork added and clarified that visionOS apps get no direct crown data.

## Eyes
Source: https://developer.apple.com/design/human-interface-guidelines/eyes

In visionOS people look at an element to target it; the system shows a hover effect, and an indirect
gesture such as a tap activates it. Some components expand on gaze, like a tab bar showing labels or a button showing a tooltip.

**Do**
- Always offer more than one way to interact, and support the accessibility features people use.
- Keep needed objects in the field of view; the system places the first window or volume in front of people.
- In a Full Space, you may request head pose data to place 3D content.
- Place content for reading or long use at least 1 meter away; put content close only for brief use.
- Prefer standard components, which react to gaze consistently.
- Give each interactive item enough space: a margin of at least 16 pt, or centers at least 60 pt apart.
- Guide attention with subtle cues: central placement, gentle motion, more contrast, color or scale changes.
- Give interactive items rounded shapes; corners pull the eye away from the center.
- Give a multi-element component (image plus label) one containing shape that the system can highlight as a whole.
- Custom hover effects: use them only for special moments; too many dilute the design and can cause discomfort.
- Custom hover effects: choose the delay. None (default) for subtle or inviting effects like a slider knob; short for tab bar expansion; long for extra information like tooltips.
- Custom hover effects: keep at least one primary view unchanged between the two states.
- Custom hover effects: test them thoroughly, ideally while wearing Apple Vision Pro.

**Avoid**
- Many fast eye movements across a wide area or through several depth levels.
- Visual noise and movement, especially in peripheral vision; new content near a looked-at button pulls the eyes away.
- Patterns or textures that repeat across the whole field of view; their parts can seem to sit at different depths.
- Crowding interactive items together.

**Platform notes**
- **visionOS:** for privacy, apps get no gaze location before a tap; system components report the tap.
- **visionOS:** a custom hover effect has two states, applied by the system out of process. It cannot run code or know when people look, so it cannot perform an action.
- **visionOS:** focus effects for keyboard or game controller are separate from the hover effect.
- **iOS, iPadOS, macOS, tvOS, watchOS:** Not supported.

Last change: June 10, 2024 — guidance for custom hover effects added.

## Focus and selection
Source: https://developer.apple.com/design/human-interface-guidelines/focus-and-selection

Focus shows which item an input such as a remote, game controller or keyboard targets. Focusing often
also selects, except where selection would cause a disruptive context change; tvOS needs a separate gesture to select.

**Do**
- Use the system focus effects; build custom ones only when truly necessary.
- When a focused item disappears during discrete directional input (keyboard, remote, controller), move focus to a nearby item.
- When it disappears with other input, hide the focus indicator.
- Match the platform's focus reach: in iPadOS and macOS support focus for content (list items, text fields, search fields), not for buttons, sliders or toggles.
- In tvOS, make every onscreen element focusable.
- Match platform visuals: in iPadOS and macOS a focused list item has white text on an accent-color highlight; unfocused items use standard text on gray.
- Use a focus ring for text and search fields, and a full-row highlight for lists and collections.

**Avoid**
- Moving focus without an action by the person.

**Platform notes**
- **iPadOS:** iPadOS 15 and later support keyboard focus for text fields, text views, sidebars, collection views and custom views.
- **iPadOS:** focus groups mark areas (sidebar, grid, list). Tab moves between groups; arrow keys move within a group.
- **iPadOS:** the halo (focus ring) outlines custom views or opaque cell content like images; refine its shape (rounded corners, Bézier paths) or position so badges and parent views do not clip it.
- **iPadOS:** the highlighted appearance tints text with the accent color; it shows on collection cells with content configurations and is not a focus effect.
- **iPadOS:** Tab visits groups in reading order (leading edge first, then downward); mark a vertical stack of custom views as one focus group to move down first.
- **iPadOS:** raise an item's priority to make it the group's primary item, which gets focus when the group does.
- **tvOS:** directional focus reaches every element with swipes or arrow keys; the parallax effect marks focus.
- **tvOS:** in full-screen content, gestures act on the content, not on focus.
- **tvOS:** do not show a pointer for menus and interface; free movement suits only some gameplay. A required pointer must be highly visible.
- **tvOS:** focus enlarges items; supply assets at the focused size and leave room so they do not crowd neighbors.
- **visionOS:** keyboards and game controllers use the same focus system; gaze uses the separate hover effect.
- **iOS, watchOS:** Not supported.

**Specs**

| tvOS state | Appearance and meaning |
| --- | --- |
| Unfocused | Not focused; less prominent, translucent background, close to the content behind it. |
| Focused | Larger, raised to the foreground with a deeper shadow, illuminated and animated. |
| Highlighted | Instant feedback when chosen, such as briefly inverted colors and an animation. |
| Selected | Chosen or activated, such as a filled heart for a favorite. |
| Unavailable | Cannot be focused or chosen; looks inactive, no shadow, low-contrast text. |

**APIs:** `UICollectionView`, `NSTableView`, `UIFocusHaloEffect`, `UICollectionViewCell`, `focusGroupIdentifier`, `UIFocusGroupPriority`, TVML Focus Attributes

Last change: October 24, 2023 — clarified that focus effects and the visionOS hover effect are separate.

## Game controls
Source: https://developer.apple.com/design/human-interface-guidelines/game-controls

Guidance for game input through touch controls, physical controllers and keyboards. Support each
platform's default input too: not every player owns a controller, and many prefer the familiar input.

**Do**
- Touch: decide if virtual controls are needed; they suit games with many actions or with movement control.
- Touch: replace virtual buttons with direct in-game gestures where possible, such as tapping an object to select it.
- Touch: place buttons inside safe areas, clear of the Home indicator and Dynamic Island.
- Touch: put frequent buttons near the thumb, outside the circular movement and camera zones; put menus at the top.
- Touch: show a visible press state (such as a glow) that shows around a covering finger; add sound and haptics.
- Touch: use artwork that shows the action, such as a weapon for attack.
- Touch: show and hide controls by context; for example, show movement controls only once the player touches the screen.
- Touch: merge actions into one control; use double tap or touch and hold for variants (a powered-up attack), and one control for walk and sprint.
- Touch: control movement on the left and the camera on the right, each with the largest possible area.
- Touch: show a movement thumbstick where the thumb lands, and pan the camera by direct touch.
- Controllers: always keep a fallback to the platform's default input.
- Controllers: in tvOS and visionOS you can require a controller (App Store badge "Game Controller Required"); check for one at launch and prompt people to connect it.
- Controllers: detect a paired controller and its profile automatically.
- Controllers: use the connected controller's own labels, colors and symbols in your UI.
- Controllers: with several controllers, show the glyphs of the one in use, and per-player glyphs in multiplayer.
- Controllers: refer to controller elements with SF Symbols, not text.
- Keyboards: prefer single-key commands (I for Inventory, M for Map, Space for the main action).
- Keyboards: test bindings on an Apple keyboard; remap Control to Command, which sits next to the Space bar.
- Keyboards: put high-value commands near W, A, S, D, and related actions on adjacent keys (number keys for inventory).
- Keyboards: let players customize key bindings.

**Avoid**
- Abstract shapes or controller names (A, X, R1) as touch button artwork.
- Mechanics that need simultaneous or sequenced presses of several touch buttons.

**Platform notes**
- **visionOS:** make spatial game controllers (such as PlayStation VR2 Sense) behave like hands: look and press a trigger to interact indirectly, or reach out and press a trigger to interact directly.
- **watchOS:** Not supported.

**Specs**
- Touch control minimum size: 44x44 pt for frequent controls, 28x28 pt for less important ones such as menus.

| Button | Expected UI behavior |
| --- | --- |
| A | Activates a control |
| B | Cancels an action or returns to previous screen |
| X | — |
| Y | — |
| Left shoulder | Navigates left to a different screen or section |
| Right shoulder | Navigates right to a different screen or section |
| Left trigger | — |
| Right trigger | — |
| Left/right thumbstick | Moves selection |
| Directional pad | Moves selection |
| Home/logo | Reserved for system controls |
| Menu | Opens game settings or pauses gameplay |

**APIs:** Touch Controller, Game Controller, `GCControllerElement`, `GCRequiresControllerUserInteraction`

Last change: June 9, 2025 — touch control practices and controller mapping for UI updated; spatial game controller guidance for visionOS added.

## Gestures
Source: https://developer.apple.com/design/human-interface-guidelines/gestures

A gesture is a physical movement that acts directly on an object; people make it on a touchscreen,
in midair or on an input device. Basic gestures such as tap, swipe and drag work on every platform, and people expect them everywhere.

**Do**
- Offer alternatives to every gesture: voice, keyboard, Switch Control.
- Make gestures do what people expect in every context; tap activates or selects.
- Respond at once, with feedback that shows the result and the movement needed to finish.
- Show clearly when a gesture is unavailable, such as a locked object or a disabled button.
- Add custom gestures only for frequent specialized tasks not covered by standard ones (games, drawing).
- Make each custom gesture discoverable, easy to perform, distinct from others, and never the only way to do an important action.
- Teach custom gestures in the app and test them in real use; hard to describe means hard to learn.
- Use shortcut gestures in addition to standard controls (edge swipe plus the Back button).

**Avoid**
- A familiar gesture for an app-specific action, or a new gesture for a standard action like scrolling.
- Custom gestures that conflict with system gestures, such as edge swipes in watchOS or the hand roll in visionOS.

**Platform notes**
- **iOS, iPadOS:** three-finger swipe left undoes and right redoes; three-finger pinch in copies and out pastes; four-finger swipe switches apps (iPadOS only); shake undoes or redoes.
- **iOS, iPadOS:** allow simultaneous gestures where useful, such as a joystick and fire buttons in a game.
- **macOS:** touch is secondary to keyboard and pointer; keep element layout and size the same when you support touch.
- **macOS:** enlarge tap targets beyond the visual bounds, not the controls; standard controls do this automatically.
- **macOS:** for small or dense controls, show a temporary touch-sized variant on tap, kept briefly after lift. Standard steppers, sliders and dials do this.
- **macOS:** never make touch the only route to a feature; give touch equivalents for pointer-only actions like shift-drag or hover menus.
- **macOS:** keep gestures people know from iPhone, iPad, trackpad or Magic Mouse, without conflict with system gestures.
- **macOS:** make custom gestures work on both touch display and trackpad, with modifier keys if needed.
- **tvOS:** people navigate with standard gestures on the Siri Remote, compatible remotes or touch-surface controllers.
- **visionOS:** indirect gestures target by gaze and act with the hands at any distance (tap finger and thumb). Direct gestures touch objects within reach; keep them for infrequent use.
- **visionOS:** support standard gestures everywhere, tap first.
- **visionOS:** offer indirect and direct interaction; prefer indirect for UI and buttons, direct and custom for close-up objects or game motions.
- **visionOS:** do not require specific body movements or positions; offer alternative inputs.
- **visionOS:** custom gestures need a Full Space and permission for hand data. Test for fatigue from raised arms and repetition.
- **visionOS:** offer a simpler alternative to multi-finger or two-hand gestures; never require a specific hand.
- **visionOS:** in visionOS 2 and later, looking at the palm opens Home and Control Center overlays; keep the area around the hand free and do not anchor content to hands or wrists.
- **visionOS:** in a Full Space, an immersive app can defer the overlay so a tap reveals the Home indicator; visionOS 1 apps defer it by default.
- **visionOS:** be careful with gestures that roll the hand, wrist and forearm; that motion opens system overlays.
- **watchOS:** in watchOS 11 and later, double tap scrolls lists and scroll views, moves between vertical tabs, and runs a view's primary action or the first nondestructive notification action.
- **watchOS:** do not assign a primary action where double tap already scrolls (lists, scroll views, vertical tabs); in other views, choose the most used button (play/pause).

**Specs**

| Gesture | Supported in | Common action |
| --- | --- | --- |
| Tap | iOS, iPadOS, macOS, tvOS, visionOS, watchOS | Activate a control; select an item. |
| Swipe | iOS, iPadOS, macOS, tvOS, visionOS, watchOS | Reveal actions and controls; dismiss views; scroll. |
| Drag | iOS, iPadOS, macOS, tvOS, visionOS, watchOS | Move a UI element. |
| Touch (or pinch) and hold | iOS, iPadOS, macOS, tvOS, visionOS, watchOS | Reveal more controls or functions. |
| Double tap | iOS, iPadOS, macOS, tvOS, visionOS, watchOS | Zoom in or out; open an item on a Mac touch display; primary action on Apple Watch Series 9 and later and Apple Watch Ultra 2 and later. |
| Zoom | iOS, iPadOS, macOS, tvOS, visionOS | Zoom a view; magnify content. |
| Rotate | iOS, iPadOS, macOS, tvOS, visionOS | Rotate a selected item. |

| visionOS direct gesture | Common use |
| --- | --- |
| Touch | Select or activate an object. |
| Touch and hold | Open a contextual menu. |
| Touch and drag | Move an object. |
| Double touch | Preview an object or file; select a word when editing. |
| Swipe | Reveal actions and controls; dismiss views; scroll. |
| Two hands, pinch and drag together or apart | Zoom in or out. |
| Two hands, pinch and drag in a circle | Rotate an object. |

| macOS action | Trackpad | Touch display |
| --- | --- | --- |
| Select | Primary click | Tap |
| Open | Double click | Double tap |
| Scroll | Slide two fingers up or down | Slide one finger up or down |
| Zoom | Pinch | Pinch |
| Rotate | Move two fingers around each other | Move two fingers around each other |
| Open a context menu | Secondary click | Touch and hold |
| Drag | Click and drag | Touch and hold, then drag |

**APIs:** SwiftUI Gestures, `UITouch`, `persistentSystemOverlays(_:)`, `handGestureShortcut(_:isEnabled:)`, `primaryAction`, ARKit hand data

Last change: October 28, 2026 — macOS touch and gesture guidance added.

## Gyroscope and accelerometer
Source: https://developer.apple.com/design/human-interface-guidelines/gyro-and-accelerometer

Device gyroscopes and accelerometers report real-time motion in iOS, iPadOS and watchOS; tvOS apps
can read gyroscope data from the Siri Remote.

**Do**
- Use motion data only for a clear benefit to people, such as fitness feedback or gameplay.
- Write the purpose text that the system shows in the permission request on first access.

**Avoid**
- Collecting motion data just to have it.
- Motion-driven direct manipulation of the interface outside active gameplay; it is imprecise, hard for some people and costs battery.

**APIs:** Core Motion

## Keyboards
Source: https://developer.apple.com/design/human-interface-guidelines/keyboards

A physical keyboard connects to every device except Apple Watch; Mac users use one all the time and
iPad users often. A shortcut combines a primary key with modifiers; a game key binding is often one key.

**Do**
- Support Full Keyboard Access (iOS, iPadOS, macOS, visionOS); test it through Settings > Accessibility.
- Keep standard shortcuts working; give a frequent app-specific action its own custom shortcut.
- In games, keep standard shortcuts like Command-Q and let players remap key bindings.
- Define custom shortcuts only for the most frequent app-specific commands.
- Use modifiers as people expect: Command-drag moves items as a group, Shift-resize keeps the aspect ratio, a held arrow key moves by the smallest unit.
- Use Command as the main modifier, Shift as a secondary one, Option sparingly for rare or power commands.
- List modifiers in this order: Control, Option, Shift, Command.
- For the shifted symbol on a dual-symbol key, name that symbol rather than adding Shift (Command-Question mark, not Shift-Command-Slash).
- Let the system localize shortcuts for the connected keyboard and mirror them for right-to-left layouts.

**Avoid**
- Keyboard navigation for buttons, segmented controls and switches in iPadOS; Full Keyboard Access covers them.
- Repurposing a standard shortcut, unless its action is meaningless in your app (Command-I as Get Info in an app without text styling).
- Control as a modifier; the system uses it for many features.
- Extra modifiers with characters not present on every keyboard (Option-5 types "{" on a French keyboard); use non-Command modifiers only with letters.
- Adding a modifier to a known shortcut for an unrelated command (Shift-Command-Z for anything but redo).

**Platform notes**
- **visionOS:** holding Command shows a shortcut interface grouped in system menu categories (File, Edit, View) as one flat list of available commands that have shortcuts.
- **visionOS:** write shortcut titles that make sense without a submenu title (`discoverabilityTitle`).
- **visionOS:** with a physical keyboard connected, the system shows a virtual keyboard overlay with completions and controls.
- **watchOS:** Not supported.

**Specs**

| Modifier | Symbol | Use |
| --- | --- | --- |
| Command | ⌘ (clover outline) | Main modifier for custom shortcuts |
| Shift | ⇧ (up arrow outline) | Secondary modifier that complements a related shortcut |
| Option | ⌥ | Sparingly, for less common or power commands |
| Control | ⌃ (shallow upside-down V) | Avoid; reserved for many system features |

Standard shortcuts people expect:

| Shortcut | Action |
| --- | --- |
| Command-Space | Show or hide the Spotlight search field |
| Shift-Command-Space | Varies |
| Option-Command-Space | Show the Spotlight results window |
| Control-Command-Space | Show the Special Characters window |
| Shift-Tab | Move through controls in reverse |
| Command-Tab | Switch to the next most recently used app |
| Shift-Command-Tab | Move backward through open apps by recent use |
| Control-Tab | Focus the next control group in a dialog, or the next table when Tab moves between cells |
| Control-Shift-Tab | Focus the previous control group |
| Esc | Cancel the current action or process |
| Option-Command-Esc | Open the Force Quit dialog |
| Control-Command-Eject | Quit all apps after saving, then restart |
| Control-Option-Command-Eject | Quit all apps after saving, then shut down |
| Control-F1 | Turn full keyboard access on or off |
| Control-F2 | Focus the menu bar |
| Control-F3 | Focus the Dock |
| Control-F4 | Focus the active (or next) window |
| Control-Shift-F4 | Focus the previously active window |
| Control-F5 | Focus the toolbar |
| Command-F5 | Turn VoiceOver on or off |
| Control-F6 | Focus the first (or next) panel |
| Control-Shift-F6 | Focus the previous panel |
| Control-F7 | Temporarily override the keyboard access mode in windows and dialogs |
| F8, F9, F10 | Varies |
| F11 | Show desktop |
| F12 | Hide or show Dashboard |
| Command-Grave accent | Activate the frontmost app's next window |
| Shift-Command-Grave accent | Activate the frontmost app's previous window |
| Option-Command-Grave accent | Focus the window drawer |
| Command-Hyphen | Make the selection smaller |
| Option-Command-Hyphen | Zoom out when screen zoom is on |
| Command-Left bracket | Left-align the selection |
| Command-Right bracket | Right-align the selection |
| Command-Pipe | Center the selection |
| Command-Colon | Show the Spelling window |
| Command-Semicolon | Find misspelled words |
| Command-Comma | Open the app's settings window |
| Control-Option-Command-Comma | Decrease screen contrast |
| Command-Period | Cancel an operation |
| Control-Option-Command-Period | Increase screen contrast |
| Command-Question mark | Open the app's Help menu |
| Option-Command-Forward slash | Turn font smoothing on or off |
| Shift-Command-Equal sign | Make the selection larger |
| Option-Command-Equal sign | Zoom in when screen zoom is on |
| Shift-Command-3 | Capture the screen to a file |
| Control-Shift-Command-3 | Capture the screen to the Clipboard |
| Shift-Command-4 | Capture a selection to a file |
| Control-Shift-Command-4 | Capture a selection to the Clipboard |
| Option-Command-8 | Turn screen zoom on or off |
| Control-Option-Command-8 | Invert screen colors |
| Command-A | Select all items or all characters in a field |
| Shift-Command-A | Deselect all |
| Command-B | Toggle bold on the selected text |
| Command-C | Copy the selection |
| Shift-Command-C | Show the Colors window |
| Option-Command-C | Copy the style of the selected text |
| Control-Command-C | Copy the selection's formatting to the Clipboard |
| Option-Command-D | Show or hide the Dock |
| Control-Command-D | Look up the selected word in Dictionary |
| Command-E | Use the selection for Find |
| Command-F | Open a Find window |
| Option-Command-F | Go to the search field |
| Control-Command-F | Enter full screen |
| Command-G | Find the next occurrence |
| Shift-Command-G | Find the previous occurrence |
| Command-H | Hide the current app's windows |
| Option-Command-H | Hide all other apps' windows |
| Command-I | Toggle italic on the selected text, or show an Info window |
| Option-Command-I | Show an inspector window |
| Command-J | Scroll to the selection |
| Command-M | Minimize the active window to the Dock |
| Option-Command-M | Minimize all of the app's windows |
| Command-N | New document |
| Command-O | Open a document chooser |
| Command-P | Show the Print dialog |
| Shift-Command-P | Show the Page Setup dialog |
| Command-Q | Quit the app |
| Shift-Command-Q | Log out the current user |
| Option-Shift-Command-Q | Log out without confirmation |
| Command-S | Save a new document or a version |
| Shift-Command-S | Duplicate the document or Save As |
| Command-T | Show the Fonts window |
| Option-Command-T | Show or hide a toolbar |
| Command-U | Toggle underline |
| Command-V | Paste at the insertion point |
| Shift-Command-V | Paste as (for example, Paste as Quotation) |
| Option-Command-V | Apply one object's style to the selection |
| Option-Shift-Command-V | Paste and match the surrounding text style |
| Control-Command-V | Apply formatting settings to the selection |
| Command-W | Close the active window |
| Shift-Command-W | Close a file and its windows |
| Option-Command-W | Close all of the app's windows |
| Command-X | Cut the selection to the Clipboard |
| Command-Z | Undo |
| Shift-Command-Z | Redo, when undo and redo are separate commands |
| Command-Right arrow | Switch to the current Roman-script keyboard layout |
| Shift-Command-Right arrow | Extend the selection to the next semantic unit, usually line end |
| Shift-Right arrow | Extend the selection one character right |
| Option-Shift-Right arrow | Extend the selection to the end of this word, then the next |
| Control-Right arrow | Move focus to another value or cell, such as in a table |
| Command-Left arrow | Switch to the current system-script keyboard layout |
| Shift-Command-Left arrow | Extend the selection to the previous semantic unit, usually line start |
| Shift-Left arrow | Extend the selection one character left |
| Option-Shift-Left arrow | Extend the selection to the start of this word, then the previous |
| Control-Left arrow | Move focus to another value or cell |
| Shift-Command-Up arrow | Extend the selection upward, usually to document start |
| Shift-Up arrow | Extend the selection to the line above at the same horizontal position |
| Option-Shift-Up arrow | Extend the selection to the start of this paragraph, then the next |
| Control-Up arrow | Move focus to another value or cell |
| Shift-Command-Down arrow | Extend the selection downward, usually to document end |
| Shift-Down arrow | Extend the selection to the line below at the same horizontal position |
| Option-Shift-Down arrow | Extend the selection to the end of this paragraph, then the next (includes the paragraph terminator in cut, copy and paste) |
| Control-Down arrow | Move focus to another value or cell |

Input-source shortcuts (no menu commands):

| Shortcut | Action |
| --- | --- |
| Control-Space | Toggle between the current and last input source |
| Control-Option-Space | Switch to the next input source |
| [Modifier key]-Command-Space | Varies |
| Command-Right arrow | Switch to the current Roman-script layout |
| Command-Left arrow | Switch to the current system-script layout |

**APIs:** `isFullKeyboardAccessEnabled`, `KeyboardShortcut`, SwiftUI Input events, `UIKeyCommand` (`discoverabilityTitle`), AppKit Mouse, Keyboard, and Trackpad

Last change: June 9, 2025 — game key binding guidance moved to the Game controls page.

## Nearby interactions
Source: https://developer.apple.com/design/human-interface-guidelines/nearby-interactions

Experiences that react to the distance and direction of nearby people and devices, such as moving music
from iPhone to HomePod mini by bringing them together. Needs Ultra Wideband devices and the Nearby Interaction framework.

**Do**
- Start from the physical-world version of the task to find a natural interaction.
- Combine distance, direction and context, such as suggesting the nearest contact a person faces in the share sheet.
- Make feedback sharpen as people get closer (Find My moves from an arrow to a pulsing circle).
- Give continuous feedback that follows people's movement.
- Mix visual, audible and haptic feedback; use visuals while people look at the screen, sound and haptics while they look around.
- Encourage portrait orientation with implicit visual cues rather than explicit instructions.
- Design for the sensor's field of view, similar to the Ultra Wide camera on iPhone 11 and later; outside it you get distance but no direction.
- Explain in onboarding that people, animals and large objects between devices reduce accuracy.

**Avoid**
- Making a nearby interaction the only way to complete a task.

**Platform notes**
- People grant permission first; the framework uses random device identifiers that last only one session.
- **iOS:** reports a peer's distance and direction.
- **watchOS:** reports distance only; participating apps must be in the foreground.
- **macOS, tvOS, visionOS:** Not supported.

**APIs:** Nearby Interaction

Last change: June 21, 2023 — page renamed from Spatial interactions.

## Pointing devices
Source: https://developer.apple.com/design/human-interface-guidelines/pointing-devices

A trackpad or mouse lets people move a pointer to navigate and act. On a Mac it pairs with the keyboard;
on iPad and Apple Vision Pro it adds a way to interact without replacing touch, eyes or gestures.

**Do**
- Make mouse and trackpad gestures behave the same everywhere (swipe between pages works for documents, webpages and images).
- Keep the experience consistent across gestures, eyes, pointer and keyboard.
- Let the pointer reveal and hide controls that minimize or fade (Safari's minimized toolbar on iPad, video playback controls).
- Give modifier keys the same result with touch and pointer (Option-drag duplicates either way).
- **iPadOS:** implement band (rectangle) multiple selection in custom views; standard non-list collection views have it.
- **iPadOS:** treat pointer and finger differently only when it adds value, such as clicking a precise seek point in a scrubber.
- **iPadOS:** support the system content effects. Highlight for control groups in a Liquid Glass container; lift for a single Liquid Glass control on its own or a small element with an opaque background; hover for large elements.
- **iPadOS:** keep system pointer appearances for standard buttons and text areas.
- **iPadOS:** pad hit regions: about 12 pt around elements with a bezel, about 24 pt around elements without one.
- **iPadOS:** make hit regions of adjacent custom bar buttons touch each other, so the highlight does not flicker.
- **iPadOS:** use system effects for custom elements that act like standard ones (custom toolbar buttons get the highlight).
- **iPadOS:** use the same pointer behavior in all similar areas of the app, such as every drawing area.
- **iPadOS:** keep custom pointer shapes simple and instantly clear.
- **iPadOS:** consider useful annotations near the pointer, such as X and Y values on a graph or width and height while resizing.
- **iPadOS:** use clear, simple images for pointer accessories; animate accessory changes to signal state (`plus` to `circle.slash`).
- **iPadOS:** scale only elements that have room to grow; for tight elements use tint without scale and shadow.

**Avoid**
- Redefining system-wide trackpad gestures (Dock, Mission Control), even in games; people can customize them.
- Decorative pointer or content effects without practical value.
- Instructional text attached to the pointer.
- Scaling table rows on hover, or shadow without scale.

**Platform notes**
- **iPadOS:** the pointer is an arrow by default and changes shape over certain elements, such as an I-beam over text.
- **iPadOS:** highlight puts a Liquid Glass shape behind the control under the pointer; default for bar buttons, tab bars, segmented controls and edit menus.
- **iPadOS:** lift scales the element up with a shadow below, a soft specular highlight and slight parallax; default for standalone Liquid Glass controls, app icons and Control Center buttons.
- **iPadOS:** hover applies your custom scale, tint or shadow without changing the pointer shape.
- **iPadOS:** accessories are small secondary indicators, such as arrows on a resizable edge, that combine with any pointer.
- **macOS:** people customize many clicks and gestures, including secondary-click regions and finger combinations.
- **macOS touch:** give touch support only to essential pointer-revealed controls; skip tooltips and features touch reaches another way (swipe scrolls a carousel).
- **macOS touch:** do not keep hidden controls always visible for touch.
- **macOS touch:** reveal a hidden control on a tap at its location; show only relevant controls; hide them after use or after a few seconds.
- **macOS touch:** keep the current selection when a tap reveals or uses a hidden control.
- **macOS touch:** put essential hidden controls in a short context menu (touch and hold opens it).
- **macOS touch:** in a sidebar, a tap on a header or row acts like a click and reveals that item's controls until touch leaves the sidebar or the pointer returns. A tap on a hidden control reveals it without activating it.
- **macOS touch:** in a tabbed window, any tap shows the selected tab's close button until the pointer is used; after a close, show it on the new tab.
- **visionOS:** a pointer and keyboard work alongside eyes and hands; gaze sets the pointer's window context, and the system focuses the element under the pointer.
- **visionOS:** the pointer hides during trackpad or mouse gestures and reappears where people look when moved.
- **tvOS, watchOS:** Not supported.

**Specs**

macOS clicks and gestures:

| Click or gesture | Expected behavior | Mouse | Trackpad |
| --- | --- | --- | --- |
| Primary click | Select or activate an item | Yes | Yes |
| Secondary click | Show context menus | Yes | Yes |
| Scrolling | Move content in any direction in a view | Yes | Yes |
| Smart zoom | Zoom content such as a web page or PDF | Yes | Yes |
| Swipe between pages | Go forward or back between single pages | Yes | Yes |
| Swipe between full-screen apps | Go between full-screen apps and spaces | Yes | Yes |
| Mission Control (two-finger double tap on mouse; three- or four-finger swipe up on trackpad) | Open Mission Control | Yes | Yes |
| Lookup and data detectors (one-finger force click or three-finger tap) | Show a lookup window over the selection | — | Yes |
| Tap to click | Primary click by tapping | — | Yes |
| Force click | Click and press firmly for Quick Look or lookup; variable pressure drives pressure-sensitive controls | — | Yes |
| Zoom (two-finger pinch) | Zoom in or out | — | Yes |
| Rotate (two fingers in a circle) | Rotate content such as an image | — | Yes |
| Notification Center (swipe from trackpad edge) | Show Notification Center | — | Yes |
| App Exposé (three- or four-finger swipe down) | Show the app's windows in Exposé | — | Yes |
| Apps (thumb and three fingers pinch) | Show the list of apps | — | Yes |
| Show Desktop (thumb and three fingers spread) | Move all windows aside to show the desktop | — | Yes |

macOS pointer styles:

| Pointer | Meaning | AppKit | SwiftUI |
| --- | --- | --- | --- |
| Arrow | Standard pointer for selecting and interacting | `arrow` | `default` |
| Closed hand | Dragging content inside a view | `closedHand` | `grabActive` |
| Context menu | A context menu exists here; usually shown only with Control held | `contextualMenu` | — |
| Cross | Precise rectangular selection possible | `crosshair` | `rectSelection` |
| Disappearing item | Dropped item disappears; any original stays | `disappearingItem` | — |
| Drag copy | Drop copies instead of moving; appears with Option held | `dragCopy` | — |
| Drag link | Drop creates an alias; appears with Option-Command held | `dragLink` | — |
| Horizontal I beam | Text selection and insertion in horizontal layout | `iBeam` | `horizontalText` |
| Open hand | Content can be dragged inside a view | `openHand` | `grabIdle` |
| Operation not allowed | The item cannot be dropped here | `operationNotAllowed` | — |
| Pointing hand | The content is a link | `pointingHand` | `link` |
| Resize down / up | Horizontal divider moves only down / only up | `rowResize(directions:)` | `rowResize(directions:)` |
| Resize up down | Drag a horizontal divider either way | `rowResize`, `rowResize(directions:)` | `rowResize`, `rowResize(directions:)` |
| Resize left / right | Vertical divider moves only left / only right | `columnResize(directions:)` | `columnResize(directions:)` |
| Resize left right | Drag a vertical divider either way | `columnResize`, `columnResize(directions:)` | `columnResize`, `columnResize(directions:)` |
| Resize east / west / north / south | Frame edge moves in one direction only, such as at minimum or maximum size | `frameResize(position:directions:)` | `frameResize(position:directions:)` |
| Resize northeast / northwest / southeast / southwest | Frame corner moves in one direction only | `frameResize(position:directions:)` | `frameResize(position:directions:)` |
| Resize east west / north south | Drag a frame edge either way | `frameResize(position:directions:)` | `frameResize(position:directions:)` |
| Resize northeast southwest / northwest southeast | Drag a frame corner either way | `frameResize(position:directions:)` | `frameResize(position:directions:)` |
| Vertical I beam | Text selection and insertion in vertical layout | `iBeamCursorForVerticalLayout` | `verticalText` |
| Zoom in / Zoom out | Magnify or reduce a canvas or object | `zoomIn` / `zoomOut` | `zoomIn` / `zoomOut` |

**APIs:** `UIBandSelectionInteraction`, `UIPointerAccessory`, UIKit Pointer interactions, SwiftUI Input events, `NSCursor`, `PointerStyle`, AppKit Mouse, Keyboard, and Trackpad

Last change: October 28, 2026 — Mac touch access to hover-revealed controls added; iPadOS and macOS guidance and artwork revised.

## Remotes
Source: https://developer.apple.com/design/human-interface-guidelines/remotes

The Siri Remote is the main input for Apple TV. Its clickpad combines a touch surface and press, plus
dedicated buttons, for navigation, browsing, playback and selection.

**Do**
- Use standard gestures for standard actions outside gameplay.
- Tie gestures to the focus system as people expect; focus always moves in the gesture's direction.
- Show what a gesture will do, such as a hint to swipe down for an info area when a thumb rests on the surface.
- Use press for deliberate actions (choose a button, confirm, act in a game); use tap for navigation or extra information.
- Use positional taps (up, down, left, right) only where they are intuitive and discoverable.
- Make Back open the parent screen in the app hierarchy, or the Home Screen at the top level.
- In active gameplay, make Back open a pause menu; Back again closes it and resumes.
- Make Play/Pause play, pause or resume media.
- With an EPG, open it on "guide" or "browse" and page it with "page up" and "page down"; taps on the upper or lower touch area also browse it.
- During playback, make "page up" and "page down" change the channel.

**Avoid**
- Redefining standard remote behaviors.
- Custom gestures outside games.
- Responding to accidental taps, especially during live video playback.
- Other responses to EPG buttons while people browse the EPG.

**Platform notes**
- **tvOS:** press and hold Back always goes to the Home Screen.
- **tvOS:** swipes scroll fast and then slow with momentum; swipes on the edge race through items; press then swipe starts scrubbing.
- **tvOS:** without an EPG in your app, the system sends guide button presses to the default guide app.
- **iOS, iPadOS, macOS, visionOS, watchOS:** Not supported.

**Specs**

| Button or area | Expected behavior in an app | Expected behavior in a game |
| --- | --- | --- |
| Touch surface (swipe) | Navigates; changes focus | Acts as the directional pad |
| Touch surface (press) | Activates a control or item; goes deeper | Acts as the primary button |
| Back | Returns to the previous screen; exits to the Home Screen | Pauses or resumes; returns to the previous screen, the main game menu or the Home Screen |
| Play/Pause | Starts, pauses or resumes playback | Acts as the secondary button; skips an intro video |

**APIs:** TVServices (Providing Channel Navigation)
