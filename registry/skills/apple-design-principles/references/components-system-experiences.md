# Components / System experiences

Surfaces where an app shows up outside its own windows: App Shortcuts, complications, controls, Live Activities, notifications, snippets, the status bar, Top Shelf, watch faces and widgets.

## Pages
- [App Shortcuts](#app-shortcuts): App Intents actions exposed to Siri, Spotlight, Action button
- [Complications](#complications): watch-face data families, ring styles, tinted mode, image sizes
- [Controls](#controls): Control Center, Lock Screen and Action button buttons and toggles
- [Live Activities](#live-activities): glanceable task progress in Dynamic Island, Lock Screen, Smart Stack
- [Notifications](#notifications): content, actions, badges, watchOS short and long looks
- [Snippets](#snippets): confirmation and result views for Siri and App Shortcuts
- [Status bars](#status-bars): keeping the iOS status bar legible and visible
- [Top Shelf](#top-shelf): tvOS Home Screen showcase layouts and image sizes
- [Watch faces](#watch-faces): sharing preconfigured watch faces that feature your complications
- [Widgets](#widgets): sizes, rendering modes, layout, text, color, per-platform specs

## App Shortcuts
Source: https://developer.apple.com/design/human-interface-guidelines/app-shortcuts

An App Shortcut exposes a key app task, built from App Intents actions, to Siri, Spotlight, the Shortcuts app, the Action button and the Apple Pencil squeeze. It works right after install, before the first launch.

**Do**
- Adopt app schemas first when your app fits a common domain; Apple Intelligence and Siri then surface the features without separate App Shortcuts.
- Use App Shortcuts for unique features or content that app schemas do not cover.
- Offer shortcuts for the most common, important tasks; prefer tasks people finish without leaving their context. Open the app only for multistep tasks.
- Allow at most one optional parameter with predictable, familiar values, since people cannot see the list.
- When an optional value is missing, ask a follow-up; offer the likely default (recent or time-based) plus a short list of alternatives.
- Ask for extra required information in a later step, not in the phrase.
- Show occasional in-app tips when people do a task that has a shortcut.
- Respond with a snippet for static information or confirmation, and a Live Activity for changing, time-bound information such as timers.
- Put all critical information in the full dialogue text, for audio-only devices such as AirPods and HomePod.
- Keep activation phrases short and memorable, with natural variants. Include the app name, in a flexible form.
- Write "App Shortcuts" and "Shortcuts" in title case and plural. Write an individual "shortcut" in lowercase.

**Avoid**
- Phrases that sound complicated when spoken, or that seem to carry two parameters.

**Platform notes**
- **iOS, iPadOS:** Shortcuts appear in Spotlight's Top Hit area or the Shortcuts area below it. Each one shows a chosen SF Symbol or a preview image of the linked item.
- **iOS, iPadOS:** Order shortcuts by importance; the order sets the first display, then the system promotes the most-used ones.
- **macOS:** App Shortcuts are not supported. App Intents actions are, and people can build custom shortcuts from them.
- **tvOS:** Not supported.

**Specs**
- Up to 10 App Shortcuts per app.

**APIs:** App Intents, `AppShortcutPhrase`, `SiriTipUIView`, `LiveActivityIntent`, `IntentDialog` `init(full:supporting:systemImageName:)`, SiriKit

Last change: June 8, 2026 — added guidance on adopting app schemas.

## Complications
Source: https://developer.apple.com/design/human-interface-guidelines/complications

A complication shows timely data on the watch face. Since watchOS 9, complications (accessories) belong to families such as circular, corner, inline and rectangular; legacy templates serve older watchOS. Most faces hold at least one; some hold four or more.

**Do**
- Build complications with WidgetKit for watchOS 9 and later; use `CLKComplicationDataSource` only for earlier versions.
- Show essential, changing data that always looks current; a static complication gets moved away.
- Support every family you can. Where you have no useful data, show an image such as the app icon that still launches the app.
- Offer several complications per family, for example one per triathlon segment, and give each its own deep link.
- Protect sensitive data, since the Always-On display can show it to others.
- Plan timeline entry times per data type; daily updates and stored entries are limited.
- Pick a gauge by data:
  - **Closed:** a percentage of a whole, such as battery.
  - **Open:** arbitrary minimum and maximum, such as speed.
  - **Segmented:** an app-defined range with fast changes, such as Noise.
- Make content work in tinted mode: the system desaturates, turns content grayscale and tints it with one color from the wearer's choice.
- Supply a tinted version of a full-color image if desaturation hurts it.
- Use line widths of 2 pt or more.
- Provide static placeholder images for each complication; their size can differ from the live image.

**Avoid**
- Color as the only carrier of meaning.

**Platform notes**
- **watchOS:** Circular appears on Infograph and Infograph Modular. Text can curve along the bezel for nearly 180 degrees before truncating.
- **watchOS:** Extra-large circular layouts fill most of the X-Large face, for example a contact photo. The system masks circular and gauge images to a circle.
- **watchOS:** Corner layouts sit in face corners, as on Infograph; images get a circular mask.
- **watchOS:** Utilitarian small fills a corner rectangle (Chronograph, Simple) with an image, icon or ring. Utilitarian large is text with an optional leading icon across the bottom (Utility, Motion).
- **watchOS:** Rectangular suits charts and graphs over time, such as the 24-hour Heart Rate graph. It uses high-contrast primary data and low-contrast grid lines.
- **watchOS 10+:** Rectangular layouts can appear in the Smart Stack. Add a meaningful background, set relevance through intents, or build a Smart Stack layout.
- **watchOS:** Legacy circular small shows a small image or a few characters, as on Color. Modular small shows two stacked rows or one item. Modular large shows up to three rows; extra large shows big text and images.
- **iOS, iPadOS, macOS, tvOS, visionOS:** Not supported.

**Specs**
- All sizes in pt; @2x pixels are twice the point value. Stack widths in legacy templates are maximums.
- SwiftUI default text is Rounded style. Weights and sizes for 40 / 41 / 44 / 45-49 mm:
  - **Circular:** Medium, 12 / 12.5 / 13 / 14.5 pt.
  - **Extra-large circular:** Medium, 34.5 / 36.5 / 36.5 / 41 pt.
  - **Corner:** Semibold, 10 / 10.5 / 11 / 12 pt.
  - **Rectangular:** Medium, 16.5 / 17.5 / 18 / 19.5 pt.
- Rectangular large images get a 4 pt corner radius.

Circular (regular):

| Element | 40mm | 41mm | 44mm | 45/49mm |
| --- | --- | --- | --- | --- |
| Image | 42x42 | 44.5x44.5 | 47x47 | 50x50 |
| Closed gauge | 27x27 | 28.5x28.5 | 31x31 | 32x32 |
| Open gauge | 11x11 | 11.5x11.5 | 12x12 | 13x13 |
| Stack (not text) | 28x14 | 29.5x15 | 31x16 | 33.5x16.5 |

Circular (extra large):

| Element | 40mm | 41mm | 44mm | 45/49mm |
| --- | --- | --- | --- | --- |
| Image | 120x120 | 127x127 | 132x132 | 143x143 |
| Open gauge | 31x31 | 33x33 | 33x33 | 37x37 |
| Closed gauge | 77x77 | 81.5x81.5 | 87x87 | 91.5x91.5 |
| Stack | 80x40 | 85x42 | 87x44 | 95x48 |

Circular-family placeholders (no 38mm): Circular and Bezel match the regular image size; Extra Large matches the extra-large image size (40/42mm column uses the 40mm value).

Corner:

| Element | 40mm | 41mm | 44mm | 45/49mm |
| --- | --- | --- | --- | --- |
| Circular | 32x32 | 34x34 | 36x36 | 38x38 |
| Gauge | 20x20 | 21x21 | 22x22 | 24x24 |
| Text | 20x20 | 21x21 | 22x22 | 24x24 |
| Placeholder (40/42mm) | 20x20 | 21x21 | 22x22 | 24x24 |

Inline, utilitarian small (Flat row also applies to utilitarian large):

| Content | 38mm | 40/42mm | 41mm | 44mm | 45/49mm |
| --- | --- | --- | --- | --- | --- |
| Flat | 9-21x9 | 10-22x10 | 10.5-23.5x10.5 | N/A | 12-26x12 |
| Ring | 14x14 | 14x14 | 15x15 | 16x16 | 16.5x16.5 |
| Square | 20x20 | 22x22 | 23.5x23.5 | 25x25 | 26x26 |

Note: Apple's utilitarian small table gives the 41mm Flat size as 10.5-23.5x21 pt; its pixel value (21-47x21 px @2x) and the utilitarian large table both give a height of 10.5 pt, which this table uses.

Rectangular:

| Content | 40mm | 41mm | 44mm | 45/49mm |
| --- | --- | --- | --- | --- |
| Large image with title | 150x47 | 159x50 | 171x54 | 178.5x56 |
| Large image without title | 162x69 | 171.5x73 | 184x78 | 193x82 |
| Standard body | 12x12 | 12.5x12.5 | 13.5x13.5 | 14.5x14.5 |
| Text gauge | 12x12 | 12.5x12.5 | 13.5x13.5 | 14.5x14.5 |

Legacy templates:

| Template / element | 38mm | 40/42mm | 41mm | 44mm | 45/49mm |
| --- | --- | --- | --- | --- | --- |
| Circular small ring | 20x20 | 22x22 | 23.5x23.5 | 24x24 | 26x26 |
| Circular small simple, placeholder | 16x16 | 18x18 | 19x19 | 20x20 | 21.5x21.5 |
| Circular small stack | 16x7 | 17x8 | 18x8.5 | 19x9 | 19x9.5 |
| Modular small ring | 18x18 | 19x19 | 20x20 | 21x21 | 22.5x22.5 |
| Modular small simple, placeholder | 26x26 | 29x29 | 30.5x30.5 | 32x32 | 34.5x34.5 |
| Modular small stack | 26x14 | 29x15 | 30.5x16 | 32x17 | 34.5x18 |
| Modular large columns, body, table | 11-32x11 | 12-37x12 | 12.5-39x12.5 | 14-42x14 | 14.5-44x14.5 |
| Extra large ring | 63x63 | 66.5x66.5 | 70.5x70.5 | 73x73 | 79x79 |
| Extra large simple, placeholder | 91x91 | 101.5x101.5 | 107.5x107.5 | 112x112 | 121x121 |
| Extra large stack | 78x42 | 87x45 | 92x47.5 | 96x51 | 103.5x53.5 |

**APIs:** WidgetKit, `WidgetRenderingMode`, `placeholder(in:)`, `WidgetFamily.accessoryRectangular`, App Intents, `CLKComplicationDataSource`

Last change: October 24, 2023 — swapped deprecated ClockKit links for WidgetKit links.

## Controls
Source: https://developer.apple.com/design/human-interface-guidelines/controls

A control is a button or toggle that reaches an app feature from Control Center, the Lock Screen or the Action button. Buttons run an action, open an app area or launch a locked-device camera; toggles switch two states.

**Do**
- Offer controls for actions that pay off without opening the app, such as starting a Live Activity.
- Update the control on interaction, on completion, or by push, and show when an action is still running.
- Pick a symbol that explains the action alone, because title and value may be hidden. For toggles, give on and off symbols, such as `door.garage.open` and `door.garage.closed`.
- Animate toggle state changes; animate a button continuously while a timed action runs, and stop when it ends.
- Choose a brand tint; it colors the on-state symbol and the Dynamic Island display for Action button use.
- Prompt for configuration when people first add a control that needs it, such as which light.
- Write verb-based hint text for the Action button.
- Provide placeholder title and value when they vary; the gallery and Action button setup show them.
- Redact title and value on a locked device when they are personal or security-related; optionally show the symbol in its off state.
- Require authentication for security actions, such as unlocking a door or starting a car.
- For a locked-device camera control (iOS 18+), reuse the app's camera UI. Tell people how to add the control. Anything beyond capture needs unlock.

**Platform notes**
- **iOS:** On the Action button, press and hold shows the symbol and value in the Dynamic Island.
- **watchOS, tvOS, visionOS:** Not supported.

**Specs**
- Anatomy: a symbol (SF Symbol or custom), a title and an optional value.
- Control Center shows the symbol, plus title and value at larger sizes. The Lock Screen shows the symbol only.

**APIs:** WidgetKit, `promptsForUserConfiguration()`, `controlWidgetActionHint(_:)`, `IntentAuthenticationPolicy`, `SymbolEffect`, `LockedCameraCapture`

Last change: June 10, 2024 — new page.

## Live Activities
Source: https://developer.apple.com/design/human-interface-guidelines/live-activities

A Live Activity shows the progress of a task or event with frequent updates over a few hours, such as a delivery, a match or a workout. It starts on iPhone or iPad and also appears on Mac, Apple Watch and CarPlay.

**Do**
- Use it for tasks with a clear start and end, lasting no more than 8 hours.
- Show only the key glanceable facts; tapping opens the app for detail.
- Hide sensitive data behind an innocuous summary or redaction, and let people choose what to show.
- Match the app's look in light and dark appearance. Show a logo mark without a container, never the whole app icon.
- Use large text of medium weight or heavier; use small text rarely.
- Supply layouts and assets for every device and scale, using the Specs values.
- Use only the space the content needs, and grow or shrink height on the Lock Screen and in expanded view as content changes.
- Fit compact and minimal views into a 28 pt circle for limited width, using an abbreviation or graphic.
- If a limited-width trailing view makes no sense, provide the leading one only; the system hides the empty trailing view.
- Start from Apple Design Resources templates for margins and text sizes.
- Use even margins and concentric placement; match corner radii with `ContainerRelativeShape`.
- Separate content blocks with an inset container shape or a thick line.
- Use bold colors on the black Dynamic Island background, and tint the key line to match the content.
- Animate updates (content-replace, numeric transitions, scale, opacity, movement), max 2 seconds; no animation on reduced-luminance Always-On.
- Move existing elements to their new place on layout changes; fade other list items instead of overlapping.
- Deep link a tap to the related screen.
- Limit interactivity to essential, directly related actions, ideally a single button or toggle, such as pause or contact driver.
- Start activities when people expect them, and offer an in-app way to turn them off, such as unfollowing a team.
- Offer an App Shortcut that starts the Live Activity, for example from the Action button.
- Update only when content changes; alert only for updates people must not miss.
- Track several events in one rotating Live Activity rather than several.
- End the activity as soon as the event ends. Set a custom dismissal time proportional to its length, usually 15 to 30 minutes.

**Avoid**
- Ads or promotions.
- App elements that point at the Dynamic Island.
- Drawing content to the edge of the Dynamic Island.
- Push notifications that duplicate Live Activity updates.

**Platform notes**
- **iOS, iPadOS:** Support all four presentations: compact, minimal, expanded and Lock Screen. Design the iPhone version first, then refine for StandBy, CarPlay and Apple Watch.
- **iOS, iPadOS:** Compact shows leading and trailing parts beside the TrueDepth camera when one activity runs. Make both parts read as one piece and link to the same screen.
- **iOS, iPadOS:** Keep compact parts narrow and balanced, snug to the camera with no padding, and leave status bar data visible.
- **iOS, iPadOS:** Minimal shows up to three activities, one attached and others detached (circle or oval). Show live data, such as remaining time, not just a logo.
- **iOS, iPadOS:** Expanded opens on touch and hold. Keep element positions consistent with compact and wrap content tightly around the camera.
- **iOS, iPadOS:** Lock Screen shows a banner at the bottom; use an expanded-like layout, not a notification copy. Without a Dynamic Island, it overlays as a banner on alerts.
- **iOS, iPadOS:** Only the Lock Screen allows a custom background. Keep custom tints and opacity sparing and check contrast in dark mode and reduced-luminance Always-On.
- **iOS, iPadOS:** Check the generated dismiss button color on the Lock Screen.
- **iOS:** StandBy shows minimal, then a 2x Lock Screen view on tap; a custom background extends full-screen.
- **iOS:** In StandBy, use the default background, standard margins and no edge-to-edge graphics. Check contrast under the Night Mode red tint.
- **iOS, iPadOS:** After it ends, the activity leaves the Dynamic Island and CarPlay at once. It stays up to 4 hours on the Lock Screen, Mac menu bar and Smart Stack.
- **CarPlay:** The compact parts merge into one Dashboard layout and interactive elements are disabled. Declare `ActivityFamily.small` for a custom layout with larger text; prefer content over buttons.
- **macOS:** Appears in the menu bar of a paired Mac in compact, minimal and expanded form. A click opens the app through iPhone Mirroring.
- **watchOS:** Appears at the top of the Smart Stack, merging the compact parts by default. A tap opens the watchOS app, or a view with a button to open the iPhone app.
- **watchOS:** Consider a custom layout with more data and a button or toggle. It also drives CarPlay, so drop controls if people use it while driving.
- **watchOS:** Show progress, interactive controls such as timers, or significant updates such as score changes.
- **tvOS, visionOS:** Not supported.

**Specs**
- Lock Screen standard margin: 14 pt. Animation max: 2 s. Limited-width size: 28x28 pt.
- CarPlay Live Activity sizes: 240x78, 240x100, 170x78 pt. Test with Smart Display Zoom configurations Widescreen 1920x720, Portrait 900x1200, Standard 800x480 pt.
- macOS uses the iOS dimensions; watchOS uses the watchOS widget dimensions.

iOS (pt):

| Screen (portrait) | Compact (each side) | Minimal (width range) | Expanded (height range) | Lock Screen (height range) | Limited width |
| --- | --- | --- | --- | --- | --- |
| 430x932 | 62.33x36.67 | 36.67–45x36.67 | 408x84–160 | 408x84–160 | 28x28 |
| 393x852 | 52.33x36.67 | 36.67–45x36.67 | 371x84–160 | 371x84–160 | 28x28 |

iPadOS Lock Screen (pt): 1366x1024 → 500x84–160; 1194x834, 1012x834, 1080x810 and 1024x768 → 425x84–160.

watchOS Smart Stack (pt): 40mm 152x69.5; 41mm 165x72.5; 42mm 176x72.5; 44mm 173x76.5; 45mm 184x80.5; 46mm 194x80.5; 49mm Ultra 3, 4 198x81.5; 49mm Ultra 1, 2 191x81.5.

**APIs:** ActivityKit, WidgetKit, SwiftUI, `isDynamicIslandLimitedInWidth`, `ContainerRelativeShape`, `activitySystemActionForegroundColor(_:)`, `padding(_:_:)`, `ActivityFamily.small`

Last change: October 13, 2026 — added limited-width layout guidance and updated platforms and specifications.

## Notifications
Source: https://developer.apple.com/design/human-interface-guidelines/notifications

A notification delivers timely, high-value information that people grasp at a glance, as a banner, an app-icon badge or a Notification Center item. Ask permission first. Communication notifications show avatars and group names instead of the app icon.

**Do**
- Keep notifications short and informative.
- When the app is in the foreground, show new data quietly, for example with a badge or inline insertion.
- Give a short title only when it adds context, such as a headline or subject. Use title-style capitalization and no end punctuation.
- If the only possible title is generic, omit it so the system shows the app name.
- Write body text in full sentences, sentence case, with punctuation; let the system truncate.
- Provide a generic hidden-preview body such as "New comment", in sentence case; otherwise people see only the app icon and "Notification".
- Add a short, distinctive, professionally made sound if it helps, but never as the only signal. Apps cannot trigger vibration.
- Offer up to four action buttons for common, time-saving tasks. Label each with a short title-case result and a simple interface icon, shown trailing.
- Give destructive actions enough context; the system styles them distinctly.
- Use a badge only for the unread notification count, and clear it as soon as people read them. A count of zero clears Notification Center.

**Avoid**
- Repeat notifications about the same thing.
- Notifications that tell people to do tasks in the app.
- Notifications for errors; use an alert.
- Sensitive, personal or confidential data.
- The app name or icon in content; the system adds the icon.
- An action that only opens the app, an app name in action labels, and long labels; plan for localization.
- Badges for other numbers (weather, dates, prices, scores), badges as the only signal, and custom badge look-alikes.

**Platform notes**
- **watchOS:** Notifications come as short look, then long look; supported devices respond to double tap. An iPhone companion app can supply default interfaces.
- **watchOS:** A short look shows only while the wrist is raised. Do not put critical data only there, and keep sensitive data out of its title.
- **watchOS:** Long looks scroll by swipe or Digital Crown and dismiss by tap or lowering the wrist. The system fixes a sash on top and a Dismiss button below custom buttons.
- **watchOS:** Long looks can be static or dynamic. Always provide a bundled static one, and preferably a dynamic one too; static is the fallback.
- **watchOS:** Rich long looks can animate with SwiftUI, SpriteKit or SceneKit.
- **watchOS:** Color the sash or blur it over a top photo. The background is transparent by default; white at 18% opacity matches system notifications.
- **watchOS:** Up to four custom actions appear, chosen by notification type.
- **watchOS:** Double tap runs the first nondestructive action, so list the most frequent action first.

**APIs:** User Notifications, User Notifications UI, `UNNotificationSound`, `hiddenPreviewsBodyPlaceholder`

Last change: October 24, 2023 — added watchOS guidance for double-tap responses.

## Snippets
Source: https://developer.apple.com/design/human-interface-guidelines/snippets

A snippet is a compact view that an app intent shows after an action through Siri, Spotlight or Shortcuts. A confirmation snippet (optional) lets people confirm or cancel; a result snippet (always shown) reports the outcome.

**Do**
- Check contrast against the system background in light and dark appearance, and keep consistent margins.
- Keep content short; the custom view is at most 400 pt tall, and text grows with the preferred text size.
- In a result snippet, deep link to the app for more detail.
- Label the primary confirmation button with a specific verb, such as Order. Use a system label or a custom one; the default is Continue.
- Convey the purpose through the custom view; prefer to leave the spoken dialogue out of the visual.

**Avoid**
- Generic labels such as OK or Proceed.

**Platform notes**
- **tvOS, visionOS, watchOS:** Not supported.

**Specs**
- Anatomy: dialogue text above the custom view, the custom view (may hold buttons), then system buttons.
- Confirmation snippets get Cancel (secondary) and a primary button. Result snippets get Done.
- Maximum custom view height: 400 pt.

**APIs:** App Intents, `ConfirmationActionName`

Last change: June 8, 2026 — new page.

## Status bars
Source: https://developer.apple.com/design/human-interface-guidelines/status-bars

The status bar runs along the top edge and shows device state, such as time, carrier and battery.

**Do**
- Keep the status bar readable and keep controls out from under it; its background is transparent by default.
- Prefer a scroll edge effect to blur content behind it.
- Hide it temporarily for full-screen media, and let a simple gesture such as a single tap bring it back.

**Avoid**
- Removing the status bar for good; people then must leave the app to see time or connectivity.
- Suggesting that content behind it is interactive.

**Platform notes**
- **macOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `ScrollEdgeEffectStyle`, `UIScrollEdgeEffect`, `UIStatusBarStyle`, `preferredStatusBarStyle`

## Top Shelf
Source: https://developer.apple.com/design/human-interface-guidelines/top-shelf

Top Shelf is the area of the Apple TV Home Screen that showcases an app's content when the app is in the Dock and in focus. Full-screen Top Shelf lets people swipe through previews and trailers.

**Do**
- Lead people straight to content. Carousel actions and carousel details include a primary playback button and a More Info button.
- Feature new releases, episodes and upcoming titles, and personalize with recommendations and resume points.
- Prefer dynamic content built from layered images.
- Without full-screen content, supply at least one static image; tvOS flips and blurs it to fit 1920 px width at 16:9.
- **Carousel actions:** full-screen video and images for known content, such as photos or a franchise. Give a short title and an optional subtitle.
- **Carousel details:** adds metadata such as plot and cast. Show the playing title near the top, with an optional attribution phrase above it.
- **Sectioned content row:** one labeled, focusable row. Load enough images to span the full width and include at least one label.
- Mixed image sizes scale to the tallest image's height; for example, a 16:9 image grows to 500 px high next to posters or squares.
- **Scrolling inset banner:** near full-width images that auto-scroll and loop. Use 3 to 8 images.
- In banners, put text inside the image (in layered images, on its own top layer) and repeat it in the accessibility label.

**Avoid**
- Content people already bought, rented or watched.
- Ads and prices; show prices only after people show interest.
- Making a static image look interactive; it is not focusable.

**Platform notes**
- **iOS, iPadOS, macOS, visionOS, watchOS:** Not supported.

**Specs**
- Templates are in Apple Design Resources. @1x pixels equal points; @2x doubles them.

| Layout | Actual size (pt) | Focused / safe zone (pt) | Unfocused (pt) |
| --- | --- | --- | --- |
| Static image | 2320x720 | – | – |
| Row, poster 2:3 | 404x608 | 380x570 | 333x570 |
| Row, square 1:1 | 608x608 | 570x570 | 500x500 |
| Row, 16:9 | 908x512 | 852x479 | 782x440 |
| Scrolling inset banner | 1940x692 | 1740x620 | 1740x560 |

## Watch faces
Source: https://developer.apple.com/design/human-interface-guidelines/watch-faces

A watch face is the primary view people choose on Apple Watch, customized with complications. Since watchOS 7, people and apps can share configured faces through apps, websites, Messages, Mail or social media.

**Do**
- Share faces that feature several of your complications as a curated setup, with accent color, images or styles where the face allows.
- Expect people without your app to get an install prompt.
- Show a preview of each shared face. Get one by emailing it from the iOS Watch app; optionally swap its illustrated bezel for a hardware bezel from Apple Design Resources.
- Offer shareable faces for all devices. For faces limited to newer models, also offer a similar face for Series 3 and earlier, and label supported devices.
- If someone picks an incompatible face, offer a compatible alternative instead of an error, and say beforehand that this can happen.

**Platform notes**
- **watchOS:** Series 4 and later only: California, Chronograph Pro, Gradient, Infograph, Infograph Modular, Meridian, Modular Compact, Solar Dial. Explorer needs Series 3 (cellular) or later.
- **iOS, iPadOS, macOS, tvOS, visionOS:** Not supported.

**APIs:** ClockKit (Sharing an Apple Watch face)

## Widgets
Source: https://developer.apple.com/design/human-interface-guidelines/widgets

A widget shows glanceable, timely content and focused actions from an app on Home Screens, Lock Screens, the Mac desktop, Vision Pro surfaces, the watch Smart Stack and Apple HomeView. Design per size, context and rendering mode.

**Do**
- Build one simple idea tied to the app's main purpose, with content that changes during the day.
- Offer more sizes only when each adds value. Small shows one item; larger sizes add layers, not stretched content.
- Balance density; if crowded, use a larger size or graphics. Keep every size on the same core purpose.
- Use brand colors, fonts and glyphs lightly. Add a small logo top-right only if content comes from several sources.
- Decide between automatic content and people's configuration, as Stocks does.
- Tell signed-out people when signing in unlocks more.
- Pick an update frequency that fits the data. Show "last updated" text if people check more often than you refresh.
- Let the system refresh dates and times, and show stale data rather than placeholders.
- Animate data changes, max 2 seconds.
- Keep interactions simple. Deep link taps to the matching screen, and size targets so people do not hit the wrong one.
- Use the standard 16 pt margin, or 11 pt for grouped graphics, buttons or backgrounds. Margins are smaller on the Mac desktop and Lock Screen.
- Match inner corner radii with `ContainerRelativeShape`.
- Prefer the system font, text styles and SF Symbols; a custom font fits large text, with SF Pro for small text.
- Keep text at 11 pt or larger, as live text, never rasterized.
- Convey meaning with text and icons as well as color.
- Reserve full-color images for media such as album art, smaller than the widget, since tinted and clear modes desaturate them.
- **Full-color mode:** support light and dark with semantic colors or asset catalog variants.
- **Accented mode:** split views into accent and primary groups. iPhone, iPad and Mac tint both white; Apple Watch tints accent in the face color.
- **Vibrant mode:** render content fully opaque. Use white or light gray for primary content and darker grays for secondary; avoid white with opacity.
- Show a realistic gallery preview, with simulated data if real data loads slowly.
- Use placeholders of static parts plus semi-opaque shapes for text and images.
- Write one description per widget, starting with an action verb, in sentence case. Group all sizes together; optionally color the Add button.

**Avoid**
- A widget that only repeats the app icon.
- App-like layouts with many targets.
- In-app elements that look like the widget but behave differently.
- Description phrases such as "This widget shows…".

**Platform notes**
- **iOS, iPadOS:** Lock Screen widgets follow complication rules. They come as inline text above the clock, or circular and rectangular below it. Give real information, not just a launcher.
- **iOS:** On Always-On, use gray levels with enough contrast.
- **iOS, iPadOS:** Use Live Activities for real-time updates; widgets are not real-time.
- **iOS:** StandBy shows two small widgets side by side, scaled up with no background; CarPlay uses the same rendering. Mark the background as removable.
- **iOS:** In StandBy and CarPlay, scale text up instead of using rich images or color. Low light renders a red monochrome tint.
- **Apple HomeView:** Small system widgets with the iPhone look. The Modular face holds up to four, from any household member, one per household. Each member has a personal Home Screen.
- **visionOS:** Widgets are 3D objects fixed to real surfaces at real-world scale. People scale them 75 to 125 percent, and they persist across restarts.
- **visionOS:** Full color by default; accented when people tint them. There is no systemwide light or dark mode.
- **visionOS:** Design for the room, and test every tint palette and lighting condition.
- **visionOS:** Design two levels of detail. Simplified (far) has fewer details, larger type and no controls; default (near) shows more. Keep shared elements in both.
- **visionOS:** Pick family sizes for the real place, such as small for a desk or extra large for art. Use print-style hierarchy and high-resolution assets.
- **visionOS:** Elevated mounting (default) works on horizontal and vertical surfaces and suits content that should stand out. Recessed is vertical only and suits ambient content.
- **visionOS:** Opt out of a mounting style per widget; recessed-only widgets cannot go on horizontal surfaces. Test elevated designs with every frame width; layouts cannot react to it.
- **visionOS:** Paper treatment reacts to room light and looks printed. Glass keeps foreground bright and legible and suits information-rich widgets.
- **watchOS:** The default Smart Stack background is black; a meaningful custom color can help, such as red or green for stocks. Supply relevance to rank higher in the Smart Stack.
- **iOS, iPadOS, visionOS:** Dynamic Type from Large to AX5 works with `Font` or `custom(_:size:)`.
- **tvOS:** Not supported.

**Specs**

System family contexts:

| Size | iPhone | iPad | Mac | Apple Vision Pro |
| --- | --- | --- | --- | --- |
| Small | Home Screen, Today View, StandBy, CarPlay, Apple HomeView | Home Screen, Today View, Lock Screen | Desktop, Notification Center | Horizontal and vertical surfaces |
| Medium | Home Screen, Today View | Home Screen, Today View | Desktop, Notification Center | Horizontal and vertical surfaces |
| Large | Home Screen, Today View | Home Screen, Today View | Desktop, Notification Center | Horizontal and vertical surfaces |
| Extra large | Not supported | Home Screen, Today View | Desktop, Notification Center | Horizontal and vertical surfaces |
| Extra large portrait | Not supported | Not supported | Not supported | Horizontal and vertical surfaces |

Accessory contexts: circular and rectangular appear on the iPhone and iPad Lock Screen and as watch complications and in the Smart Stack. Inline appears on the iPhone and iPad Lock Screen and as watch complications. Corner is watch complications only. Inline offers a single tap target.

Rendering modes:

| Platform | Full-color | Accented | Vibrant |
| --- | --- | --- | --- |
| iPhone | Home Screen, Today view, StandBy and CarPlay (background removed) | Home Screen, Today view | Lock Screen, StandBy in Night Mode |
| iPad | Home Screen, Today view | Home Screen, Today view | Lock Screen |
| Apple Watch | Smart Stack, complications | Smart Stack, complications | Not supported |
| Mac | Desktop, Notification Center | Not supported | Desktop |
| Apple Vision Pro | Horizontal and vertical surfaces | Horizontal and vertical surfaces | Not supported |
| Apple HomeView | Home Screen, Modular face (background removed) | Home Screen, Modular face (background removed) | Modular face in Night Mode |

iOS dimensions (pt):

| Screen (portrait) | Small | Medium | Large | Circular | Rectangular | Inline |
| --- | --- | --- | --- | --- | --- | --- |
| 430x932 | 170x170 | 364x170 | 364x382 | 76x76 | 172x76 | 257x26 |
| 428x926 | 170x170 | 364x170 | 364x382 | 76x76 | 172x76 | 257x26 |
| 414x896 | 169x169 | 360x169 | 360x379 | 76x76 | 160x72 | 248x26 |
| 414x736 | 159x159 | 348x157 | 348x357 | 76x76 | 170x76 | 248x26 |
| 393x852 | 158x158 | 338x158 | 338x354 | 72x72 | 160x72 | 234x26 |
| 390x844 | 158x158 | 338x158 | 338x354 | 72x72 | 160x72 | 234x26 |
| 375x812 | 155x155 | 329x155 | 329x345 | 72x72 | 157x72 | 225x26 |
| 375x667 | 148x148 | 321x148 | 321x324 | 68x68 | 153x68 | 225x26 |
| 360x780 | 155x155 | 329x155 | 329x345 | 72x72 | 157x72 | 225x26 |
| 320x568 | 141x141 | 292x141 | 292x311 | N/A | N/A | N/A |

iPadOS dimensions (pt; canvas / device; * = Display Zoom set to More Space):

| Screen (portrait) | Small | Medium | Large | Extra large |
| --- | --- | --- | --- | --- |
| 768x1024 | 141x141 / 120x120 | 305.5x141 / 260x120 | 305.5x305.5 / 260x260 | 634.5x305.5 / 540x260 |
| 744x1133 | 141x141 / 120x120 | 305.5x141 / 260x120 | 305.5x305.5 / 260x260 | 634.5x305.5 / 540x260 |
| 810x1080 | 146x146 / 124x124 | 320.5x146 / 272x124 | 320.5x320.5 / 272x272 | 669x320.5 / 568x272 |
| 820x1180 | 155x155 / 136x136 | 342x155 / 300x136 | 342x342 / 300x300 | 715.5x342 / 628x300 |
| 834x1112 | 150x150 / 132x132 | 327.5x150 / 288x132 | 327.5x327.5 / 288x288 | 682x327.5 / 600x288 |
| 834x1194 | 155x155 / 136x136 | 342x155 / 300x136 | 342x342 / 300x300 | 715.5x342 / 628x300 |
| 954x1373 * | 162x162 / same | 350x162 / same | 350x350 / same | 726x350 / same |
| 970x1389 * | 162x162 / same | 350x162 / same | 350x350 / same | 726x350 / same |
| 1024x1366 | 170x170 / 160x160 | 378.5x170 / 356x160 | 378.5x378.5 / 356x356 | 795x378.5 / 748x356 |
| 1192x1590 * | 188x188 / same | 412x188 / same | 412x412 / same | 860x412 / same |

visionOS dimensions: Small 158x158 pt (268x268 mm at 100%); Medium 338x158 (574x268); Large 338x354 (574x600); Extra large 450x338 (763x574); Extra large portrait 338x450 (574x763).

watchOS Smart Stack (pt): 40mm 152x69.5; 41mm 165x72.5; 42mm 176x72.5; 44mm 173x76.5; 45mm 184x80.5; 46mm 194x80.5; 49mm Ultra 3, 4 198x81.5; 49mm Ultra 1, 2 191x81.5.

**APIs:** WidgetKit, `WidgetRenderingMode` (`fullColor`, `accented`, `vibrant`), `widgetAccentable(_:)`, `ContainerRelativeShape`, `padding(_:_:)`, `Font`, `custom(_:size:)`, `LevelOfDetail` (`simplified`, `default`), `WidgetMountingStyle` (`elevated`, `recessed`), `supportedMountingStyles(_:)`, `WidgetConfiguration`, `WidgetTexture` (`paper`, `glass`), RelevanceKit, ActivityKit

Last change: October 13, 2026 — added Apple HomeView guidance and updated watchOS specifications.
