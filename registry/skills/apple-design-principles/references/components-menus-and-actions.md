# Components / Menus and actions

This file covers the components that start actions or offer commands: buttons, menus of every kind, share sheets, ornaments and toolbars.

## Pages
- [Activity views](#activity-views): share sheets, custom activities, share and action extensions
- [Buttons](#buttons): styles, content, roles, hit targets and per-platform button types
- [Context menus](#context-menus): item-specific commands revealed by long press or secondary click
- [Dock menus](#dock-menus): custom items in a Mac app's Dock icon menu
- [Edit menus](#edit-menus): Copy, Paste and related commands on selected content
- [Home Screen quick actions](#home-screen-quick-actions): up to four app actions from the app icon
- [Menus](#menus): labels, icons, grouping, submenus, toggled items, layouts
- [Ornaments](#ornaments): visionOS controls floating in front of a window edge
- [Pop-up buttons](#pop-up-buttons): menus of mutually exclusive options with a shown selection
- [Pull-down buttons](#pull-down-buttons): menus of actions tied to one button's purpose
- [The menu bar](#the-menu-bar): standard menus, their items and order, menu bar extras
- [Toolbars](#toolbars): titles, navigation, actions and item groups at window edges

## Activity views
Source: https://developer.apple.com/design/human-interface-guidelines/activity-views

An activity view (share sheet) lists sharing targets, actions such as Copy and Print, and frequent apps for the current context. It opens from the Share button as a sheet or popover; app-specific actions appear before system-wide ones.

**Do**
- Give an app action that resembles a system one a distinct title, such as "Print Transaction".
- Use an SF Symbol for a custom activity; center a custom icon in about 70x70 px.
- Title custom actions with one verb or a short verb phrase; long titles wrap and truncate.
- Exclude system activities that make no sense in your app (for example Print); choose which custom ones show at a time.
- Open the activity view from the Share button only.
- For a share extension, prefer the system composition view; for an action extension, include the app name and elements of your app's UI.
- Keep extensions to a few steps, ideally one tap to post.
- For an action extension, use a symbol or interface icon that names the task; a share extension gets the app icon automatically.
- Continue long tasks in the background and show status in the main app.

**Avoid**
- Duplicating system actions such as Print.
- Company or product names in action titles (share activities show the company name under the icon).
- Modal views over an extension, except an alert.
- Notifications only to say a task finished; notify only about problems.

**Platform notes**
- **iOS, iPadOS:** Share and action extensions appear in the share sheet.
- **macOS:** Not supported. Extensions still work: share through a toolbar Share button or the context menu Share item; actions on hover over embedded content, a toolbar button or a Finder quick action.
- **visionOS:** No additional considerations.
- **tvOS, watchOS:** Not supported.

**APIs:** `UIActivityViewController`, `UIActivity`, App Extension Support

## Buttons
Source: https://developer.apple.com/design/human-interface-guidelines/buttons

A button starts an immediate action. It combines a style (size, color, shape), content (symbol, text or both) and a role (normal, primary, cancel, destructive).

**Do**
- Leave space around each button so it stands out and is easy to hit.
- Give every custom button a pressed state.
- Use a prominent (accent-filled) style for the most likely action; at most one or two per view.
- Mark the preferred option of a set by style, keeping all options the same size.
- Use familiar symbols for familiar actions (`square.and.arrow.up` for share).
- Use text when it is clearer: a few words, title-style capitalization, often starting with a verb ("Add to Cart").
- Give the primary role to the most likely button; it answers Return and can close a sheet, editable view or alert.
- iOS, iPadOS: show an activity indicator inside a button for slow actions, optionally with a new label ("Checking out…").

**Avoid**
- Different sizes for options in one set.
- Button label colors close to bright content-layer colors; keep the default monochrome labels.
- The primary role on a destructive button, even when it is the likely choice.

**Platform notes**
- **macOS:** Hover shows a tooltip (also visionOS).
- **macOS push buttons:** The standard type, with text, symbol, icon or image; can be default and tinted. Use flexible-height only for two-line text or tall icons. Add a trailing ellipsis when the button opens another window, view or app. Consider spring loading (force click while dragging on Magic Trackpad).
- **macOS square (gradient) buttons:** Act on a view, such as adding or removing table rows. Put them in or under the view, not in toolbars or status bars. Use symbols, not text, and no introducing label.
- **macOS help buttons:** Use the system round question-mark button; open the help topic for the context or the top of the help. At most one per window, inside a view, without an introducing label. Placement is in the table below.
- **macOS image buttons:** Put them in a view, not the window frame (use a toolbar item there). Leave about 10 px padding between image and button edge; avoid a system border; place any label below.
- **visionOS:** Buttons have a visible background and play sounds; no haptics, so use standard controls. Shapes: circle for icon only, rounded rectangle or capsule for text, capsule for icon plus text. Four visual states; no custom hover effects. Text buttons rarely need a gaze tooltip.
- **visionOS:** Prefer a shape with a contrasting fill, except in toolbars, context menus, alerts and ornaments. Use `thin` material on a glass window and glass material when floating in space.
- **visionOS:** Never use a white fill with black content; it means toggled on. Prefer circle or capsule; use a capsule for a lone button. Use rounded rectangles in vertical stacks and capsules in horizontal rows. Avoid rows or stacks of small or mini buttons.
- **watchOS:** Inline buttons are capsules with a contrasting material. Put corner buttons in a toolbar (Liquid Glass; time and title move). Use full-width buttons for primary actions; side-by-side buttons share one height. Use toolbar buttons for navigation or contextual actions. Keep one- and two-line text buttons the same height in stacks.
- **tvOS:** No additional considerations.

**Specs**
- Minimum hit region: 44x44 pt; visionOS 60x60 pt.
- visionOS spacing: centers at least 60 pt apart; add 4 pt padding around buttons of 60 pt or larger.

| visionOS shape | Mini 28 pt | Small 32 pt | Regular 44 pt | Large 52 pt | Extra large 64 pt |
| --- | --- | --- | --- | --- | --- |
| Circular | Yes | Yes | Yes | Yes | Yes |
| Capsule, text only | — | Yes | Yes | Yes | — |
| Capsule, text and icon | — | — | Yes | Yes | — |
| Rounded rectangle | — | Yes | Yes | Yes | — |

| macOS view | Help button location |
| --- | --- |
| Dialog with dismissal buttons (OK, Cancel) | Lower corner opposite them, aligned vertically with them |
| Dialog without dismissal buttons | Lower-left or lower-right corner |
| Settings window or pane | Lower-left or lower-right corner |

**APIs:** `Button`, `UIButton`, `NSButton`, `NSButton.BezelStyle.flexiblePush`, `NSButton.BezelStyle.smallSquare`, `isBordered`, `ButtonBorderShape` (`circle`, `roundedRectangle`, `capsule`), `Material.thin`

Last change: December 16, 2025 — guidance updated for Liquid Glass.

## Context menus
Source: https://developer.apple.com/design/human-interface-guidelines/context-menus

A context menu gives quick access to commands for one item. It is hidden until revealed by touch or pinch and hold, Control-click or secondary click.

**Do**
- Include only the commands most relevant to the item, not advanced or rare ones.
- Keep it short; use separators for at most about three groups.
- Offer context menus consistently across the app.
- Make every context-menu command also available in the main UI (toolbar, menu bar).
- Keep submenus to one level and give them predictive titles.
- Hide unavailable items; in macOS, Cut, Copy and Paste may show dimmed.
- Put the most used items nearest the finger or pointer; reverse order when the menu opens above.
- iOS, iPadOS, visionOS: put destructive items (Delete, Remove) last and mark them destructive (red).
- Add a title only when it clarifies scope, such as the number of selected messages.
- Use the system icons for common actions (Copy, Share, Delete).

**Avoid**
- Dimming unavailable items as in a regular menu.
- Showing keyboard shortcuts; they belong in the main menus.

**Platform notes**
- **iOS, iPadOS:** Offer a context menu or an edit menu for an item, not both. In iPadOS, consider a context menu for creating objects in empty space (Files new folder). Prefer a graphical preview of the target; match its clipping path to the preview shape so corners stay stable during the animation.
- **macOS:** Also called a contextual menu.
- **visionOS:** Prefer a context menu to a panel or inspector window for frequent functions. Keep it no taller than the window, or it covers system controls above and below. Specialist apps may have longer menus than simple ones.
- **tvOS:** No additional considerations.
- **watchOS:** Not supported.

**APIs:** `contextMenu(menuItems:)`, `UIContextMenuInteraction`, `UIContextMenuInteractionDelegate`, `UIMenuElement.Attributes.destructive`, `popUpContextMenu(_:with:for:)`

Last change: December 5, 2023 — guidance added on hiding unavailable items.

## Dock menus
Source: https://developer.apple.com/design/human-interface-guidelines/dock-menus

A Dock menu opens on secondary click of a Mac app's Dock icon and mixes system items with custom ones. iOS and iPadOS use Home Screen quick actions instead.

**Do**
- Label and group items as for any menu.
- Offer every custom Dock item elsewhere too, such as in the menu bar.
- Choose high-value items: open or recent windows and actions useful when the app is not frontmost or has no windows (Mail: get new mail, new message).

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `applicationDockMenu(_:)`

## Edit menus
Source: https://developer.apple.com/design/human-interface-guidelines/edit-menus

An edit menu offers editing commands (Copy, Select, Translate, Look Up) for selected text, images, files or objects. The system can add data-specific items, such as directions for an address.

**Do**
- Use the system edit menu; see `UIResponderStandardEditActions` for its commands.
- Reveal it with system gestures: touch and hold, pinch and hold, secondary click.
- Show only commands that apply; no Copy or Cut without a selection, no Paste with an empty pasteboard.
- Place custom commands next to related system ones, and add few.
- Let people copy noneditable content text, but not control labels.
- Support undo and redo; edit commands run without confirmation.
- Keep Delete (same as the Delete key) distinct from Cut (copies to the pasteboard first).
- Label custom commands with short verbs or verb phrases.

**Avoid**
- A custom menu that repeats the standard commands.
- Custom gestures for standard editing.
- Extra controls that duplicate edit-menu commands.

**Platform notes**
- **iOS:** A compact horizontal bar appears on touch and hold or double-tap; a trailing chevron expands it into a context menu.
- **iPadOS:** Touch gives the compact bar; keyboard or pointer opens a vertical context menu. Make the menu work in both styles.
- **iOS, iPadOS:** The menu sits above or below the selection with a pointer. You cannot change its shape, but you may move it off important content.
- **macOS:** Edit commands appear in a context menu and in the menu bar's Edit menu (order in [The menu bar](#the-menu-bar)).
- **visionOS:** Pinch and hold opens a horizontal bar, or the menu opens as a context menu.
- **tvOS, watchOS:** Not supported.

**APIs:** `UIEditMenuInteraction`, `UIResponderStandardEditActions`, `NSMenu`

Last change: June 21, 2023 — visionOS guidance added.

## Home Screen quick actions
Source: https://developer.apple.com/design/human-interface-guidelines/home-screen-quick-actions

Quick actions are app-specific commands in the menu that opens on touch and hold (or 3D Touch press) of an app icon. Each has a title, an interface icon and an optional subtitle, and can update dynamically.

**Do**
- Offer high-value tasks; people expect at least one.
- Change dynamic actions predictably, for example by location, recent activity, time or settings.
- Write titles that state the result ("Directions Home", "New Message"); add a subtitle only for context (Mail unread counts).
- Keep text short and plan for localization.
- Use SF Symbols, or the Quick Action Icon Template from Apple Design Resources for a custom icon.

**Avoid**
- The app name or extra words in titles and subtitles.
- Emoji instead of a symbol; quick-action icons are monochrome and adapt to Dark Mode.

**Platform notes**
- **iOS, iPadOS:** No additional considerations.
- **macOS, tvOS, visionOS, watchOS:** Not supported.

**Specs**
- Maximum four app quick actions; the system adds items to remove the app and edit the Home Screen.
- The icon sits left or right depending on the app's position; titles are always left-aligned in left-to-right languages.

**APIs:** Add Home Screen quick actions (UIKit)

## Menus
Source: https://developer.apple.com/design/human-interface-guidelines/menus

A menu shows its items on interaction and saves space; each item is a command, option or state. These rules apply to all menu types.

**Do**
- Label action items with a clear verb or verb phrase (View, Close, Select).
- Use title-style capitalization; games may follow their own voice.
- Drop articles: "View Settings", not "View the Settings".
- Dim unavailable items; keep a menu openable even when all its items are unavailable.
- Add an ellipsis (…) when the item needs more input before it completes.
- Show keyboard shortcuts in app menus; games rarely do.
- Use standard icons for common actions (Share, Print, Search).
- Use icons sparingly: for key actions, locations, devices, visual concepts (rotate, flip) and user content. Give all items of a group icons, or none.
- List important items first; group related items with separators; keep related commands together even when used less (Paste and Match Style with Paste).
- Split long menus or use a submenu; long dynamic menus (History, Bookmarks) may scroll.
- Use a submenu when a term repeats in more than two items of a group, and name the item with that term ("Sort by").
- Keep submenus one level deep; above about five items, make a new menu.
- Keep a submenu openable when all its items are unavailable.
- For toggles, use a label that changes with state (Show Map / Hide Map); add a verb if unclear (Turn HDR On).
- Show both items when seeing both states helps; dim the one that does not apply.
- Mark active attributes with a checkmark; offer one item to clear several (Plain).
- In games, navigate menus with the platform's normal input, and resize targets and text so menus stay readable on small screens.

**Avoid**
- Icons that do not clearly represent the item.
- Indenting items instead of using a submenu.

**Platform notes**
- **iOS, iPadOS:** Three layouts. Small: a top row of four icon-only items, then a list. Medium: a top row of three items with icon and short label, then a list. Large (default): a plain list. Use medium for three frequent actions (Notes: Scan, Lock, Pin); use small only for a tight set such as Bold, Italic, Underline, Strikethrough.
- **visionOS:** Small and large layouts are available; menus may extend outside the window, as in macOS. Show a menu near what it controls.
- **visionOS:** For menus over 3D content, prefer the subtle breakthrough effect (the default for `automatic`). Use prominent only when necessary; it can disrupt or cause discomfort. `none` lets content hide the menu.
- **macOS, tvOS, watchOS:** No additional considerations.

**APIs:** `Menu`, Menus and shortcuts (UIKit), Menus (AppKit), `preferredElementSize`, `presentationBreakthroughEffect(_:)`

Last change: June 8, 2026 — menu item icon guidance updated.

## Ornaments
Source: https://developer.apple.com/design/human-interface-guidelines/ornaments

In visionOS, an ornament holds controls or information for a window on a plane slightly in front of it. It moves with the window, does not scroll with content, and can sit on any edge.

**Do**
- Use an ornament for frequently needed controls in a fixed place (Music Now Playing).
- Keep ornaments visible; hide them only during immersive viewing such as video or photos.
- Limit the number of ornaments to keep the window balanced; move elements into the window when you remove one.
- Keep an ornament as wide as the window or narrower, so it does not clash with a side tab bar.
- Use borderless buttons on the glass background; the system adds the hover effect.
- Use the system toolbar and tab bar, which already appear as ornaments; build custom ornaments only for custom components.

**Platform notes**
- **iOS, iPadOS, macOS, tvOS, watchOS:** Not supported.

**APIs:** `ornament(visibility:attachmentAnchor:contentAlignment:ornament:)`, Toolbars, `TabView`

Last change: February 2, 2024 — guidance added on multiple ornaments.

## Pop-up buttons
Source: https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons

A pop-up button opens a menu of mutually exclusive options; after a choice the menu closes and the button can show the selection (Calendar Repeat).

**Do**
- Use it for a flat list of exclusive options or states.
- Use a pull-down button instead for actions, multiple selection or submenus.
- Set a default that most people want.
- Make the options predictable from an introductory label or the button label.
- Use it when space is tight and the options need not stay visible.
- Add a Custom option for rare needs, and explanatory text below the list if useful.

**Platform notes**
- **iPadOS:** In a popover or modal view, consider a pop-up button instead of a disclosure indicator for a small, fixed set of options on a list item.
- **iOS, macOS, visionOS:** No additional considerations.
- **tvOS, watchOS:** Not supported.

**APIs:** `MenuPickerStyle`, `changesSelectionAsPrimaryAction`, `NSPopUpButton`

Last change: October 24, 2023 — artwork added.

## Pull-down buttons
Source: https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons

A pull-down button opens a menu of actions or items tied to the button's purpose, such as what to add, what to sort by or where to go back to. Choosing an item closes the menu and runs the action.

**Do**
- Use it for commands that refine the button's action; use a pop-up button for exclusive non-command choices.
- List at least three items; for one or two, use buttons, toggles or switches.
- Add a short menu title only when it adds meaning.
- Mark destructive items (shown in red) and confirm with an action sheet (iOS) or popover (iPadOS).
- Add an icon after a label when it clarifies the item; SF Symbols stay aligned with text at every scale.

**Avoid**
- Putting all of a view's actions, including primary ones, in one pull-down button.
- Menus so long that finding an item slows people down.

**Platform notes**
- **iOS, iPadOS:** A gesture on a button can also open a pull-down menu (Safari Tabs touch and hold). A More button saves space but hurts discoverability; weigh both.
- **macOS, visionOS:** No additional considerations.
- **tvOS, watchOS:** Not supported.

**APIs:** `MenuPickerStyle`, `showsMenuAsPrimaryAction`, `pullsDown`

Last change: September 14, 2022 — menu length guidance refined.

## The menu bar
Source: https://developer.apple.com/design/human-interface-guidelines/the-menu-bar

The menu bar at the top of a Mac or iPad screen holds the app's top-level menus. iPadOS uses the same order, items and shortcut patterns as macOS.

**Do**
- Keep the system menus and this order: *AppName*, File, Edit, Format, View, app-specific menus, Window, Help. macOS adds the Apple menu at the leading end and menu bar extras at the trailing end.
- Always show the same items; disable rather than hide unavailable ones.
- Use the system icons for common actions.
- Support the standard shortcuts of standard items (Copy, Cut, Paste, Save, Print); add custom shortcuts only when needed.
- Prefer one-word menu titles; use title-style capitalization for longer ones.
- App menu: put About first, alone in its group.
- File menu: rename or remove it if the app handles no files.
- Edit menu: move Find items to File when search targets files or objects.
- View menu: provide one even for a single function (Enter/Exit Full Screen). Make show/hide titles reflect the current state.
- Put every custom command in an app-specific menu, even when it exists elsewhere; this gives shortcuts and Full Keyboard Access.
- Order app-specific menus by app hierarchy (Mail: Mailbox, Message, Format) and from general to specialized.
- Window menu: provide one even with one window; keep Minimize and Zoom. Consider items to show and hide panels (not font or color, which Format covers).
- Help menu: separate extra items (registration, release notes) from the main help and keep the list short.
- Dynamic items (changed by Option and other modifiers): offer them only as shortcuts to tasks people can do another way.
- Put dynamic items only in menu bar menus, and reveal each with a single modifier key.

**Avoid**
- Version numbers in About; app names over 16 characters.
- File paths in Open Recent; Save As, Export, Copy To or Save To where Duplicate fits.
- Erase or Clear instead of Delete.
- Zoom for full screen.
- Listing panels or modal views among open windows.

**App menu**

| Item | Notes |
| --- | --- |
| About *AppName* | About window with copyright and version; short name of 16 characters or fewer, no version |
| Settings… | App-level settings only (document settings go in File); in iPadOS opens the app's page in Settings |
| App-specific items | Configuration items after Settings, in the same group |
| Services | macOS only; submenu of context services |
| Hide *AppName* | macOS only; same short name |
| Hide Others, Show All | macOS only |
| Quit *AppName* | Option turns it into Quit and Keep Windows |

**File menu**

| Item | Notes |
| --- | --- |
| New *Item* | Name the item type (Calendar: Event, Calendar) |
| Open | Ellipsis when a picker follows |
| Open Recent | Submenu, most recent first, recognizable names, Clear Menu |
| Close | Option: Close All; tab windows get Close Tab, consider Close Window |
| Close Tab | Option: Close Other Tabs |
| Close File | For apps with several views of one file |
| Save | Autosave regularly; ask name and location for new documents; choose formats by pop-up in the Save sheet |
| Save All | All open documents |
| Duplicate | Option: Save As |
| Rename…, Move To… | Rename or relocate the document |
| Export As… | Only for formats the app does not normally handle; the export does not open |
| Revert To | With autosave: recent versions and the version browser |
| Page Setup… | Per-document print settings; global or frequent ones belong in Print |
| Print… | Standard Print panel |

**Edit menu:** Undo and Redo (name the target, such as "Undo Typing"), Cut, Copy, Paste, Paste and Match Style, Delete (does not use the pasteboard), Select All, then submenus Find, Spelling and Grammar, Substitutions, Transformations, Speech. The system appends Start Dictation and Emoji & Symbols.

**Format menu:** Font (Show Fonts, Bold, Italic, Underline, Bigger, Smaller, Show Colors, Copy Style, Paste Style) and Text (alignments, Writing Direction, ruler items). Omit it without formatted text.

**View menu:** Show/Hide Tab Bar, Show All Tabs/Exit Tab Overview, Show/Hide Toolbar, Customize Toolbar, Show/Hide Sidebar, Enter/Exit Full Screen. It never manages specific windows.

**Window menu:** Minimize (Option: Minimize All), Zoom (Option: Zoom All), Show Previous Tab, Show Next Tab, Move Tab to New Window, Merge All Windows, Enter/Exit Full Screen (only without a View menu), Bring All to Front (Option: Arrange in Front), then open windows alphabetically. It never closes or styles windows.

**Help menu:** Send *AppName* Feedback to Apple, *AppName* Help (Help Viewer for Help Book content, which also adds a search field), then additional items after a separator.

**Platform notes**
- **iPadOS:** The menu bar appears when people move the pointer to the top edge or swipe down, in the status bar's space.
- **iPadOS:** Make every function reachable in the UI too. Dynamic items need a hardware keyboard. Do not use the menu bar as a catch-all.
- **iPadOS:** Settings opens the app's page in iPadOS Settings; link internal preferences in a separate item below it. Add tabs as View menu items with key bindings. Use submenus more often; rows are taller.
- **macOS:** The Apple menu is fixed and first. Under space pressure the system narrows spacing and truncates titles; in full screen the bar hides until revealed.
- **macOS menu bar extras:** An icon that persists while the app runs, on the side opposite the app menus. Use a symbol or black-and-clear template icon; the system recolors it. Open a menu, not a popover, unless the function is too complex.
- **macOS menu bar extras:** Let people opt in, usually in settings, optionally during setup. Do not depend on the extra being visible. Also offer the functions elsewhere, such as a Dock menu.
- **iOS, tvOS, visionOS, watchOS:** Not supported.

**Specs**
- macOS menu bar height: 24 pt. macOS sizes a menu to its widest item, dynamic items included.

| | iPadOS | macOS |
| --- | --- | --- |
| Visibility | Hidden until revealed | Visible by default |
| Alignment | Centered | Leading side |
| Menu bar extras | Not available | System and custom |
| Window controls | In the bar when the app is full screen | Never in the bar |
| Apple menu | Not available | Always |
| App menu | No About, Services or hide/show items | Always |

**APIs:** `CommandMenu`, `MenuBarExtra`, `NSStatusBar`, `NSHelpManager`, `isAlternate`, Adding menus and shortcuts to the menu bar and user interface (UIKit)

Last change: June 9, 2025 — iPadOS menu bar guidance added.

## Toolbars
Source: https://developer.apple.com/design/human-interface-guidelines/toolbars

A toolbar runs along the top or bottom of a view and holds the title, navigation (back, forward, search) and actions in logical groups. Use a tab bar, not a toolbar, to switch app areas.

**Do**
- Include few enough items that each is distinct; define which items move to the overflow menu as width shrinks.
- Add a More menu for less important actions only when they do not fit.
- iPadOS, macOS: let people customize the toolbar, mainly in apps with many items or long sessions.
- Let the content layer set the toolbar's look; use `ScrollEdgeEffectStyle` to separate bar and content.
- Use standard components; custom ones need corner radii concentric with the bar.
- Hide toolbars for focus only in context, with a reliable way to bring them back.
- Give each window a useful title, or leave it empty when content provides context (Notes); keep it under 15 characters.
- Use the standard Back and Close buttons with their symbols; custom versions must look and act the same.
- Prioritize actions for the main tasks or most important objects.
- Prefer simple system symbols without borders; use text only where symbols fail (Edit).
- Use the `.prominent` style for one key action (Done, Submit), on the trailing side.
- Leading edge: back, sidebar toggle, title, optional document menu (Duplicate, Rename, Move, Export); not customizable.
- Center: common controls, or the title; customizable, and items collapse into overflow first.
- Trailing edge: important items, inspector buttons, search, the More menu and the primary action; always visible.
- Group items by function and frequency, with navigation and critical actions (Done, Close, Save) in their own sections.
- Keep groups and placement the same across platforms; aim for three groups at most.
- Separate text-labeled buttons from symbol buttons and from each other with fixed space.

**Avoid**
- Adding an overflow menu yourself, or layouts that overflow by default; macOS and iPadOS add one automatically.
- Custom toolbar backgrounds and tinted controls; label colors close to bright content colors.
- Text labels "Back" or "Close".
- The app name as a window title.
- Borders around toolbar symbols.

**Platform notes**
- **iOS:** Put only essential items in the main toolbar; use a More menu for the rest. Use a large title that shrinks on scroll. A top navigation toolbar is also called a navigation bar.
- **iPadOS:** A toolbar and a tab bar can share the top row.
- **macOS:** The toolbar sits in the window frame below or merged with the title bar; items have no bezel. Make every toolbar item also a menu bar command (not the reverse).
- **visionOS:** The system toolbar sits at the window's bottom edge, slightly in front, with a variable blur. Items show a symbol or text; gaze reveals a symbol's label. Prefer the system toolbar.
- **visionOS:** Avoid vertical toolbars (tab bars are vertical). Keep windows from shrinking below toolbar width; there is no menu bar. Offer context controls in modal states, then restore the standard ones. Avoid pull-down menus in the toolbar.
- **watchOS:** Toolbar buttons sit in the top corners or along the bottom and stay visible over scrolling content. A scrolling button (`primaryAction`) is hidden until people scroll up; use it for an important but non-primary action (Mail New Message).
- **tvOS:** No additional considerations.

**APIs:** Toolbars (SwiftUI), `UIToolbar`, `NSToolbar`, `ScrollEdgeEffectStyle`, `UIBarButtonItem.SystemItem.fixedSpace`, `prefersLargeTitles`, `topBarLeading`, `topBarTrailing`, `bottomBar`, `primaryAction`

Last change: December 16, 2025 — guidance updated for Liquid Glass.
