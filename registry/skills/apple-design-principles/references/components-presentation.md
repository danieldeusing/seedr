# Components / Presentation

This file covers the components that present content or choices above or around the current view: action sheets, alerts, page controls, panels, popovers, scroll views, sheets and windows.

## Pages
- [Action sheets](#action-sheets): modal choices that follow an action people started
- [Alerts](#alerts): critical, actionable interruptions; title, text and button rules
- [Page controls](#page-controls): dot indicators for a flat, ordered list of pages
- [Panels](#panels): macOS floating windows for inspectors and supplementary controls, HUD style
- [Popovers](#popovers): transient views anchored to the control that opened them
- [Scroll views](#scroll-views): scrolling, indicators, scroll edge effects, Look to Scroll
- [Sheets](#sheets): scoped tasks over the parent view, buttons, detents, per platform
- [Windows](#windows): primary and auxiliary windows, macOS states, visionOS windows and volumes

## Action sheets
Source: https://developer.apple.com/design/human-interface-guidelines/action-sheets

An action sheet is a modal view with choices about an action that people started on purpose, such as delete or save a draft when they cancel a Mail message. In SwiftUI, a confirmation dialog gives this on all platforms.

**Do**
- Choose an action sheet, not an alert, when people started the action and need follow-up choices. Alerts report unexpected problems or changes.
- Keep the title to one line.
- Add a message only when the title and context do not explain the choices.
- Offer a Cancel button when an action can destroy data. Put it at the bottom (top-left corner on watchOS). A SwiftUI confirmation dialog adds Cancel by default.
- Give destructive buttons the destructive style and put them at the top, where people notice them.

**Avoid**
- Frequent action sheets; each one interrupts the task.

**Platform notes**
- **iOS, iPadOS:** Use an action sheet, not a menu, for choices that follow an action; people expect a menu only when they ask to reveal it. Keep the button count low enough that the sheet never scrolls; scrolling invites accidental taps.
- **macOS, tvOS:** No additional considerations.
- **visionOS:** Not supported.
- **watchOS:** The system style has a title, an optional message, a Cancel button and one or more other buttons; its look differs by device. Use at most four buttons including Cancel, so at most three other choices.

**Specs**

| Button style (watchOS) | Meaning |
| --- | --- |
| Default | No special meaning |
| Destructive | Destroys user data or does a destructive action |
| Cancel | Closes the view without any action |

**APIs:** `confirmationDialog(_:isPresented:titleVisibility:actions:)`, `ButtonRole.destructive`, `UIAlertController.Style.actionSheet`, `UIAlertAction.Style.destructive`

## Alerts
Source: https://developer.apple.com/design/human-interface-guidelines/alerts

An alert is a modal view with critical information people need at once: a problem, a warning before data loss, or a confirmation of a purchase or other important action they started. On every platform it is a centered modal; its look differs per platform.

**Do**
- Make every alert carry essential information and useful actions only.
- Show information without an action in context instead, for example a Mail-style status indicator people can choose for details.
- Alert before an uncommon destructive action that cannot be undone.
- Write copy that is direct, neutral and friendly; do not blame people or hide how serious the issue is.
- Write a title that says what happened, where and why, in at most two lines. A full sentence gets sentence case and end punctuation; a fragment gets title case and none.
- Add informative text only when it adds value: short, complete sentences, sentence case.
- Add a text field only when the input resolves the situation, such as a secure field for a password.
- Title buttons with one or two words, verbs that describe the result ("View All", "Reply", "Ignore"), title case, no end punctuation.
- Title the cancel button "Cancel", always.
- Put the most likely button, and always the default button, on the trailing side of a row or at the top of a stack. Put Cancel on the leading side or at the bottom.
- Use the destructive style only for a destructive action people did not choose on purpose. A deliberate Empty Trash keeps its button in normal style so Return confirms it.
- Include a Cancel button whenever a destructive action is present.
- Support other ways to cancel (see the table below).

**Avoid**
- Alerts for common, undoable actions, even destructive ones such as deleting an email or a file.
- Alerts at app launch. Show cached or placeholder data and a quiet label for startup problems such as no network.
- Empty titles like "Error" or "Error 329347 occurred".
- Explaining what the buttons do. If guidance is unavoidable, say "choose" and use the exact button title without quotes.
- "OK" except in purely informational alerts; never "Yes" and "No". Prefer specific titles like "Erase", "Convert", "Clear", "Delete".
- Making Cancel the default button. To make people read the alert, make no button the default. A single default button is "Done", not "Cancel".

**Platform notes**
- **iOS, iPadOS:** For choices about an action people started, use an action sheet. Keep titles short and messages brief so the alert does not scroll at large text sizes.
- **macOS:** The app icon appears by default; you can supply another icon or symbol. You can add a suppression checkbox for repeating alerts, an accessory view (`accessoryView`) and a Help button. Use a caution symbol such as `exclamationmark.triangle` rarely, only for unexpected data loss; not for save or empty-trash tasks whose purpose is to overwrite or remove.
- **visionOS:** In the Shared Space the alert sits in front of the window, slightly forward on the z-axis, and stays anchored to the window when people move it. In a Full Space it is centered in the field of view.
- **tvOS, watchOS:** No additional considerations.

**Specs**
- Content on all platforms: title, optional informative text, up to 3 buttons.
- Text field: iOS, iPadOS, macOS, visionOS. Icon and accessory view: macOS, visionOS. Suppression checkbox and Help button: macOS.
- visionOS accessory view: maximum height 154 pt, corner radius 16 pt.

| Other way to cancel | Platform |
| --- | --- |
| Exit to the Home Screen | iOS, iPadOS |
| Escape or Command-Period on an attached keyboard | iOS, iPadOS, macOS, visionOS |
| Menu on the remote | tvOS |

**APIs:** `alert(_:isPresented:actions:)`, `UIAlertController`, `NSAlert`

Last change: February 2, 2024 — guidance for default and Cancel buttons extended.

## Page controls
Source: https://developer.apple.com/design/human-interface-guidelines/page-controls

A page control is a row of indicators, one per page in a flat, ordered list. By default the indicators are equally spaced dots, a solid dot marks the current page, and dots that do not fit are clipped. It works for any number of pages, including lists people create.

**Do**
- Use it only for sequential pages. For hierarchy or nonsequential navigation, use a sidebar or a split view.
- Center it horizontally near the bottom of the view or window.
- Keep the count to about 10 dots or fewer. For more peer pages, use another layout, such as a grid.
- Keep custom indicator images simple; SF Symbols work well. Weather marks the current-location page with `location.fill`.
- Change the default indicator image only when it adds meaning, for example `bookmark.fill` when every page holds bookmarks.
- Let the system color the indicators.

**Avoid**
- Complex shapes, negative space, text or inner lines in indicator images; they blur at small sizes.
- More than two different indicator images in one control.
- Custom indicator colors; they reduce the contrast of the current-page indicator.

**Platform notes**
- **iOS, iPadOS:** The current indicator is highlighted, and indicators shrink at both ends when more pages exist than fit. People tap (discrete interaction) beside the current indicator to go to the next or previous page, or scrub (continuous interaction) to move in sequence; scrubbing past an edge jumps to the first or last page. iPadOS also allows the pointer to target one indicator. Animate the page transition only for taps, never during scrubbing. Background styles: automatic (shows only during interaction; use when the control is not primary navigation), prominent (always shows; only when it is the primary navigation), minimal (never shows; position only). Do not support scrubbing with the minimal style.
- **macOS:** Not supported.
- **tvOS:** Use page controls for collections of full-screen, content-rich peer pages, without other controls that compete for focus.
- **visionOS:** The control shows the pages and the current page, but people cannot interact with it.
- **watchOS:** It appears at the bottom for horizontal paging, or beside the Digital Crown for a vertical tab view, where it shows the position within the page and within the set. Prefer vertical paging with the Digital Crown over horizontal paging or deep hierarchy, give each page one purpose, and keep a page to one screen height where possible. Put variable-height pages after fixed-height pages.

**APIs:** `PageTabViewStyle`, `UIPageControl`, `preferredIndicatorImage`, `setIndicatorImage(_:forPage:)`, `UIPageControl.InteractionState`, `backgroundStyle`

Last change: June 21, 2023 — guidance for visionOS added.

## Panels
Source: https://developer.apple.com/design/human-interface-guidelines/panels

A panel is a macOS window that floats above other windows with supplementary controls, options or information for the active window or selection. It looks less prominent than a main window. On other platforms, use a modal view for this content.

**Do**
- Use a panel for quick access to controls or settings that affect the current selection.
- Use a panel for an inspector, which updates when the selection changes. A split view pane also works.
- Prefer direct controls such as sliders and steppers.
- Give the panel a title bar and a short noun title in title case ("Fonts", "Colors", "Inspector").
- Bring all open panels to the front when the app becomes active; hide them all when it is inactive.
- Name panels by title in menus without the word "panel" ("Show Fonts", "Show Inspector"). In help, use the title, or add "window" when it helps ("Fonts window").

**Avoid**
- A panel for an Info window, whose contents stay fixed when the selection changes; use a regular window.
- Controls that need typing or selecting items to act on.
- Listing panels in the Window menu's document list; show and hide commands there are fine.
- A minimize button on a panel.

**HUD-style panels**
- A HUD panel is dark and translucent; it suits media editing and immersive views (QuickTime Player's inspector).
- Prefer standard panels. Use a HUD only in a media app for movies, photos or slides, when a standard panel would hide essential content, or when it needs no controls; most system controls except the disclosure triangle do not match a HUD.
- Keep one panel style across modes, for example in and out of full screen.
- Use color rarely; small high-contrast accents only.
- Keep HUDs small; never cover the content they adjust or compete with it.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `NSPanel`, `hudWindow`

## Popovers
Source: https://developer.apple.com/design/human-interface-guidelines/popovers

A popover is a transient view that appears above content when people click or tap a control or area. Use it for a small amount of information or a few related tasks, such as changing an event's time in Calendar.

**Do**
- Use a popover for content needed only briefly, instead of a space-consuming sidebar or panel.
- Point the arrow as directly as possible at the element that opened it, and leave that element and essential content uncovered.
- Add Close, Cancel or Done only when it clarifies, such as leaving with or without saving. Otherwise close on a tap outside or on a selection.
- Keep the popover open for multiple selections until people dismiss it or tap outside.
- Save work when a nonmodal popover closes automatically; discard only on an explicit Cancel.
- Close the open popover before showing a new one; let one click or tap do both.
- Size it to its content and its arrow.
- Animate a size change so it does not look like a new popover.
- In help text, refer to the task or control, not to "the popover".

**Avoid**
- More than one popover at a time, and popovers that open from other popovers.
- Any view over a popover, except an alert.
- Warnings in a popover; use an alert.

**Platform notes**
- **iOS, iPadOS:** Avoid popovers in compact views. Adapt to the size class and use a full-screen modal such as a sheet there.
- **macOS:** A popover can be detachable; dragging turns it into a panel that stays visible. Consider allowing it, and keep the detached panel's look close to the popover.
- **visionOS:** No additional considerations.
- **tvOS, watchOS:** Not supported.

**APIs:** `popover(isPresented:attachmentAnchor:arrowEdge:content:)`, `UIPopoverPresentationController`, `NSPopover`

## Scroll views
Source: https://developer.apple.com/design/human-interface-guidelines/scroll-views

A scroll view moves content larger than its bounds vertically or horizontally. It has no look of its own, apart from a translucent scroll indicator that usually appears during scrolling and shows where the visible content lies.

**Do**
- Support the system scroll gestures and keyboard shortcuts. Custom scrolling must keep the elastic indicator behavior.
- Show that more content exists, for example with partial content at the view's edge.
- Consider paging by a fixed amount, usually the view's height or width, minus an overlap such as a line of text (`PagingScrollTargetBehavior`).
- Scroll automatically, and only as far as needed, when: a selection or insertion point lands out of view (search results); people type at an insertion point that is off screen; the pointer passes the edge during a selection; people act on a selection they scrolled away from.
- Set sensible minimum and maximum zoom scales.

**Avoid**
- A scroll view inside another with the same orientation. Mixed orientations are fine.

**Scroll edge effects** (iOS, iPadOS, macOS)
- The effect separates floating elements such as toolbars from content scrolling behind them; it is not decoration and does not darken or block like an overlay.
- Prefer the automatic style; it gives more opaque separation for crowded top toolbars, text outside Liquid Glass controls and pinned table headers. The other styles are hard and soft; test soft carefully for legibility.
- Use it only when a scroll view is behind floating elements. With custom bars, add it yourself when the top layer needs clarity.
- Use one effect per view; in iPad and Mac split views each pane can have one, at a consistent height.

**Platform notes**
- **iOS, iPadOS:** In paging mode, consider a page control (as in Weather), and then hide the scroll indicator on that axis.
- **macOS:** The indicator is called a scroll bar. In tight panels, small or mini scroll bars are fine; use the same size for every control in that panel.
- **tvOS:** No scroll indicators; the system scrolls to keep the focused item visible.
- **visionOS:** The indicator is small and fixed in size, slightly thicker than in iOS, vertically centered at the trailing edge for vertical scrolling and horizontally centered at the bottom for horizontal scrolling. Looking at it and dragging starts a jog bar that controls scroll speed, with tick marks as feedback. Increase tight margins so it does not overlap content.
  - Look to Scroll lets people scroll by looking near the view's edges. It is off by default; add it per scroll view to reading and browsing views.
  - Do not add Look to Scroll to secondary content, controls or dense information needing precise scrolling (Notes supports it in the note, not the note list).
  - Support it in all similar views once you support it in one.
  - Make such views full width or full height of the window, or give inset views clear boundaries.
  - Remove custom scroll-driven effects, such as parallax, before you add it.
- **watchOS:** Prefer vertical scrolling with the Digital Crown. Use vertical tab views for paging; a page indicator beside the Digital Crown shows position and expands into a scroll indicator for long pages. Keep pages to one screen height where possible, and put variable-height pages after fixed-height ones.

**APIs:** `ScrollView`, `PagingScrollTargetBehavior`, `ScrollEdgeEffectStyle`, `ScrollInputKind`, `look`, `UIScrollView`, `UIScrollEdgeEffect.Style`, `NSScrollView`, `NSScrollEdgeEffectStyle`, `WKPageOrientation`

Last change: June 8, 2026 — guidance for scroll edge effects updated.

## Sheets
Source: https://developer.apple.com/design/human-interface-guidelines/sheets

A sheet holds a scoped task close to the current context, such as attaching a file or choosing a save location, after which people return to the parent view. It is always modal in macOS, tvOS, visionOS and watchOS; in iOS and iPadOS it can also be nonmodal, like the Notes format sheet that edits the note behind it.

Common buttons: Cancel (or Close) closes without saving; Done closes after the task or an explicit save; Back goes to a previous step or parent view and never closes the sheet.

**Do**
- Use alternatives for complex or long flows: a full-screen modal in iOS and iPadOS (`UIModalPresentationStyle.fullScreen`), a new window or full screen in macOS, a Full Space in visionOS.
- Show one sheet at a time. Close the first sheet before opening the next; reopen the first afterwards if needed.
- For supplementary items that affect the parent view, use a nonmodal sheet in iOS and iPadOS, a panel in macOS, a split view in visionOS.
- Pair a Done button with Cancel, or with Back in a later step.

**Avoid**
- A Done button alone (the incorrect example shows only Done at top right).
- Cancel, Done and Back together.

**Platform notes**
- **iOS, iPadOS:** In a single-view sheet, put Cancel at the leading edge of the top toolbar and Done at the trailing edge. In a multi-step flow: first step Cancel leading and Done (inactive) trailing; later steps Back leading and Done inactive; final step Back and an active Done.
  - A resizable sheet rests at detents: large (fully expanded) and medium (about half of it), plus optional custom detents. Large is supported automatically; adding medium lets it rest at both; medium alone stops full expansion.
  - On iPhone, consider the medium detent for progressive disclosure (the share sheet); skip it when content needs full height (Mail and Messages compose).
  - Show a grabber on resizable sheets; people drag it or tap it to cycle detents, and it works with VoiceOver (`prefersGrabberVisible`).
  - Support swipe down to dismiss; with unsaved changes, confirm with an action sheet.
  - On iPad, prefer the page or form sheet styles, which center a default-size sheet over a dimmed background.
- **macOS:** A sheet is a rounded card on its dimmed parent window. Give it a fitting default size and allow resizing where expanding helps. Bring the parent window (and its document panels) to the front, but let people use other app windows before they dismiss the sheet. Use a panel instead when people give input repeatedly and check results, such as find and replace.
- **visionOS:** The sheet floats in front of its dimmed parent window and takes the interactions. Center it in the field of view rather than sliding it from the window's bottom edge. Do not cover most of the window by default; resizing is fine.
- **tvOS:** No additional considerations.
- **watchOS:** A full-screen, semitransparent sheet slides over content and blurs and desaturates it. Use it only when the task needs a custom title or custom content; otherwise use an alert or action sheet. Keep it brief and rare, never for navigation. If you change the default Cancel label, use an SF Symbol; avoid a custom Back button or text that looks like a page title.

**APIs:** `sheet(item:onDismiss:content:)`, `UISheetPresentationController`, `detents`, `prefersGrabberVisible`, `UIModalPresentationStyle`, `presentAsSheet(_:)`

Last change: March 24, 2026 — guidance for button placement updated.

## Windows
Source: https://developer.apple.com/design/human-interface-guidelines/windows

A window holds an app's views and separates them from the rest of the system, with system frames and controls to open, close, resize and move it. A primary window carries the main navigation and content; an auxiliary window holds one task, allows no navigation elsewhere and usually has a close button.

**Do**
- Make windows adapt fluidly to any size, for multitasking and multiple windows.
- Open a new window only when it helps, such as Mail's Compose next to the message.
- Offer "open in new window" through a context menu or the File menu (`OpenWindowAction`).
- Say "window" in user-facing text, for every type.

**Avoid**
- New windows as default behavior when they add no value.
- Custom window frames or controls, and imitations of the system ones.
- Words such as "scene" in user-facing text.

**Platform notes**
- **iPadOS:** People choose full screen (switch windows with the app switcher) or windowed (free resizing, several windows, size and position remembered) in Multitasking & Gestures settings. Windowed apps get window controls at the leading edge of the toolbar; move leading toolbar buttons inward when the controls appear. Consider a gesture, such as pinch in Notes, to open content in a new window. To show a single file you can skip your own window, but the app must support multiple windows (`QLPreviewSceneActivationConfiguration`).
- **macOS:** A window has a frame (window controls, toolbar, rarely a bottom bar) and a body; people drag the frame to move it and the edges to resize it.
  - States: main (frontmost, one per app), key (takes input, one onscreen; may be a panel), inactive (in the background). The key window has colored close, minimize and zoom controls; others are gray. Inactive windows lose vibrancy and look farther away.
  - Some panels, such as Colors or Fonts, become key only when people click the title bar or a text field.
  - Make custom windows follow the system state appearances; system components update automatically.
  - Keep critical information and actions out of a bottom bar, because windows are often moved so the bottom is hidden. Use it only for a little information about the content or selection (the Finder status bar: item count, selection count, free space). For more, use an inspector at the trailing side of a split view.
- **visionOS:** Two main styles: a window and a volume (volumetric window); both show 2D and 3D content in the Shared Space and Full Space. The plain style is a window without the glass background. The system places the first window; people can move it.
  - A window is an upright plane with a glass background, close button, window bar and resize controls; it may add a Share button, tab bar, toolbar and ornaments, and uses dynamic scale by default.
  - Use a window for familiar UI and tasks; use a volume for bounded 3D content such as a game board.
  - Keep the glass background; removing it hurts legibility, and an opaque one hides the surroundings.
  - Choose an initial size and shape that fit the content with little empty space (wide for Keynote, tall for Safari).
  - Set a minimum and maximum size for each window so the layout never breaks.
  - Keep 3D content in a window shallow; the system clips deep content. Use a volume for depth.
  - A volume can be viewed from any angle; its close button and window bar turn to face the viewer.
  - Place 2D content in a volume so it works from all angles; pin it to 3D content with attachments.
  - Prefer dynamic scaling in volumes; use fixed scaling (the default) for real-world objects such as retail products.
  - From visionOS 2 the baseplate glows at its border when people look at it; keep it when content does not fill the volume, and turn it off for full-bleed content or a custom baseplate.
  - From visionOS 2 a volume can have an ornament next to the toolbar and tab bar; anchor it (`topBack`, `bottomFront`), never on the same edge as the toolbar or tab bar, and prefer one extra ornament at most.
  - Keep the baseplate parallel to the floor for content with little interaction; tilt it with the gaze to keep content usable, even when people recline.
- **iOS, tvOS, watchOS:** Not supported.

**Specs**
- visionOS default window: 1280 × 720 pt, placed about 2 m in front of the wearer, with an apparent width of about 3 m.

**APIs:** `Windows`, `WindowGroup`, `OpenWindowAction`, `DefaultWindowStyle`, `PlainWindowStyle`, `VolumetricWindowStyle`, `ornament(visibility:attachmentAnchor:contentAlignment:ornament:)`, `UIWindow`, `UIWindowScene.ActivationInteraction`, `collectionView(_:sceneActivationConfigurationForItemAt:point:)`, `QLPreviewSceneActivationConfiguration`, `NSWindow`

Last change: June 9, 2025 — best practices added and guidance for resizable windows in iPadOS updated.
