# Components / Selection and input

Controls that let people pick a value or type data: wells, combo boxes, pickers, segmented controls, sliders, steppers, text fields, toggles and keyboards.

## Pages
- [Color wells](#color-wells): button that opens a color picker and shows the chosen color
- [Combo boxes](#combo-boxes): macOS text field joined with a list of preset values
- [Digit entry views](#digit-entry-views): tvOS full-screen entry of a PIN or code
- [Image wells](#image-wells): macOS editable image view with copy, paste, drag
- [Pickers](#pickers): scrollable value lists and date pickers, styles and modes
- [Segmented controls](#segmented-controls): row of segments for one or several related choices
- [Sliders](#sliders): thumb on a track between a minimum and a maximum
- [Steppers](#steppers): two-segment control that raises or lowers a value
- [Text fields](#text-fields): single-area entry for short text, validation, keyboards
- [Toggles](#toggles): switches, checkboxes, radio buttons and toggle-style buttons
- [Virtual keyboards](#virtual-keyboards): keyboard types, Return key, custom input views and keyboards

## Color wells
Source: https://developer.apple.com/design/human-interface-guidelines/color-wells

A color well shows a color and opens a color picker on tap or click, so people can recolor text, shapes or guides.

**Do**
- Prefer the system color picker: people know it, and it keeps their saved colors across apps and across iOS, iPadOS and macOS.
- Use a custom picker only when the system one cannot serve the task.

**Platform notes**
- **macOS:** The well highlights while active, opens the picker, then shows the new color. Support drag and drop between wells and from the picker.
- **tvOS, watchOS:** Not supported.

**APIs:** `UIColorWell`, `UIColorPickerViewController`, `NSColorWell`

## Combo boxes
Source: https://developer.apple.com/design/human-interface-guidelines/combo-boxes

A combo box joins a text field and a pull-down button. People type a custom value or choose a predefined one; a typed value does not join the list.

**Do**
- Fill the field with a useful default taken from the list; it need not be the first item.
- Put a label before the control that says what kind of item to expect. Use title-style capitalization and end it with a colon.
- Offer the most likely choices in the list.
- Keep every list item no wider than the text field, so nothing gets truncated.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `NSComboBox`

## Digit entry views
Source: https://developer.apple.com/design/human-interface-guidelines/digit-entry-views

A tvOS full-screen view with a digit keyboard for entering a series of digits, such as a PIN. An optional title and prompt sit above the digits.

**Do**
- Use secure digit fields, which show asterisks, whenever the digits are sensitive.
- Write a title and prompt that say why people must enter the digits.

**Platform notes**
- **iOS, iPadOS, macOS, visionOS, watchOS:** Not supported.

**APIs:** `TVDigitEntryViewController`

## Image wells
Source: https://developer.apple.com/design/human-interface-guidelines/image-wells

A macOS image view that people can edit: select it to copy, paste or delete the image, or drag a new image onto it without selecting it.

**Do**
- If the well needs an image, show the default image again after people clear it.
- When the well supports copy and paste, make the standard Edit menu items and keyboard shortcuts work.

**Platform notes**
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `NSImageView`

## Pickers
Source: https://developer.apple.com/design/human-interface-guidelines/pickers

A picker shows one or more scrolling lists of distinct values for single or multipart choices. Date pickers add a calendar view and keypad entry. Shown values and their order follow the device language and location.

**Do**
- Use a picker for medium to long lists.
- For a short list, use a pull-down button; for a very large set, use a list or table, which can grow and carry an index.
- Order values so people can guess the hidden ones, for example countries alphabetically.
- Show the picker in context, near the field being edited, at the bottom of the window or in a popover.
- Coarsen minute steps when precision is not needed; the interval must divide 60 evenly, for example 0, 15, 30, 45.

**Avoid**
- Switching to another view just to show a picker.

**Platform notes**
- **iOS, iPadOS:** Date picker styles:
  - **Compact:** a button showing the value in the accent color; it opens a modal calendar and time editor. Use it when space is tight. People can edit several times, then tap outside to confirm.
  - **Inline:** time only shows wheels; date and time show an inline calendar.
  - **Wheels:** scrolling wheels that also accept built-in or external keyboard entry.
  - **Automatic:** the system picks a style from platform and mode.
- **iOS, iPadOS:** Date picker modes: Date (month, day, year); Time (hour, minute, optional AM/PM); Date and time; Countdown timer (hours and minutes up to 23:59, not in inline or compact style).
- **macOS:** Choose the textual style for tight space and exact entry. Choose the graphical style for calendar browsing, date ranges or a clock face.
- **tvOS:** Pickers are available through SwiftUI.
- **watchOS:** People move through items with the Digital Crown. Lists, dates and times use the wheels style. A picker can show an outline, a caption and a scroll indicator.
- **watchOS:** For longer lists, the navigation-link style shows a button that opens the list; people can also scrub with the Digital Crown without tapping.

**APIs:** `Picker`, `DatePicker`, `navigationLink` picker style, `UIDatePicker`, `UIPickerView`, `NSDatePicker`

Last change: June 5, 2023 — revised the watchOS picker guidance.

## Segmented controls
Source: https://developer.apple.com/design/human-interface-guidelines/segmented-controls

A segmented control is a row of two or more segments, usually of equal width, each acting as a button with text or an image. It offers one choice, several choices (macOS only), or momentary actions without a selection state.

**Do**
- Use it for closely related choices that act on one object, state or view, for example in an inspector or toolbar.
- Use it when grouping matters or selection state must be clear at a glance; it keeps its grouping at any size.
- Keep one kind per control: either all segments show selection state, or all perform actions.
- Keep segment widths equal and content sizes similar.
- Label segments with nouns or noun phrases in title-style capitalization; a text-labeled control needs no introductory text.

**Avoid**
- More than about five to seven segments in a wide layout, or more than about five on iPhone.
- Mixing text and images in one control.

**Platform notes**
- **iOS, iPadOS:** Use it to switch between closely related subviews. Use a tab bar for separate app sections.
- **macOS:** Add introductory text, or labels below icon segments, when the purpose is unclear. Give each segment a tooltip if the app uses tooltips.
- **macOS:** Use a tab view for view switching in the main window area. Use a segmented control for view switching only in a toolbar or inspector.
- **macOS:** Consider spring loading: dragging items over a segment and force clicking activates it on a Magic Trackpad.
- **tvOS:** For content filtering, prefer a split view.
- **tvOS:** Focus selects a segment, so keep other focusable elements away from it.
- **visionOS:** Looking at an icon segment shows a tooltip with the text you supply.
- **watchOS:** Not supported.

**APIs:** `segmented` picker style, `UISegmentedControl`, `isMomentary`, `NSSegmentedControl`, `NSSegmentedControl.SwitchTracking.momentary`

Last change: June 21, 2023 — added visionOS guidance.

## Sliders
Source: https://developer.apple.com/design/human-interface-guidelines/sliders

A slider is a track with a thumb that people drag between a minimum and maximum value. The track fills with color up to the thumb; optional end icons show what minimum and maximum mean.

**Do**
- Customize track color, thumb image, tint or end icons only when it clarifies intent, for example small and large image icons for a size slider.
- Put the minimum on the leading side and maximum on the trailing side; for vertical sliders, minimum at the bottom.
- Add a text field and a stepper beside a wide-range slider, so people can see and type exact values.

**Platform notes**
- **iOS, iPadOS:** Do not use a slider for audio volume; use a volume view, which includes the output-device control.
- **macOS:** Linear sliders have a narrow lozenge thumb and optional tick marks. Circular sliders have a small circular thumb; ticks appear as dots around the edge.
- **macOS:** Give live feedback while the value changes.
- **macOS:** Use a linear slider for a fixed start and end, such as 0 to 100 percent opacity. Use a circular slider for repeating values, such as 0 to 360 degrees.
- **macOS:** Introduce a slider with a label in sentence-style capitalization ending in a colon.
- **macOS:** Add tick marks for scale and accuracy. Label only the minimum and maximum unless values are nonlinear; then add periodic labels.
- **macOS:** Show the thumb's value in a tooltip on hover.
- **visionOS:** Prefer horizontal sliders; side-to-side gestures are easier.
- **watchOS:** The track shows discrete steps or a continuous bar, with side buttons that change the value by a set amount. Plus and minus are the default glyphs; use custom glyphs if they explain the slider better.
- **tvOS:** Not supported.

**APIs:** `Slider`, `UISlider`, `NSSlider`

Last change: June 21, 2023 — added visionOS guidance.

## Steppers
Source: https://developer.apple.com/design/human-interface-guidelines/steppers

A stepper is a two-segment control that raises or lowers a value in increments. It shows no value itself, so it sits beside a field that does.

**Do**
- Make clear which value the stepper changes.
- Pair it with a text field when values vary widely, for example the number of copies to print.

**Platform notes**
- **macOS:** For large ranges, let Shift-click change the value by a bigger step, for example 10 times the default.
- **tvOS, watchOS:** Not supported.

**APIs:** `UIStepper`, `NSStepper`

## Text fields
Source: https://developer.apple.com/design/human-interface-guidelines/text-fields

A text field is a rectangle for entering or editing a short, specific piece of text, such as a name or email address. Use a text view for longer text.

**Do**
- Add placeholder text that hints at the purpose, and a separate label, because the placeholder disappears during typing.
- Use a secure text field for passwords and other sensitive data.
- Size each field to the amount of text you expect.
- Space multiple fields evenly, stack them vertically, and use consistent widths per group.
- Make Tab move focus in a logical order.
- Validate at the right moment: email when people leave the field; user names and passwords before they leave it.
- Use a number formatter for numeric input; never assume one presentation, since formats vary by locale.
- Choose clipping, wrapping by character or word, or truncation at start, middle or end for overflowing text.
- Offer an expansion tooltip on hover to show clipped or truncated text.
- In iOS, iPadOS, tvOS and visionOS, show the keyboard type that matches the content.

**Avoid**
- Long text entry or many fields in tvOS and watchOS apps; gather data with buttons or lists instead.

**Platform notes**
- **iOS, iPadOS:** Put a Clear button at the trailing end.
- **iOS, iPadOS:** Use the leading end for an image showing the field's purpose. Use the trailing end for extra features, such as a Bookmarks button.
- **macOS:** Use a combo box to pair text input with a list of choices.
- **watchOS:** Show a text field only when needed; prefer a list of options.

**APIs:** `TextField`, `SecureField`, `UITextField`, `NSTextField`

Last change: June 5, 2023 — updated for watchOS 10.

## Toggles
Source: https://developer.apple.com/design/human-interface-guidelines/toggles

A toggle switches between two opposing states, such as on and off, with a distinct look for each. Styles include switch and checkbox; every platform also supports buttons that act as toggles.

**Do**
- Use a toggle only to set the state of content or a view; for other choices, such as picking from a list, use a pop-up button.
- Make clear what the toggle controls, through context or a label (often in macOS).
- Make on and off look clearly different: fill, background shape, checkmark or dot.

**Avoid**
- Color as the only signal of state.

**Platform notes**
- **iOS, iPadOS:** Use the switch style only in a list row; the row content is its label.
- **iOS, iPadOS:** Keep the default green unless the accent color fits better, and keep enough contrast with the off state.
- **iOS, iPadOS:** Outside a list, use a toggle-style button with an interface icon and a changing background, not a switch, and no explanatory label.
- **macOS:** Put switches, checkboxes and radio buttons in the window body, never in a toolbar or status bar.
- **macOS:** Prefer a switch for an emphasized setting, such as a group of settings.
- **macOS:** In a grouped form, use a mini switch for a single-row setting, since it matches other control heights. For a hierarchy, use a regular switch for the parent and mini switches below.
- **macOS:** Do not replace existing checkboxes with switches.
- **macOS:** A checkbox is a small square: empty when off, checkmark when on, dash when mixed. It usually has a trailing title, except in an editable checklist.
- **macOS:** Use checkboxes for a hierarchy of settings. Show dependencies with leading-edge alignment and indentation.
- **macOS:** Show the mixed state on a parent checkbox when its children differ.
- **macOS:** If a group's relationship is unclear, add a label aligned to the first checkbox's baseline.
- **macOS:** A radio button is a small circle with a label: filled when selected, empty when not. Show them in groups of two to five for mutually exclusive choices.
- **macOS:** Use radio buttons for more than two exclusive options, and checkboxes when several can apply.
- **macOS:** For more than about five options, use a pop-up button.
- **macOS:** For one on/off setting, prefer a checkbox. Use a labeled pair of radio buttons only when a checkbox cannot state both states.
- **macOS:** Avoid the mixed state on radio buttons.
- **macOS:** In a horizontal row of radio buttons, space them evenly by the width of the longest label.

**APIs:** `Toggle`, `ToggleStyle`, `switch` toggle style, `GroupedFormStyle`, `ControlSize`, `UISwitch`, `changesSelectionAsPrimaryAction`, `NSButton.ButtonType.toggle`, `NSSwitch`, `allowsMixedState`

Last change: March 29, 2024 — expanded macOS switch guidance, clarified when checkboxes carry a title, added radio button artwork.

## Virtual keyboards
Source: https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards

On devices without a hardware keyboard, the system shows a virtual keyboard whose keys suit the task. It has no keyboard shortcuts. Apps can replace it with a custom input view or ship a custom keyboard extension.

**Do**
- Match the keyboard type to the content, and set a semantic content type so the system picks keys and corrections.
- Change the Return key type when it clarifies the action, for example a search key for search.
- Make a custom input view clearly useful in context, so people do not miss the system keyboard.
- Play the standard keyboard click in a custom input view; people can turn it off in Settings > Sounds.
- In a custom keyboard, give an obvious way to switch keyboards, like the Globe key.
- Offer a tutorial in the app for a custom keyboard: how to choose, activate, use it and switch back.

**Avoid**
- Duplicating the Emoji/Globe or Dictation keys that the system shows below a custom keyboard.
- Help content inside the keyboard itself.
- A systemwide custom keyboard when an in-app input view would do; use extensions for new input methods or unsupported languages.

**Platform notes**
- **iOS, iPadOS:** Use the keyboard layout guide so the keyboard feels part of the layout and key content stays visible.
- **iOS, iPadOS:** Put only task-relevant controls in an accessory view above the keyboard. Use Liquid Glass there if the app uses it; a standard toolbar adopts it automatically. Use the layout guide and standard padding.
- **iOS, iPadOS, tvOS:** Custom keyboards work in any app, except in secure text fields and phone number fields.
- **tvOS:** The Siri Remote shows a linear keyboard; other devices show a grid keyboard and content adapts. Digit entry views show a digit keyboard.
- **visionOS:** The keyboard sits in its own movable window, accepts direct and indirect gestures, and needs no layout space.
- **watchOS:** A keyboard appears only on large enough screens; otherwise people use dictation or Scribble. The keyboard type is fixed, but set the content type for suggestions. People can also type on a paired iPhone.
- **macOS:** Not supported.

**Specs**
- Keyboard types: ASCII capable, ASCII capable number pad, Decimal pad, Default, Email address, Name phone pad, Number pad, Numbers and punctuation, Phone pad, Twitter, URL, Web search.

**APIs:** `keyboardType(_:)`, `textContentType(_:)`, `submitLabel(_:)`, `ToolbarItemPlacement`, `UIKeyboardType`, `UITextContentType`, `UIReturnKeyType`, `inputViewController`, `inputAccessoryView`, `UIKeyboardLayoutGuide`, `playInputClick()`

Last change: June 9, 2025 — added guidance for controls above the keyboard and noted keyboard availability in watchOS.
