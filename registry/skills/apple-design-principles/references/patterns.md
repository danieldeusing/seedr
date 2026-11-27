# Patterns

Cross-cutting interaction patterns from Apple's Human Interface Guidelines: data entry, feedback, files, launch and onboarding, media, notifications, settings and more. Use it to design or review a flow that spans several components.

## Pages
- [Charting data](#charting-data): when to chart, keeping charts simple, consistent and accessible
- [Collaboration and sharing](#collaboration-and-sharing): Share button, share sheet permissions, Collaboration button, Messages events
- [Drag and drop](#drag-and-drop): move versus copy, drag feedback, accepting drops, platform specifics
- [Entering data](#entering-data): gathering data automatically, choices over typing, live validation
- [Feedback](#feedback): matching feedback weight to importance, alerts, warnings, confirmations
- [File management](#file-management): creating, opening, autosaving files, Quick Look, document launcher
- [Going full screen](#going-full-screen): when to offer full screen, controls, Dock, exiting
- [Launching](#launching): instant launch, launch screens, state restoration
- [Live-viewing apps](#live-viewing-apps): live TV playback, content footer, program guide, cloud DVR
- [Loading](#loading): placeholders, background loading, progress indicators, game loading views
- [Managing accounts](#managing-accounts): sign-in timing, passkeys, account deletion, TV provider accounts
- [Managing notifications](#managing-notifications): Focus, interruption levels, marketing notification consent
- [Modality](#modality): when to use modal views, dismissal, data loss, stacking
- [Multitasking](#multitasking): pausing, audio interruptions, background tasks, windows per platform
- [Offering help](#offering-help): contextual help, TipKit tips, tooltips on macOS and visionOS
- [Onboarding](#onboarding): interactive, brief, optional onboarding; permissions and deferred setup
- [Playing audio](#playing-audio): silent mode, audio categories, interruptions, Spatial Audio
- [Playing haptics](#playing-haptics): system patterns and meanings, custom haptics, platform tables
- [Playing video](#playing-video): system player, aspect modes, TV app integration, watchOS specs
- [Printing](#printing): where to place Print, when to show it, macOS print panels
- [Ratings and reviews](#ratings-and-reviews): when and how often to ask, system prompt limits
- [Searching](#searching): search placement, scope, suggestions, Spotlight indexing
- [Settings](#settings): defaults, general versus task options, macOS settings window
- [Undo and redo](#undo-and-redo): predictable, visible, multi-step undo; standard gestures and shortcuts
- [Workouts](#workouts): workout sessions, metrics layout, controls, summaries, legibility in motion

## Charting data
Source: https://developer.apple.com/design/human-interface-guidelines/charting-data

A chart shows what a dataset means: trends, the current state of a changing value, or a comparison across categories. When people only need the raw values, use a list or table they can scroll, search and sort instead.

**Do**
- Use a chart only to make a point about the data; its visual weight draws attention.
- Start simple and let people reveal more detail, subsets or functions step by step.
- Give every chart accessibility labels for values and parts, plus accessibility elements for interaction (see Charts).
- Prefer familiar types such as bar and line charts.
- Teach a novel chart type, as Activity animates each ring separately to map it to move, exercise and stand.
- Look at the data at macro (totals, averages), mid (subsets) and point level to find details worth showing.
- Add titles, subtitles, annotations and a short summary headline, as Weather does above its hourly forecast.
- Size a chart to its detail and interactivity: large for exploration, small for a glance or a preview.
- Keep charts with a similar purpose in one type and style; vary only to signal a real difference.
- For several views of one dataset, keep the chart type, colors, annotations, layout and text the same.

**Avoid**
- Packing as much data as possible into one chart.
- Treating a descriptive headline as a substitute for accessibility labels.

**Platform notes**
- No extra guidance for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

**APIs:** Swift Charts

Last change: September 23, 2022 — page added.

## Collaboration and sharing
Source: https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing

The system share sheet, sharing popover, Collaboration button and Messages integration let people share content or start a collaboration. They work with CloudKit, iCloud Drive or a custom backend; a custom backend also needs universal links. For live shared activities, see SharePlay.

**Do**
- Put the Share button in an easy place such as a toolbar.
- Customize the share sheet or popover to list the sharing types you support.
- Support "send copy": with CloudKit pass the file and the collaboration object; iCloud Drive has it by default; custom solutions include the file or a plain-text version.
- Summarize permissions in a short phrase, for example "Only invited people can edit"; the system shows it on the button that opens sharing options.
- Offer few, clearly grouped options: who has access, edit or read only, whether collaborators can invite others.
- Show the Collaboration button prominently once collaboration starts, next to the Share button.
- Retitle the "Manage Shared File" button if a better name fits; CloudKit supplies the management view, otherwise build your own.
- Post collaboration events to Messages (content change, membership change, mention) with a universal link to the relevant view.

**Avoid**
- Custom items in the collaboration popover unless essential. The popover has three sections: collaborators with Messages/FaceTime buttons, your custom items, and the manage button.

**Platform notes**
- **iOS, iPadOS, macOS:** no extra guidance. iOS 16 share sheet and the iPadOS 16 / macOS 13 sharing popover include sharing method and permission choices.
- **tvOS:** Not supported.
- **visionOS:** By default the current window streams to collaborators in the Shared Space; the stream pauses while the app is in a Full Space.
- **watchOS:** Use `ShareLink` to present the system share sheet.

**APIs:** `ShareLink`, Shared with You, `SWHighlightEvent`

Last change: December 5, 2023 — artwork added for button placement and permission types.

## Drag and drop
Source: https://developer.apple.com/design/human-interface-guidelines/drag-and-drop

Drag and drop moves or copies selected content from a source to a destination, within one container, across containers or across apps. As a default, a drop in the same container moves; a drop in another container copies; a drop in another app always copies.

**Do**
- Support drag and drop almost everywhere; system text fields and text views have it built in.
- Offer another way to do the same thing, such as menu commands, and identify sources and destinations for assistive technologies.
- Choose move or copy by what people expect; prefer the option least likely to lose data.
- Support dragging several items as a group.
- Let people undo a drop; ask for confirmation before a drop that cannot be undone (Finder does this for a write-only folder).
- Offer several representations from highest to lowest fidelity, for example PDF, then PNG with transparency, then JPEG.
- Consider spring loading: dragging over a button or segmented control activates it (force click on Magic Trackpad, hover on iPad).
- Show a translucent drag image after the pointer moves about 3 points; keep it until the drop.
- Change the drag image only when it helps predict the result, for example the photo's default size; use flocking to group several items.
- Highlight a destination or show an insertion point only while content is over it and only if it accepts the content.
- Show "not allowed" (no feedback, or `circle.slash`) for a destination that rejects content.
- On a failed or invalid drop, animate the item back to its source or scale it up and fade it out.
- Auto-scroll a scrolling destination while content is over it; stop when the drag leaves it.
- Take the richest version your app can accept; extract only the relevant part (Mail keeps only name and email of a contact).
- With a physical keyboard, check the Option key at drop time: held means copy within the same container.
- Show progress, and a placeholder in lists or collections, when dropped content needs time to transfer.
- Show that a task started, such as printing, when a drop triggers it.
- Keep text attributes when both sides support them; otherwise apply the destination's style.
- Keep the dropped content selected in the destination; deselect it in the source.

**Avoid**
- A drag image that changes constantly or radically.

**Platform notes**
- **tvOS, watchOS:** Not supported.
- **iOS, iPadOS:** Let people add items to a drag in progress and accept several simultaneous drops, with flocking as feedback.
- **macOS:** Support dragging to the Finder in a format your app can open again (Calendar exports `.ics`); use a clipping for text. A clipping is unrelated to the Clipboard.
- **macOS:** Allow dragging a background selection, or a single unselected item, from an inactive window without activating it or changing its selection.
- **macOS:** Show a count badge (small filled oval) on multi-item drags; update it if the destination takes only some items.
- **macOS:** Change the pointer to copy, drag link, disappearing item or operation not allowed as fits.
- **macOS:** Let people select and drag in one motion.
- **visionOS:** People pinch and hold and drag in any direction, including depth. Open a window or scene for content dropped into empty space via `NSUserActivity`.

**APIs:** UIKit and AppKit drag and drop, `accessibilityDragSourceDescriptors`, `accessibilityDropPointDescriptors`, `NSUserActivity`, File Provider

Last change: October 24, 2023 — artwork added.

## Entering data
Source: https://developer.apple.com/design/human-interface-guidelines/entering-data

Guidance for any place where people supply information. Gather what you can in advance and support every input method so people type less and make fewer mistakes.

**Do**
- Read data from the system or, with permission, from sources such as location or calendar instead of asking.
- State what you need with a placeholder such as "username@company.com" or a label such as "Email".
- Prefill reasonable defaults.
- Use a secure field that masks each character for sensitive data.
- Offer pickers, menus or other choices instead of free text where possible.
- Accept drag and drop and paste as input.
- Validate each value as soon as it is entered and report problems at once.
- Use a number formatter for numeric fields; it limits input to numbers and can show decimals, percent or currency.
- Enable Next or Continue only after the required data is present.

**Avoid**
- Prefilling a password field; ask for it or use biometrics or the keychain.

**Platform notes**
- **macOS:** Use an expansion tooltip to show the full text of a clipped field when the pointer rests on it (also for iOS and iPadOS apps on Mac).
- **tvOS:** A digit entry view can mask the numerals (`isSecureDigitEntry`).
- **visionOS:** The system text field shows entries only to the wearer; a secure field blurs during AirPlay.

**APIs:** `SecureField`, `isSecureDigitEntry`, SwiftUI input events

Last change: June 21, 2023 — visionOS guidance added.

## Feedback
Source: https://developer.apple.com/design/human-interface-guidelines/feedback

Feedback tells people the status of something, whether an action succeeded or failed, warns of harmful consequences, and offers a way to fix a problem. Match the delivery to the weight of the message: passive for status, interruptive for possible data loss.

**Do**
- Deliver feedback through several channels (color, text, sound, haptics) so it reaches people who mute, look away or use VoiceOver.
- Show status inline near the items it describes, as Mail shows the last update and unread count in its toolbar.
- Reserve alerts for critical, ideally actionable, information.
- Warn before an action that causes unexpected, irreversible data loss.
- Confirm completion only for significant tasks, such as an Apple Pay payment.
- Explain why a command cannot run, as Maps does for directions with the same start and end.

**Avoid**
- Frequent or unimportant alerts; they lose impact.
- Warnings when data loss is the expected result, such as moving a file to the Trash.

**Platform notes**
- **watchOS:** Do not show an indeterminate progress indicator; promise a notification when the process finishes.

**APIs:** UIKit animation and haptics

## File management
Source: https://developer.apple.com/design/human-interface-guidelines/file-management

Guidance for document-based apps that create, open, save and browse files. People also manage files in the Finder (macOS) and Files (iPhone, iPad, Apple Vision Pro); tvOS and watchOS offer no document browser.

**Do**
- Provide New and Open commands with keyboard shortcuts; iPadOS lists them in the Command-key shortcut overlay, macOS in the File menu.
- Always include an Add (+) button to create a document; on macOS also put the action in the File menu.
- In a custom file browser, open at a useful place (Documents, iCloud, last location) but allow access to the whole file system.
- Save automatically and periodically while editing, on close and on app switch.
- Hide file extensions by default, let people show them, and reflect the choice in every open and save view.
- Use a Quick Look viewer to preview files your app cannot open.
- Provide a Quick Look generator for custom file types so Finder, Files and Spotlight can preview them.

**Avoid**
- Requiring an explicit save action.

**Platform notes**
- **iOS, iPadOS:** From iOS 18 and iPadOS 18, use the document launcher: a title card with app name and two buttons, a background with accessory images, and a sheet with the file browser and optional controls.
- **iOS, iPadOS:** Give the primary title-card button the main action (usually new document) and the secondary one extra options, such as Choose a Template.
- **iOS, iPadOS:** Use a solid, gradient or pattern background clearly distinct from the title card; avoid busy images.
- **iOS, iPadOS:** Place accessories in front of and behind the card for depth, keep the name and buttons readable, avoid clutter, and test all sizes and orientations.
- **iOS, iPadOS:** Animate accessories gently and sparingly, for example a slow breathe or sway.
- **iOS, iPadOS:** A file provider extension lists only files that fit the context (only PDFs for a PDF editor), optionally with date, size and local/remote state.
- **iOS, iPadOS:** Let people pick a destination folder, and optionally create one, when exporting or moving; do not add a top toolbar to the extension's modal view.
- **macOS:** Use the standard file browser unless there is a strong reason not to.
- **macOS:** A custom open view can add Open Recent, filters and multiple selection; rename the Open button to fit the task, such as Insert.
- **macOS:** A save view lets people change name (default "Untitled"), location and format; add an accessory view for options such as including attachments.
- **macOS:** A Finder Sync extension can show sync badges, add context menu items and add toolbar buttons.
- **macOS:** When people turn off autosave ("Ask to keep changes when closing documents" in Desktop & Dock), present a save dialog on close, quit, log out or restart.
- **macOS:** With autosave off, show a dot in the close button and beside the name in the Window menu; with autosave on, show no dot.
- **macOS:** You may append "Edited" to the title; remove it as soon as the document saves.
- **tvOS, visionOS, watchOS:** No extra guidance.

**APIs:** `DocumentGroupLaunchScene`, File Provider, Finder Sync, SwiftUI Documents

Last change: June 10, 2024 — document launcher guidance added for iOS and iPadOS.

## Going full screen
Source: https://developer.apple.com/design/human-interface-guidelines/going-full-screen

Full-screen mode on iPhone, iPad and Mac fills the screen and hides system controls for focus. Offer it for games, media such as video or slideshows, and deep tasks that benefit from no distractions.

**Do**
- Adapt proportions of the layout to the larger space, subtly, without changing which items appear.
- Keep essential controls available or easy to reveal, such as playback controls.
- Let people reveal the Dock in iPadOS and macOS, except in games.
- Pause games and slideshows when people switch away, and resume where they left off.
- Leave the exit to people; do not end full screen automatically when an activity finishes.
- Hide toolbars and navigation while content is the focus; restore them with a tap, a swipe down or the pointer at the top edge.
- Keep controls visible when they are needed for navigation or the task.

**Avoid**
- Resizing the window programmatically.

**Platform notes**
- **tvOS, visionOS, watchOS:** Not supported. visionOS uses larger windows and immersive spaces instead.
- **iOS, iPadOS:** The Home indicator hides soon after launch and one swipe exits; keep this. If accidental exits happen, require two swipes by deferring system gestures. Games can ignore the first swipe up so the Dock does not appear.
- **macOS:** Use the system full-screen support; it handles the camera housing at the top center of some Macs.
- **macOS:** In games, do not change the display mode when going full screen. Games may hide the Dock.
- **macOS:** Enter full screen only on request: the window's Enter Full Screen button, the View menu, or Control-Command-F. Games may add a toggle.
- **macOS:** Do not offer a custom menu of window modes.

**APIs:** `preferredScreenEdgesDeferringSystemGestures` (SwiftUI, UIKit), `hideDock`, `toggleFullScreen(_:)`, `fullScreenCover(item:onDismiss:content:)`, `NSScreen`, `NSWindow.CollectionBehavior`

Last change: June 9, 2025 — updated guidance on hiding toolbars and on deferring Home indicator gestures in iOS and iPadOS.

## Launching
Source: https://developer.apple.com/design/human-interface-guidelines/launching

Launching runs from opening the app (including any first download) until the first screen is ready. Onboarding, if any, comes after it.

**Do**
- Launch at once; people may not wait more than a couple of seconds.
- Provide a launch screen where the platform requires one: iOS, iPadOS and tvOS.
- Show a splash screen, if you need one, at the start of onboarding, or right after launch when there is no onboarding.
- Restore the previous state on restart: scroll position, and windows in the same state and place.
- Make the launch screen nearly identical to the first screen; if the app first shows a solid color, show only that color.
- Match the launch screen to the current orientation and appearance mode.

**Avoid**
- Treating the launch screen as onboarding, a splash screen or artistic expression.
- Text on the launch screen; it is static and cannot be localized.
- Logos, branding or an About-like look, unless they are a fixed part of the first screen.

**Platform notes**
- **macOS, visionOS, watchOS:** No launch screen needed.
- **iOS, iPadOS:** Launch in the current orientation if you support both; otherwise in your only orientation. A landscape-only app must handle both left and right rotation.
- **tvOS:** The launch screen is static, not layered. A live-viewing app can start playing new or recent live content after a few seconds of inactivity.
- **visionOS:** Even a fully immersive app can open a window in the Shared Space first, with a control to enter the Full Space.

**APIs:** Xcode launch screen configuration, UIKit app launch handling

Last change: June 10, 2024 — guidance on splash screens added.

## Live-viewing apps
Source: https://developer.apple.com/design/human-interface-guidelines/live-viewing-apps

Guidance for apps that stream live TV. Put live content first and make it easy to tell apart from video on demand (VOD) on every screen.

**Do**
- Put live content in the first tab so it starts with at most one tap.
- Start playback with one tap or none, for example a Watch Now button over featured content that vanishes as full-screen playback begins.
- Mark live items with a badge, symbol or sash, and group other channels in a row titled "Live".
- Show progress of in-progress live programs so people know where they will join.
- Keep playback the primary action; offer record, restart, download and more in a fixed order everywhere, for example Watch, Start Over, Record, Favorite.
- Show other air times of the current program.
- Consider a content footer for browsing channels during playback: darken it for legibility, badge or tint the current item, use the EPG's categories, and dismiss it with the opposite gesture (swipe up, swipe down).
- Give instant visual feedback on a channel change; it confirms the channel and hides load time.
- Keep audio playing while people browse in the live context; stop it when they leave the live tab.
- In the electronic program guide (EPG), highlight the current program, channel and time and make returning to playback easy.
- Make the EPG easy to page, scroll and jump through; add My Channels or Favorites.
- Group content into familiar categories such as Movies, TV Shows, Kids, Sports, Popular.
- Keep content playing in picture in picture or the background while people browse the EPG.
- Cloud DVR: start and stop recording from the info panel during live playback.
- Cloud DVR: record a future program from its detail view, as one program or all future episodes; allow precise rules such as new episodes only or specific teams.
- Cloud DVR: allow play, delete and recording settings in the detail view.
- Cloud DVR: offer storage management, such as deleting watched or old recordings, or automatic overwriting of the oldest or watched content.

**Platform notes**
- No extra guidance for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

## Loading
Source: https://developer.apple.com/design/human-interface-guidelines/loading

Guidance for loading assets, levels or other content so that it does not disrupt the experience. Ideally loading ends before people notice it.

**Do**
- Show something at once: placeholder text, graphics or animation, replaced as content arrives.
- Load in the background and let people do other things, such as read about the next level or open a menu.
- For long loads, show tips, hints or new features; estimate the remaining time so the filler neither runs short nor repeats.
- Download large assets (level packs, 3D models, textures) in the background after install, during updates or at other quiet times.
- Show a progress indicator when loading takes more than a moment: determinate when the duration is known, indeterminate when not.
- In games, consider a custom loading view that matches the game's style.

**Avoid**
- A blank screen while content loads.

**Platform notes**
- **watchOS:** Avoid loading indicators and show content at once; for a load of a second or two, an indicator is better than a blank screen.

**APIs:** Background Assets, GameKit guidance for games with large downloads

Last change: June 9, 2025 — guidance revised to cover downloading large assets in the background.

## Managing accounts
Source: https://developer.apple.com/design/human-interface-guidelines/managing-accounts

Require an account only when core features need it. If you do, consider Sign in with Apple; this page also covers authentication wording, account deletion and TV provider sign-in.

**Do**
- Explain briefly in the sign-in view why an account is needed and what it gives.
- Delay sign-in as long as possible, for example until purchase in a shopping app.
- Without Sign in with Apple on iOS, iPadOS, macOS or visionOS, prefer passkeys; if you keep passwords, require two-factor authentication.
- Name the method on the button, for example "Sign In with Face ID", not "Sign In".
- Mention only methods the device offers; check the biometry type.
- Offer account deletion, not only deactivation, wherever people can create an account in the app, and follow local law on deletion and the right to be forgotten.
- Make deletion easy to start in the app, or link directly to the deletion webpage; do not hide the link in privacy or terms pages.
- Explain what legal requirements force you to keep, such as health records, and any required process.
- Revoke Sign in with Apple tokens when an account is deleted.
- Keep the in-app and web deletion flows equally simple.
- Consider scheduled deletion, but always offer immediate deletion too.
- Say when deletion will finish and notify people when it does.
- Explain that auto-renewable subscriptions keep billing through Apple until canceled, and that people must cancel or request a refund themselves; show how.
- Support account deletion even when the subscription was bought outside your app.
- TV provider apps: use TV Provider Authentication for system-level sign-in.

**Avoid**
- An in-app setting to opt in to biometric authentication; people turn it on in the system.
- The word "passcode" for account authentication; it refers to the device passcode.
- A sign-out option when people are signed in at system level; if required, send people to Settings > TV Provider.
- Telling people to sign out through the TV provider controls in Settings > Privacy.

**Platform notes**
- **iOS, iPadOS, macOS, visionOS:** No extra guidance.
- **tvOS:** Ask for minimal information; prefer sign-up or sign-in on another device through associated domains, including Sign in with Apple.
- **tvOS:** From tvOS 16, share credentials across users of a shared account and keep each profile separate, so people do not pick a profile each time.
- **tvOS:** For more than a little data, send people to a website on another device; for email, use the email keyboard screen with recent addresses.
- **watchOS:** Use iCloud Keychain sync for autofill of user names and passwords and for app settings.

**APIs:** Supporting passkeys (Authentication Services), iCloud Keychain verification codes, `LABiometryType`, Sign in with Apple token revocation, `kSecUseUserIndependentKeychain`, User Management Entitlement

## Managing notifications
Source: https://developer.apple.com/design/human-interface-guidelines/managing-notifications

Notifications deliver timely information on a locked or active device, only after people grant permission. People can change that choice in settings, silence all notifications (except government alerts in some regions), set up a Focus and schedule summaries.

Direct communication (calls, messages) uses communication notifications with SiriKit intents; the sender decides delivery. Every other notification needs one of four interruption levels:

| Level | Use for | Overrides scheduled delivery | Breaks through Focus | Overrides Ring/Silent (iPhone, iPad) |
| --- | --- | --- | --- | --- |
| Passive | Info to read later, such as a restaurant tip | No | No | No |
| Active (default) | Info worth knowing on arrival, such as a score | No | No | No |
| Time Sensitive | Needs attention now, such as a security issue or delivery | Yes | Yes | No |
| Critical | Urgent health and safety; needs an entitlement | Yes | Yes | Yes |

**Do**
- Assign the level that honestly matches the urgency.
- Use Time Sensitive only for events happening now or within an hour; the system explains it on first use and lets people turn it off.
- Get explicit opt-in before marketing or promotional notifications, with a view that names the content types and offers a clear choice.
- Provide an in-app settings screen where people can change their notification choices.

**Avoid**
- High urgency for low-priority information.
- Marketing notifications without consent, and never at Time Sensitive level.

**Platform notes**
- **watchOS:** iPhone notification settings apply by default; people manage them in the Apple Watch app or swipe left on a notification for options such as Mute 1 Hour or Turn off Time Sensitive.
- **iOS, iPadOS, macOS, tvOS, visionOS:** No extra guidance.

**APIs:** User Notifications, `UNNotificationInterruptionLevel`, `INSendMessageIntent`, `UNNotificationContentProviding`

## Modality
Source: https://developer.apple.com/design/human-interface-guidelines/modality

A modal view shows content in a separate mode that blocks its parent and needs an explicit action to close. Use it for critical information, to confirm or change a recent action, for a short focused task, or for immersion. Components include alerts, activity views, sheets, popovers, confirmation dialogs or action sheets, and separate windows on iPadOS, macOS and visionOS.

**Do**
- Use modality only when it clearly helps people focus or make choices that affect content or device.
- Keep modal tasks short, simple and streamlined.
- If a modal task needs subviews, give one single path through them.
- Use a full-screen modal style for media, camera views or multistep tasks such as markup or photo editing.
- Always offer an obvious dismiss: top-toolbar button or swipe down in iOS, iPadOS and watchOS; a button in the content view in macOS and tvOS.
- Before closing a view would lose user content, explain and offer a way out, for example an action sheet with Save in iOS.
- Title the modal view with its task, and add guidance text when useful.
- Let people dismiss one modal view before you present another.

**Avoid**
- A modal flow that feels like an app inside the app, with a deep view hierarchy.
- Buttons that people can mistake for the dismiss button.
- Several modal views visible at once; never show more than one alert at a time.

**Platform notes**
- **visionOS:** In the Shared Space a full-screen modal fills a window; in a Full Space it can become more immersive.
- No other platform-specific guidance.

**APIs:** SwiftUI presentation modifiers, `UIModalPresentationStyle`, AppKit modal windows and panels

Last change: December 5, 2023 — more guidance on in-depth modal experiences and on multiple modal views.

## Multitasking
Source: https://developer.apple.com/design/human-interface-guidelines/multitasking

Multitasking lets people switch between apps and work in several at once. Nearly every app must support it; exceptions are some games and visionOS apps in a Full Space. Always be ready to save and restore context.

**Do**
- Pause games, media and other activities that need attention when people switch away; resume exactly where they left.
- For long audio interruptions (music, podcasts, audiobooks), pause indefinitely.
- For short interruptions such as GPS prompts, lower the volume or pause, then restore it afterward.
- Finish user-started tasks, such as downloads or video processing, in the background before suspending.
- Notify people when an important or time-sensitive task finishes in the background.

**Avoid**
- Notifications for routine or secondary tasks; let people check on return.

**Platform notes**
- **watchOS:** Not supported.
- **iOS:** People use FaceTime or video in Picture in Picture while in another app.
- **iPadOS:** Apps run full screen (switch via the app switcher) or windowed: resizable windows with system controls for tiling, full screen, minimize and close. The frontmost window has colored controls and casts a shadow.
- **iPadOS:** Apps do not control or learn the multitasking configuration; adapt the layout to any size. Picture in Picture works in both modes.
- **macOS:** Multitasking is the default; the system layers windows with shadows and shows window states.
- **tvOS:** People can browse or play content while a video plays in Picture in Picture, where supported.
- **visionOS:** Several apps share the Shared Space; only the window people look at is active, others turn translucent and recede. Closing a window backgrounds the app without quitting.
- **visionOS:** Closing the Now Playing app's window pauses audio; people resume in Control Center.
- **visionOS:** Do not alter window edges; the system feathers inactive windows.
- **visionOS:** Keep video playing when people look away; expect your audio to duck unless you are the Now Playing app.

**APIs:** UIKit multitasking on iPad, Mac and Apple Vision Pro; UIKit app launch handling

Last change: June 9, 2025 — platform notes reorganized; iPadOS guidance for multiple windows added.

## Offering help
Source: https://developer.apple.com/design/human-interface-guidelines/offering-help

Contextual help for cases where the interface alone is not enough: inline descriptions, tutorials, TipKit tips, and tooltips on macOS and visionOS.

**Do**
- Fit help to the task: an inline note for one- or two-step tasks, a tutorial for complex goals.
- Tie help to what people are doing now and make it easy to skip or dismiss.
- Match words and images to the current input device and platform; no game controller images for Siri Remote users, no "click" on iPhone.
- Keep help content inclusive.
- Teach a unique control or unusual input, such as holding the Siri Remote rotated 90 degrees, quickly with animation or graphics.
- Choose the tip type: popover to keep content flow; inline so nearby content stays visible; annotation style to point at an element; hint style when no element applies.
- Use tips only for features that take at most three actions.
- Write tips in one or two direct, action-oriented sentences.
- Set eligibility rules (parameter or event based) so only people who would benefit see a tip; limit frequency, for example once every 24 hours.
- Include the feature's symbol in a tip, filled variant preferred, such as a star for favorites.
- Add a button that leads to the related settings or further resources, such as a setup flow.
- Tooltips: describe only the control in question and what it does; start with a verb, such as "Restore default settings".
- Tooltips: keep to 60–75 characters, use fragments without articles, and use sentence case.
- Tooltips: omit final punctuation unless your style needs it; vary text by control state where useful.

**Avoid**
- Explaining how standard components or patterns work.
- Promotional content in tips, or content about another feature or flow.
- Repeating the symbol in a tip that points directly at the same symbol in the UI.
- Repeating the control's name in its tooltip.

**Platform notes**
- **macOS, visionOS:** Tooltips (help tags) appear when the pointer rests on an element, including iPhone and iPad apps on Mac; in visionOS also when people look at it.
- **iOS, iPadOS, tvOS, watchOS:** No extra guidance.

**APIs:** TipKit, `help(_:)`, `NSHelpManager`

Last change: December 5, 2023 — visionOS included in tooltip guidance.

## Onboarding
Source: https://developer.apple.com/design/human-interface-guidelines/onboarding

Onboarding gives people a quick start after launch has finished; it is not part of launching. Use it only when the app cannot teach itself, and keep it fast, enjoyable and optional.

**Do**
- Let people try actions, features or game mechanics safely instead of reading instructions.
- Prefer context-specific tips (TipKit), shown near the part of the UI they describe, over one long flow.
- Keep a required flow brief and fun, with little to memorize.
- Make a separate tutorial skippable; once skipped, do not show it again, but keep it in help, account or settings.
- Teach your app, not the system or the device.
- Show a splash screen, if needed, only long enough to absorb at a glance.
- Bundle enough media so people need not wait for downloads.
- Postpone nonessential setup and provide sensible defaults.
- Ask for permissions the app cannot work without during onboarding, explaining why; otherwise ask at first use of the feature.
- Let people use the app before asking for ratings or purchases.

**Avoid**
- Teaching too much at once.
- Licensing details and disclaimers in onboarding; the App Store shows them. If unavoidable, integrate them without disrupting the flow.

**Platform notes**
- No extra guidance for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

**APIs:** TipKit

Last change: June 10, 2024 — onboarding approaches clarified; splash screen guidance added.

## Playing audio
Source: https://developer.apple.com/design/human-interface-guidelines/playing-audio

Audio must behave as people expect across outputs (speakers, headphones, Bluetooth, AirPlay) and controls (volume buttons, Ring/Silent switch, headphone controls, Control Center). In silent mode, play only audio people start, such as media, alarms and calls; volume affects all sound except the separately set iPhone ringer.

**Do**
- Silence nonessential sounds (keyboard clicks, effects, game music) when the device is silent.
- Reroute audio seamlessly when headphones connect; pause immediately when they disconnect.
- Balance relative levels inside your mix; the system volume controls the final output.
- Support rerouting to other outputs unless there is a strong reason not to.
- Use the system volume view (slider plus route control); you may style the slider.
- Pick the audio category that matches your use (table below); do not stop other apps' music needlessly.
- Respond to external audio controls only while playing, in a clear audio context, or connected via Bluetooth or AirPlay.
- Build custom player controls only for commands the system lacks, such as custom skip intervals or related content like scores.
- Tell other apps when your temporary audio ends so they can resume (`notifyOthersOnDeactivation`).
- Decide how to handle interruptions; for example, recording apps can avoid interruption by a call unless people accept it.
- A VoIP app must end the call when an iPad Smart Folio closes over the built-in mic; never silently restart the session and unmute.
- After an interruption, media apps resume only if it was resumable (a call, not a new playlist); games may always resume.

| Category | Use | Silent switch | Mixes with others | Background |
| --- | --- | --- | --- | --- |
| Solo ambient | Nonessential, silences others (game soundtrack) | Obeys | No | No |
| Ambient | Nonessential, lets others play (game with user music) | Obeys | Yes | No |
| Playback | Essential (audiobook, language course) | Ignores | Optional | Plays |
| Record | Recording (voice notes) | Ignores | No | Records |
| Play and record | Both, possibly at once (audio messages, video calls) | Ignores | Optional | Records and plays |

**Avoid**
- Changing the overall system volume.
- Stopping another app's audio when people press a control you do not use.
- Redefining audio controls, or responding to ones you do not support.

**Platform notes**
- **iOS, iPadOS:** Use system sound services for short sounds and vibrations.
- **macOS:** Notification sounds mix with other audio by default.
- **tvOS:** Audio plays only when people start it; alerts and notifications make no sound.
- **visionOS:** Never convey important information by sound alone.
- **visionOS:** Closing the Now Playing app's window pauses it; other apps' audio can duck when people look away.
- **visionOS:** Prefer playing sound; a silent app can feel broken. Give custom elements custom feedback sounds.
- **visionOS:** Use Spatial Audio with both ambient audio and object audio sources; let sound follow its source, such as a moved window.
- **visionOS:** Vary repetitive sounds by randomizing pitch and volume at playback, like the virtual keyboard.
- **visionOS:** Choose fixed sound (aimed at the wearer, as in Mindfulness) or tracked sound (from an object, for realism).
- **watchOS:** The system manages playback; short clips play in the foreground, longer audio continues in the background.
- **watchOS:** Encode audio as 64 kbps HE-AAC. Consider the system Now Playing view, which picks the current or last source.

**APIs:** `AVAudioSession`, `AVAudioSession.Category`, `MPVolumeView`, `notifyOthersOnDeactivation`, `shouldResume`, Audio Services, MusicKit, WatchKit background audio and Now Playing view

Last change: June 21, 2023 — visionOS guidance added.

## Playing haptics
Source: https://developer.apple.com/design/human-interface-guidelines/playing-haptics

Haptics add touch feedback next to visuals and sound. Standard controls on supported iPhones play them automatically; Apple Watch uses the Taptic Engine with a tone; Mac Force Touch trackpads, game controllers (iPadOS, macOS, tvOS, visionOS), Apple Pencil Pro and some iPad trackpads can play them too.

**Do**
- Use each system pattern only for its documented meaning; otherwise use a generic or custom pattern.
- Keep one pattern per cause across the app; never reuse a failure pattern for success.
- Pair haptics with matching animation and sound; match intensity and sharpness to the animation.
- Prefer short haptics for discrete events in apps; reserve long-running haptics for gameplay.
- Let people turn haptics off, and keep the app fully usable without them.
- Make sure vibration does not disturb the camera, gyroscope or microphone.
- Custom haptics (Core Haptics): combine transient events (tap-like impulses) and continuous events (sustained vibration), set sharpness (soft and organic to crisp and mechanical) and intensity (strength), and add optional audio.
- Vary custom haptics with context, such as a stronger landing from a higher jump.

**Avoid**
- Overusing haptics; user test to find the balance.
- Continuous or long haptics on Apple Pencil Pro.

**Platform notes**
- **iOS:** Standard toggles, sliders and pickers play system haptics. `UIFeedbackGenerator` offers three categories: notification (success, warning, error), impact (light, medium, heavy, rigid, soft), and selection (value changing).
- **macOS:** With a Magic Trackpad, respond to drags or force clicks with one of three patterns:

| Pattern | Use |
| --- | --- |
| Alignment | Dragged item aligns, fits a size, reaches a preferred position, or hits a start/end or min/max |
| Level change | Pressure moves between discrete levels, such as fast-forward speeds |
| Generic | Any other feedback |

- **watchOS:** Series 4 and later give Digital Crown detents, linear by default; table views add detents as items scroll in. System haptics and their meanings:

| Haptic | Meaning |
| --- | --- |
| Notification | Something significant needs attention; also plays on notification arrival |
| Up | An important value rose above a threshold |
| Down | An important value fell below a threshold |
| Success | An action completed |
| Failure | An action failed |
| Retry | An action failed and can be retried |
| Start | An activity people can start and stop began, such as a timer |
| Stop | That activity stopped |
| Click | Dial-like click at set increments; overuse or overlap confuses |

**APIs:** Core Haptics, `UIFeedbackGenerator`, `NSHapticFeedbackPerformer`, `WKHapticType`, haptics on game controllers

Last change: May 7, 2024 — guidance for Apple Pencil Pro haptics added.

## Playing video
Source: https://developer.apple.com/design/human-interface-guidelines/playing-video

System video players embed playback in iOS, iPadOS, macOS, tvOS and visionOS, with aspect modes and, on most platforms, Picture in Picture (PiP). Content can also appear in the TV app. In tvOS and visionOS the player adds transport controls (subtitles, audio language, actions) and content tabs such as Info, Episodes, Chapters; in visionOS the controls sit in an ornament.

**Specs**
- Aspect-fill (full screen, may crop edges): default for wide video, 2:1 through 2.40:1.
- Aspect (fit to screen, letterbox or pillarbox): default for standard video up to 2:1 (4:3, 16:9) and ultrawide above 2.40:1.

**Do**
- Use the system player; a custom one must mirror its behavior and interface closely.
- Deliver video at its original aspect ratio, with no padding baked into the frame. Embedded bars shrink the video in both modes and break edge-to-edge views such as PiP on iPad.
- Add an image, title and description via metadata only where it helps, without covering playback.
- Support expected input: Space plays or pauses on a keyboard on every platform; familiar Siri Remote gestures on Apple TV.
- In tvOS, add a transport control for playback actions such as favoriting, or a custom content tab for extra info or recommendations; keep each to one or two steps.
- Make other audio sources respect secondary-audio hints so audio never mixes, for example when a muted PiP video is unmuted over a game.
- TV app: show a black screen at once, matching the TV app's fade to black; it skips your launch screen.
- TV app: start the chosen content right away; if an interstitial is unavoidable, Select steps through it and Play skips it.
- TV app: resume automatically, at the previous end time for long videos.
- TV app: switch to the profile the request names; if none is named, ask the viewer to pick one before playback.
- TV app: show a loading screen only for loads over 2 seconds: black, centered spinner, minimal branding; start playback as soon as possible and keep loading in the background.
- TV app: on exit, show the item's detail view with a resume option, or a menu that lists it, or the main menu. Prepare that view right after playback starts.

**Avoid**
- A custom player that differs only slightly from the system one.
- Splash, detail or intro screens before TV app content.
- Asking whether to resume.

**Platform notes**
- **iOS, iPadOS, macOS:** No extra guidance.
- **tvOS:** Keep logos and noninteractive overlays small; prefer short, translucent SDR graphics over bright opaque ones, as some screens retain images.
- **tvOS:** For interactive overlays such as quizzes, pause playback with a minimum 0.5-second delay, then show the overlay with a clear way to dismiss and resume.
- **visionOS:** Let people start playback themselves, play in a small resizable window, and keep surroundings visible.
- **visionOS:** In full immersion, keep virtual content from covering the player and its controls ornament; never start fully immersive playback automatically.
- **visionOS:** For scrubbing, supply a thumbnail track with thumbnails 160 px wide (HLS trick play).
- **visionOS:** Keep inline video 2D and do not expand an inline player to fill its window; its controls sit in the window plane.
- **visionOS:** Use the RealityKit video player for splash or transition video, or video on custom surfaces; it handles 2D and 3D aspect ratios and captions.
- **watchOS:** The system manages playback; clips play in the foreground, inline or in a separate view. Keep clips to 30 seconds or less.
- **watchOS:** Do not scale clips. Make the poster image show the clip's content and not look like a system control.

| watchOS asset attribute | Value |
| --- | --- |
| Video codec | H.264 High Profile |
| Video bit rate | 160 kbps at up to 30 fps |
| Resolution, full screen | 208x260 px (portrait) |
| Resolution, 16:9 | 320x180 px (landscape) |
| Audio (movies and audio-only) | 64 kbps HE-AAC |

**APIs:** AVKit, `AVPlayerViewController`, `VideoPlayer`, `resizeAspectFill`, `resizeAspect`, `externalMetadata`, `silenceSecondaryAudioHintNotification`, RealityKit, HTTP Live Streaming

Last change: September 12, 2023 — recommended visionOS thumbnail width corrected.

## Printing
Source: https://developer.apple.com/design/human-interface-guidelines/printing

iOS, iPadOS, macOS and visionOS apps can add the system print feature, plus custom printer and document options where needed.

**Do**
- Put Print where people look: the File menu on macOS; a toolbar button that opens an action sheet on iOS and iPadOS.
- On a macOS toolbar, offer Print as an optional button people can add through customization.
- Dim Print in the macOS File menu, and remove it from the iOS/iPadOS action sheet, when nothing can print or no printer is available. Dim or hide a custom print button too.
- Show options such as page range, copies or two-sided printing in the system view, when the printer supports them.

**Platform notes**
- **tvOS, watchOS:** Not supported.
- **iOS, iPadOS, visionOS:** No extra guidance.
- **macOS:** Add a custom print-panel category, named for example after your app, for options the system lacks (Keynote adds presenter notes, backgrounds, skipped slides). Default categories include Layout, Paper Handling, Media & Quality.
- **macOS:** Use a page setup dialog for rarely changed per-document page size, orientation and scaling; do not rebuild system options such as orientation or reverse order.
- **macOS:** Make dependencies clear, for example transparencies unavailable with two-sided printing.
- **macOS:** Hide advanced settings behind a disclosure control labeled Advanced Options.
- **macOS:** Preview the effect of a setting, such as a thumbnail that updates with tone.
- **macOS:** Store changed print settings with the document, or at least until it closes.

**APIs:** `UIPrintInteractionController`, `NSDocument`

## Ratings and reviews
Source: https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews

People check ratings before downloading. A great experience earns good ratings; timing the request matters too, for example by launch count, features explored or tasks completed. People can always rate in the App Store.

**Do**
- Ask only after clear engagement, such as completing a level or a significant task.
- Ask at a natural break.
- Wait at least a week or two between requests, and ask again only after more engagement.
- Use the system prompt on iOS, iPadOS and macOS; it checks for earlier feedback and offers a rating plus an optional review.
- Weigh resetting the summary rating at a new version: current ratings, but fewer of them.

**Avoid**
- Asking on first launch or during onboarding.
- Interrupting a task or gameplay.
- Repeated requests.

**Specs**
- The system shows the prompt at most 3 times per app in 365 days; people can dismiss it with one tap or click, or opt out for all apps.

**Platform notes**
- No extra guidance for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

**APIs:** `RequestReviewAction`

Last change: September 12, 2023 — artwork added.

## Searching
Source: https://developer.apple.com/design/human-interface-guidelines/searching

People search across the system, within an app with a search field, and within a document. Personalize with recent searches, suggestions, completions and corrections; allow scoping or filtering by attributes such as date, size or type; offer find-in-page in iOS, iPadOS and macOS; index content for Spotlight.

**Do**
- Give important search a primary place: in a toolbar (Notes, bottom toolbar) or a dedicated tab (Photos, Apple TV).
- Offer one place to search everything; add local search only for clearly separate sections, where it filters the current view (Music).
- Show the current scope with placeholder text, a scope bar or a title, as Mail names the searched mailbox.
- Show recent searches before typing and predictive suggestions while typing.
- If you show search history, let people clear it.
- Index content and metadata for Spotlight.
- Supply a Spotlight file importer for custom file types.
- Use Spotlight for advanced in-app file search, for example a button that searches on the current selection and shows results in a custom view.
- Prefer the system open and save views; they include system-wide search.
- Provide a Quick Look generator for custom file types.

**Avoid**
- Showing search history where others might see it without considering privacy.

**Platform notes**
- No extra guidance for iOS, iPadOS, macOS, tvOS, visionOS or watchOS.

**APIs:** `searchSuggestions(_:)`, Core Spotlight, `CSImportExtension`, Quick Look

Last change: June 8, 2026 — terminology updated and best practices refined.

## Settings
Source: https://developer.apple.com/design/human-interface-guidelines/settings

The system Settings app covers global options and, on some platforms, per-app permissions and integrations. An app can add its own settings area for general options, and should put task options inside the task.

**Do**
- Choose defaults that suit most people, such as auto-tuning game performance to the device.
- Offer as few settings as possible.
- Open settings with Command-Comma in apps and Esc in games.
- Detect what you can, such as a connected controller or Dark Mode, instead of asking.
- Put general, rarely changed options in your settings area: window configuration, game saving, key mappings, account options.
- Put task options (show or hide parts, reorder, filter) in the screen they affect. In games, players adjust tactics in play.
- Add only the most rarely changed options to the system Settings app; consider a button that opens it.

**Avoid**
- Copies of system-wide settings such as accessibility, scrolling or authentication.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS:** No extra guidance.
- **macOS:** Put Settings in the App menu, not in a window toolbar; put document-level options in the File menu.
- **macOS:** The settings window uses a toolbar of panes; keep it noncustomizable, always visible, with the active pane marked.
- **macOS:** Dim the minimize and maximize buttons; the window sizes to the current pane.
- **macOS:** Title the window after the visible pane, or "App Name Settings" with one pane; reopen the last pane.
- **watchOS:** Apps cannot add to the system Settings app; put a few essential options at the bottom of the main view or in a More menu.

**APIs:** SwiftUI `Settings`, `UserDefaults`, Preference Panes

Last change: June 10, 2024 — guidance reorganized and game examples added.

## Undo and redo
Source: https://developer.apple.com/design/human-interface-guidelines/undo-and-redo

Undo and redo reverse recent actions and make experimentation safe. People often undo repeatedly without knowing what each step targets, so make outcomes predictable and visible.

**Do**
- Name the result: in the iPhone shake alert, and in menu labels such as Undo Typing or Redo Bold.
- Show the result, for example scroll to a restored paragraph that is off screen.
- Allow many undo steps, back to a logical point such as opening or saving the document.
- Consider undoing a batch of related changes at once, or everything since open or save.
- Rely on system triggers (Edit menu, keyboard shortcuts, shake); add undo and redo buttons only when needed, with system symbols, in a toolbar.

**Avoid**
- Arbitrary limits on undo steps.

**Platform notes**
- **tvOS, watchOS:** Not supported.
- **visionOS:** No extra guidance.
- **iOS, iPadOS:** Do not redefine the three-finger swipe or shake gestures.
- **iOS, iPadOS:** The alert title adds the prefix "Undo " or "Redo "; supply one or two words after it, such as "Undo Name".
- **macOS:** Put Undo and Redo at the top of the Edit menu, with Command-Z and Shift-Command-Z.

**APIs:** `UndoManager`

## Workouts
Source: https://developer.apple.com/design/human-interface-guidelines/workouts

Guidance for fitness experiences on Apple Watch, iPhone and iPad that track activity and show metrics with familiar components.

**Do**
- On watchOS, use workout sessions so the app stays on screen between wrist raises; show key data such as elapsed or remaining time, calories, distance; offer lap or interval controls.
- Follow the common three-screen layout of the Workout app: controls on the left (End, Resume, New, Segment), live metrics in the middle (time, active calories, heart rate, average pace, elevation), media playback on the right.
- Make an active session recognizable at a glance, with live values and a unique metrics layout.
- Make pause, resume and stop easy to find and tap; confirm clearly when a session starts or stops.
- When sensors fail, for example heart rate under water, explain what is still tracked (laps, distance, calories) in wording similar to the Workout app's, especially for Swimming and Other types.
- End with a summary screen of recorded data, ideally with Activity rings.
- Discard sessions that end a few seconds after starting, or ask whether to save them.
- For motion, use large fonts, high contrast and the most important data first.
- Use the Activity rings view only for its documented meaning.

**Avoid**
- Unrelated information during a workout, such as the workout list or other parts of the app.

**Platform notes**
- **macOS, tvOS, visionOS:** Not supported.
- **iOS, iPadOS, watchOS:** No extra guidance.

**APIs:** WorkoutKit, HealthKit workouts and activity rings
