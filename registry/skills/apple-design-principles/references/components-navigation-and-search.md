# Components / Navigation and search

This file covers the components that move people between areas of an app and that find content: path controls, search fields, sidebars, tab bars and token fields.

## Pages
- [Path controls](#path-controls): macOS control that shows the path of a file or folder
- [Search fields](#search-fields): search entry points, scope bars, tokens and placement per platform
- [Sidebars](#sidebars): leading-edge navigation for app areas and top-level collections
- [Tab bars](#tab-bars): navigation between top-level sections, tabs, badges and labels
- [Token fields](#token-fields): macOS text field that turns entries into editable tokens

## Path controls
Source: https://developer.apple.com/design/human-interface-guidelines/path-controls

A path control displays the file-system path of the selected file or folder, as the Finder path bar does (View > Show Path Bar). Two styles exist:
- **Standard:** a row of items from the root disk through the parent folders to the selected item, each with icon and name. When the row is too long, names between the first and last item collapse. When editable, people can drop an item on it to show that item's path.
- **Pop up:** like a pop-up button, it shows the icon and name of the selected item; a click opens a menu of the root disk, parent folders and item. When editable, the menu adds a Choose command, and dropping an item also works.

**Do**
- Put the path control inside the window body. The Finder shows its path bar at the bottom of the body, not in the status bar.

**Avoid**
- Path controls in a toolbar or a status bar.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `NSPathControl`

## Search fields
Source: https://developer.apple.com/design/human-interface-guidelines/search-fields

A search field is an editable text field with a Search icon, a Clear button and placeholder text, used to find terms in a collection of content. It can add a scope bar and tokens to narrow the search.

**Do**
- Write placeholder text that tells people what the search covers.
- Start the search as people type, and refine the results with each character, when possible.
- Offer suggestions: recent searches before typing, predictive terms during typing.
- Put the most relevant results first, and group results into categories when that helps.
- Let people filter results, for example with a scope bar in the results area.
- Use a scope bar only for clearly defined categories, such as all mailboxes versus the current mailbox in Mail.
- Start with the broader scope and let people narrow it.
- Use tokens for common terms or items (a contact, "photos"); a token is one selectable, editable unit that filters the other terms.
- Show tokens among the search suggestions, so people discover which tokens exist.

**Platform notes**
- **iOS:** Place the search entry point in one of three places: a tab in the tab bar, a toolbar (bottom or top), or inline with content.
  - Search as a tab, standard style: the tab looks like the other tabs and opens a search landing page with the field at the top. Use it to show suggestions and invite exploration (Apple TV shows genres there).
  - Search as a tab, button appearance: a separate button at the trailing end that focuses the field and raises the keyboard at once. Use it for quick, transient searches that return people to their previous tab.
  - Bottom toolbar: an expanded field or a toolbar button that animates into a field above the keyboard. Prefer the bottom when there is room and search is a priority (Settings alone; Mail and Notes beside other controls).
  - Top toolbar (navigation bar): a toolbar button that becomes a field above the keyboard, or at the top when the bottom has no space. Use the top when content at the bottom must stay uncovered (Wallet passes) or there is no bottom toolbar.
  - Inline field: use it when the field sits next to the content it filters and the scope depends on that position (the Music library filter). Put it above its list and consider pinning it to the top toolbar on scroll.
- **iPadOS, macOS:** Keep search the same on both when the app ships on both.
  - Put the field at the trailing end of the toolbar for most apps, in particular split-view apps that search several columns (Mail, Notes, Voice Memos), or when results appear in the detail view (Freeform).
  - Put the field at the top of the sidebar when it filters the sidebar's sections, as in Settings.
  - Make search an item in the sidebar or tab bar when it needs a dedicated area for suggestions, categories and recent searches (Music, TV).
  - In a dedicated search area, focus the field on arrival; on iPad with only the virtual keyboard, leave it unfocused so the keyboard does not cover the view.
  - Let the field resize with the window. In compact iPad widths, keep search where it helps most, for example above the content-list column (Notes, Mail).
- **tvOS:** The search screen is a special keyboard screen with a fully customizable results view under the keyboard. Offer popular, context-specific and recent suggestions to save typing.
- **visionOS:** No additional considerations.
- **watchOS:** A tap on the field opens a full-screen text-input control; the app returns to the field only after Cancel or Search.

**APIs:** `searchable(text:placement:prompt:)`, `UISearchBar`, `UISearchTextField`, `UISearchController`, `NSSearchField`

Last change: June 8, 2026 — terminology updated and guidance for search as a tab in iOS refined.

## Sidebars
Source: https://developer.apple.com/design/human-interface-guidelines/sidebars

A sidebar sits on the leading side of a view and gives navigation between app areas or top-level collections such as folders and playlists. It needs much horizontal and vertical space; when space is short, a tab bar, or a tab bar that converts to a sidebar, often works better.

**Do**
- Let visually rich content extend under the floating Liquid Glass sidebar, by horizontal scrolling or by a background extension effect that mirrors the adjacent content beneath it. The incorrect example stops a header image at the sidebar's edge; the correct one carries it, flipped and blurred, to the window edge.
- Let people customize which items the sidebar shows and their order.
- Use disclosure controls to group a large hierarchy and save vertical space.
- Use SF Symbols for items; for a custom icon, make a custom symbol rather than a bitmap.
- Let people hide and show the sidebar with the gestures and commands they know.
- Keep to two levels of hierarchy at most. For deeper data, use a split view with a content list between the sidebar and the detail view.
- With two levels, give each group a short, descriptive title.
- Give icon colors a clear purpose. Icons use the app accent color by default; a fixed color, used rarely, can signal meaning (the yellow VIP icon in Mail).

**Avoid**
- Hiding the sidebar by default; it then stays undiscovered.
- Fixed icon colors that ignore the accent color people choose in macOS, except for rare meaningful exceptions.

**Platform notes**
- **iOS, iPadOS:** The `sidebarAdaptable` tab view style shows a sidebar or a tab bar at launch, with a button to switch, and adapts to rotation and window size. For a sidebar only, use `NavigationSplitView` or `UISplitViewController`. Try a tab bar first; use the convertible sidebar for areas people visit less. Without SwiftUI, use the `UICollectionLayoutListConfiguration.Appearance.sidebar` list appearance. On iPadOS people expect the edge swipe to hide the sidebar.
- **macOS:** Row height, text size and glyph size follow the sidebar size: small, medium or large. People can change it in General settings (sidebar icon size). Consider collapsing the sidebar automatically when the window gets small, as Mail does. Keep critical information and actions away from the bottom of the sidebar, because people often move windows so that the bottom edge is off screen. Offer a show/hide button or Show Sidebar and Hide Sidebar commands in the View menu.
- **visionOS:** A window usually grows to fit a sidebar, so people rarely hide it. For a deep hierarchy, consider a sidebar inside a tab for secondary navigation, and make sure sidebar selections never switch the open tab.
- **tvOS:** No additional considerations.
- **watchOS:** Not supported.

**APIs:** `sidebarAdaptable`, `NavigationSplitView`, `ListStyle.sidebar`, `backgroundExtensionEffect()`, `UICollectionLayoutListConfiguration`, `UISplitViewController`, `NSSplitViewController`

Last change: June 8, 2026 — guidance for sidebar icon colors updated and the adaptable sidebar style clarified.

## Tab bars
Source: https://developer.apple.com/design/human-interface-guidelines/tab-bars

A tab bar switches between the top-level sections of an app and keeps the navigation state of each section. Use it for navigation only.

**Do**
- Keep the tab bar visible in every section. Only a modal view may cover it.
- Keep the tab count low; fewer tabs are easier to navigate. For a complex structure, use a sidebar or a tab bar that adapts to one.
- Give each tab a label, one word where possible.
- Use SF Symbols for tab icons, so they adapt between compact (icon above label) and regular (icon beside label) layouts. Prefer filled symbols.
- Use a badge (red oval with white text, a number or an exclamation point) only for critical new or updated information.
- When the content is colorful, use a monochrome tab bar or an accent color that differs clearly from the content.
- When a section is empty, keep its tab and explain why there is no content.

**Avoid**
- Tabs that perform actions on the current view; use a toolbar for that.
- Overflow tabs. In iOS and iPadOS the trailing tab turns into a More tab that hides the rest in a list.
- Disabling or hiding tab buttons when their content is unavailable.
- Tab label colors similar to the content-layer background.

**Platform notes**
- **iOS:** The tab bar floats over content at the bottom on a Liquid Glass background. With an attached accessory (the Music MiniPlayer), the tab bar can minimize on scroll down and move the accessory inline; a tap on a tab or a scroll to the top restores it (`TabBarMinimizeBehavior`, `UITabBarController.MinimizeBehavior`). A dedicated search tab can sit at the trailing end.
- **iPadOS:** The tab bar sits near the top, fixed (`tabBarOnly`) or with a button that converts it to a sidebar (`sidebarAdaptable`). Prefer the tab bar; offer the sidebar conversion for complex apps. Let people add and remove tabs (`TabViewCustomization`, `UITab.Placement`); keep the default set to five or fewer so compact and regular sizes stay consistent. For a sidebar that never becomes a tab bar, use a navigation split view.
- **macOS:** No additional considerations.
- **tvOS:** You can set the background tint, color or image, the item fonts (a separate one for the selected item), the tints of selected and unselected items, and add icons such as settings and search. The bar is translucent and only the selected tab is opaque; with focus, the selected tab gets a drop shadow. Too many items fade out at the right edge, and at the left too when the bar scrolls. With a single main view, people can scroll the bar offscreen; with a split view, it stays pinned. Pressing Menu always returns focus to the tab bar. In live-viewing apps, order tabs: live content, then cloud DVR or recorded content, then other content.
- **visionOS:** The tab bar is always vertical and fixed to the window's leading side. It expands when people look at it and can cover content then. Give each tab a symbol and a short label; the symbol always shows, the label shows on expansion. For a deep hierarchy, a sidebar inside a tab may help; sidebar selections must not change the open tab.
- **watchOS:** Not supported.

**Specs**
- tvOS tab bar height: 68 pt, fixed.
- tvOS tab bar top edge: 46 pt from the top of the screen, fixed.
- Custom tab icon sizes: see Apple Design Resources.

**APIs:** `TabView`, `TabViewBottomAccessoryPlacement`, `TabBarMinimizeBehavior`, `TabViewCustomization`, `tabBarOnly`, `sidebarAdaptable`, `UITabBar`, `UITab.Placement`, `UITabBarController.MinimizeBehavior`

Last change: June 8, 2026 — terminology and artwork updated.

## Token fields
Source: https://developer.apple.com/design/human-interface-guidelines/token-fields

A token field is a text field that turns entered text into tokens people can select, drag, reorder and move between fields, like the address fields in a Mail compose window. It can suggest completions while people type and insert a chosen suggestion as a token.

**Do**
- Give tokens a context menu with information or edit options (in Mail: edit the name, mark as VIP, show the contact card).
- Add more shortcuts that convert text to a token, such as Return. By default a comma does it.
- Tune the delay before suggestions appear. The default is no delay, which can distract people while they type.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported. For tokens in search, see Search fields.

**APIs:** `NSTokenField`
