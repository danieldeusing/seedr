# Components / Layout and organization

This file covers the components that group, arrange and reveal content: boxes, collections, lists, hierarchies, panes and tabs.

## Pages
- [Boxes](#boxes): bordered or tinted groups of related content with optional title
- [Collections](#collections): ordered, visual row or grid layouts, mostly for images
- [Column views](#column-views): macOS browser columns for navigating deep hierarchies
- [Disclosure controls](#disclosure-controls): triangles and buttons that show and hide details
- [Labels](#labels): static, uneditable text and the four system label colors
- [Lists and tables](#lists-and-tables): rows of data, styles, selection and editing
- [Lockups](#lockups): tvOS cards, caption buttons, monograms and posters
- [Outline views](#outline-views): macOS hierarchical lists with columns and disclosure triangles
- [Split views](#split-views): adjacent panes for hierarchy navigation, per platform
- [Tab views](#tab-views): mutually exclusive panes switched by a tabbed control

## Boxes
Source: https://developer.apple.com/design/human-interface-guidelines/boxes

A box sets apart a group of related information and controls with a border or background color, and can carry a title.

**Do**
- Keep a box small compared with its window or screen.
- Show subgroups inside a box with padding and alignment.
- Add a short title when it clarifies the relationship; it also helps VoiceOver users predict the content.
- Write the title as a brief phrase in sentence-style capitalization.

**Avoid**
- Nested boxes; they make the interface look busy and cramped.
- Ending punctuation in the title, except in a settings pane, where the title ends with a colon.

**Platform notes**
- **iOS, iPadOS:** Boxes use the secondary and tertiary background colors by default.
- **macOS:** The title appears above the box by default.
- **visionOS:** No additional considerations.
- **tvOS, watchOS:** Not supported.

**APIs:** `GroupBox`, `NSBox`

## Collections
Source: https://developer.apple.com/design/human-interface-guidelines/collections

A collection shows an ordered set of items in a customizable visual layout; it suits image-based content best.

**Do**
- Use the standard horizontal row or grid layout.
- Use a table for text; a scrolling list reads more easily.
- Leave enough padding around images so focus and hover effects stay visible and items do not overlap.
- Add custom gestures only when the app needs them; defaults are tap to select, touch and hold to edit, swipe to scroll.
- Animate insert, delete and reorder for feedback, with standard or custom animations.

**Avoid**
- Custom layouts that confuse people or draw attention to themselves.

**Platform notes**
- **iOS, iPadOS:** Change the layout dynamically only when the change is easy to follow; avoid changes during use unless people asked for them.
- **macOS, tvOS, visionOS:** No additional considerations.
- **watchOS:** Not supported.

**APIs:** `UICollectionView`, `NSCollectionView`

## Column views
Source: https://developer.apple.com/design/human-interface-guidelines/column-views

A column view (browser) navigates a hierarchy in a series of columns, one per level. A triangle marks each parent; selecting it shows its children in the next column.

**Do**
- Use it for deep hierarchies where people move back and forth between levels and need no sorting (Finder column view).
- Put the root level in the first column.
- When the selected item has no children, show details about it, such as a preview, dates, type and size.
- Let people resize columns, mainly for long item names.
- On iPadOS or visionOS, use a split view for hierarchical content instead.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `NSBrowser`

## Disclosure controls
Source: https://developer.apple.com/design/human-interface-guidelines/disclosure-controls

Disclosure controls show and hide information or functions that belong to a control or view. Use them to keep advanced details out of sight until needed.

**Do**
- Keep the most-used controls visible at the top and hide advanced options by default.
- Give a disclosure triangle a label that names what it reveals, such as "Advanced Options".
- Put a disclosure button next to the content it shows and hides.

**Avoid**
- More than one disclosure button in one view.

**Platform notes**
- **iOS, iPadOS, visionOS:** Available through the SwiftUI `DisclosureGroup` view.
- **macOS:** No additional considerations.
- **tvOS, watchOS:** Not supported.

**Specs**
- Disclosure triangle: points inward from the leading edge when collapsed, down when expanded. Use it for a view or a list (Keynote export options, Finder list view).
- Disclosure button: points down when collapsed, up when expanded. Use it for functions of one control (Save sheet next to the Save As field).
- Both toggle on click or tap, and the view grows or shrinks to fit.

**APIs:** `DisclosureGroup`, `NSButton.BezelStyle.disclosure`, `NSButton.BezelStyle.pushDisclosure`

## Labels
Source: https://developer.apple.com/design/human-interface-guidelines/labels

A label is static text that people read and often copy but cannot edit. It appears in buttons, list items and views to name actions and give context.

**Do**
- Use a label for small amounts of uneditable text; a text field for short editable text; a text view for long text.
- Prefer system fonts; labels support Dynamic Type by default. Keep custom styles legible.
- Show relative importance with the system label colors (table below).
- Make useful text selectable and copyable: error messages, locations, IP addresses.

**Platform notes**
- **macOS:** Use `NSTextField` with `isEditable` off for a label.
- **watchOS:** System date, time and timer text components fit themselves to the space and update without app work. Consider them for complications.
- **iOS, iPadOS, tvOS, visionOS:** No additional considerations.

**Specs**

| Color | Use | iOS, iPadOS, tvOS, visionOS | macOS |
| --- | --- | --- | --- |
| Label | Primary information | `label` | `labelColor` |
| Secondary label | Subheading, supplemental text | `secondaryLabel` | `secondaryLabelColor` |
| Tertiary label | Unavailable item or behavior | `tertiaryLabel` | `tertiaryLabelColor` |
| Quaternary label | Watermark text | `quaternaryLabel` | `quaternaryLabelColor` |

**APIs:** `Label`, `Text` (SwiftUI), `UILabel`, `NSTextField`

Last change: June 5, 2023 — updated for watchOS 10.

## Lists and tables
Source: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables

Lists and tables show data in rows across one or more columns, grouped or hierarchical, with selection, adding, deleting and reordering. Productivity apps use sortable multicolumn tables.

**Do**
- Use lists and tables for text; use a collection for items of very different sizes or many images.
- Allow editing where it helps; reordering alone is welcome.
- Keep the selected row highlighted when the list navigates a hierarchy; for option lists, flash the highlight and then add a checkmark.
- Keep item text short; for long items list titles only and show content in a detail view.
- Truncate with a middle ellipsis when the start and end both identify the item.
- In multicolumn tables, use noun-phrase column headings in title-style capitalization with no ending punctuation.
- Without a heading in a single-column table, give context with a label or header.
- Pick a list style that fits the data and platform: grouped (iOS, iPadOS), elliptical (watchOS), bordered with alternating rows (macOS).
- Pick a row style for the content, such as a small leading image with a short label.

**Avoid**
- An info button for navigation in iOS, iPadOS or visionOS; it only reveals details. Use a disclosure indicator (chevron) to drill in.
- A section index on a table whose rows end in trailing controls such as disclosure indicators; both sit on the trailing edge.

**Platform notes**
- **iOS, iPadOS:** People enter edit mode before selecting items. An info button in a row is a detail disclosure button.
- **macOS:** Let people sort by clicking a column heading; a second click reverses the order. Let people resize columns. Consider alternating row colors in wide tables. Use an outline view for hierarchical data.
- **tvOS:** A focused row grows slightly and may get rounded corners; check nearby images and do not add your own corner masks.
- **watchOS:** Keep lists short, but show the most relevant items plus a way to see all when people expect many. Keep detail views short to allow vertical page-based navigation; scrolling detail views break it.

**APIs:** `List`, `Tables` (SwiftUI), `ListStyle`, `UIListContentConfiguration`, `UITableView`, `UITableViewCell.AccessoryType.disclosureIndicator`, `NSTableView`

Last change: June 21, 2023 — visionOS guidance added.

## Lockups
Source: https://developer.apple.com/design/human-interface-guidelines/lockups

A lockup joins a header, a content view and a footer into one interactive tvOS unit that grows and shrinks together on focus. Types: cards, caption buttons, monograms, posters.

**Do**
- Leave enough space between lockups so a focused, enlarged one does not overlap or push others.
- Use the same width and height for lockups in a row or group.
- Use cards to show ratings and reviews of media items.
- Give caption buttons an image or text, with an optional title and subtitle below.
- Make caption buttons tilt with the swipe: up and down in a column, left and right in a row, both in a grid.
- Use monograms for people (cast and crew): a circular photo and a name, initials when no photo exists. Prefer the photo.
- Size posters to their content; their optional title and subtitle appear only on focus.

**Platform notes**
- **iOS, iPadOS, macOS, visionOS, watchOS:** Not supported.

**APIs:** `TVLockupView`, `TVLockupHeaderFooterView`, `TVCardView`, `TVCaptionButtonView`, `TVMonogramContentView`, `TVPosterView`

## Outline views
Source: https://developer.apple.com/design/human-interface-guidelines/outline-views

An outline view lists hierarchical data in rows and columns; parents have disclosure triangles. It often fills the leading side of a split view (Finder list).

**Do**
- Show the hierarchy in the first column only; other columns hold attributes such as size and date.
- Always give headings in a multicolumn outline view: nouns, title-style capitalization, no punctuation, no trailing colon.
- Give context with a label when a single column has no heading.
- Let people sort by clicking a heading. Sorting the primary column sorts each level; a second click reverses.
- Let people resize columns.
- Expand one container on click and all its descendants on Option-click.
- Remember expansion state and restore it next time.
- Consider alternating row colors in wide multicolumn views.
- Allow editing where useful: single click edits a cell, double click may open the item; allow reorder, add, remove.
- Truncate with a centered ellipsis instead of clipping.
- Add a search field in the toolbar for long outlines.

**Avoid**
- An outline view for flat data; use a table.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `OutlineGroup`, `NSOutlineView`

## Split views
Source: https://developer.apple.com/design/human-interface-guidelines/split-views

A split view shows adjacent panes, usually several hierarchy levels at once: a sidebar, then content, then an optional detail pane. Rarely it holds supporting tools around a canvas (Keynote navigator, notes, inspector).

**Do**
- Keep the selection highlighted in every pane that leads to the detail view.
- Consider drag and drop between panes.

**Platform notes**
- **iOS:** Use split views in regular width, not compact (iPhone portrait).
- **iPadOS:** Two panes (Mail) or three (Keynote). Design for narrow, compact and intermediate widths and keep navigation between panes logical.
- **macOS:** Panes can stack vertically, sit side by side, or both, with draggable dividers. Set minimum and maximum pane sizes that keep the divider visible. Let people hide panes, and restore them by toolbar button, menu command and keyboard shortcut. Prefer the thin 1 pt divider; use thicker only when strong row lines would hide it.
- **tvOS:** Use for filtering: category in the primary pane, results in the secondary. Default split is one third and two thirds; half and half is possible. Put one title above the whole view. Center the title when the secondary pane is a collection; put it above the primary pane when the secondary pane is one main view.
- **visionOS:** Prefer a split view to a new window for supplementary information; use a sheet for a short task.
- **watchOS:** The list or the detail fills the screen. Show the most relevant detail on launch (location, time, recent actions). Put multiple detail pages in a vertical tab view scrolled with the Digital Crown.

**APIs:** `NavigationSplitView`, `UISplitViewController`, `NSSplitViewController`, `VSplitView`, `HSplitView`, `NSSplitView.DividerStyle`

Last change: June 9, 2025 — iOS and iPadOS platform considerations added.

## Tab views
Source: https://developer.apple.com/design/human-interface-guidelines/tab-views

A tab view shows mutually exclusive panes in one area, switched by a tabbed control on the top edge. Use it for closely related content.

**Do**
- Keep each pane self-contained; its controls affect only that pane.
- Label each tab with a noun or short noun phrase (a verb phrase sometimes) in title-style capitalization.
- Inset the tab view with a margin of window body on all sides.
- Hide the tabbed control only when the app switches panes in code; the content area can then be borderless (solid or transparent), bezeled or bordered.

**Avoid**
- A pop-up button to switch tabs; it takes two clicks and hides choices. It is acceptable only when there are too many panes for tabs.
- More than six tabs; use another design, such as view options in a pop-up button menu.
- Extending the tab view to the window edges; it is unusual.

**Platform notes**
- **iOS, iPadOS:** Not supported; use a segmented control for similar behavior.
- **tvOS, visionOS:** Not supported.
- **watchOS:** Tab views appear as page controls.

**APIs:** `TabView`, `NSTabView`

Last change: June 5, 2023 — watchOS guidance added.
