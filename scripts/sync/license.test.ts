import { describe, expect, it } from "vitest";
import { describeLicense, guessSpdx, locateLicense } from "./license.js";

const MIT = `MIT License

Copyright (c) 2026 Example

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...`;

const APACHE = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION`;

const BSD3 = `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice...
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.`;

const BSD2 = `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice.
2. Redistributions in binary form must reproduce the above copyright notice.`;

const ISC = `ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.`;

const MPL = `Mozilla Public License Version 2.0
==================================

1. Definitions`;

const GPL3 = `                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007`;

const CC_BY_SA = "Attribution-ShareAlike 4.0 International\n\n=======\nCreative Commons Corporation";
const CC_BY_NC_SA = "Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)";
const CC_BY = "Attribution 4.0 International\n\nCreative Commons Corporation";

const LGPL3 = `                   GNU LESSER GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007`;

describe("locateLicense", () => {
  it("prefers a license inside the item directory and records its upstream path", () => {
    const result = locateLicense(["SKILL.md", "LICENSE.txt"], ["LICENSE", "README.md"], "skills/pdf");
    expect(result).toEqual({ file: "skills/pdf/LICENSE.txt" });
  });

  it("falls back to the repository root and asks for the file to be installed as LICENSE", () => {
    const result = locateLicense(["README.md", ".claude-plugin/plugin.json"], ["LICENSE", "README.md"], "plugins/x");
    expect(result).toEqual({ file: "LICENSE", installAs: "LICENSE" });
  });

  it("installs a root NOTICE as NOTICE and a root COPYING as LICENSE", () => {
    expect(locateLicense(["a.md"], ["NOTICE"], "dir")).toEqual({ file: "NOTICE", installAs: "NOTICE" });
    expect(locateLicense(["a.md"], ["COPYING.txt"], "dir")).toEqual({ file: "COPYING.txt", installAs: "LICENSE" });
  });

  it("matches case-insensitively and ranks LICENSE over COPYING over NOTICE, exact name first", () => {
    expect(locateLicense(["notice.md", "copying", "License.md", "LICENSE"], [], "d")).toEqual({ file: "d/LICENSE" });
    expect(locateLicense(["NOTICE", "Copying.txt"], [], "d")).toEqual({ file: "d/Copying.txt" });
    expect(locateLicense(["NOTICE.md"], [], "d")).toEqual({ file: "d/NOTICE.md" });
  });

  it("ignores nested license files and non-license names", () => {
    expect(locateLicense(["skills/x/LICENSE.txt", "LICENSES.md", "THIRD_PARTY_NOTICES.md"], [], "d")).toBeNull();
    expect(locateLicense(["SKILL.md"], ["THIRD_PARTY_NOTICES.md", "docs/LICENSE"], "skills/a")).toBeNull();
  });

  it("never falls back to the root when the item is the repository root", () => {
    expect(locateLicense(["README.md"], ["README.md"], "")).toBeNull();
    expect(locateLicense(["LICENSE", "README.md"], ["LICENSE", "README.md"], "")).toEqual({ file: "LICENSE" });
  });
});

describe("guessSpdx", () => {
  it.each([
    ["MIT", MIT],
    ["Apache-2.0", APACHE],
    ["BSD-3-Clause", BSD3],
    ["BSD-2-Clause", BSD2],
    ["ISC", ISC],
    ["MPL-2.0", MPL],
    ["GPL-3.0-only", GPL3],
    ["CC-BY-SA-4.0", CC_BY_SA],
    ["CC-BY-NC-SA-4.0", CC_BY_NC_SA],
    ["CC-BY-4.0", CC_BY],
  ])("recognises %s", (expected, text) => {
    expect(guessSpdx(text)).toBe(expected);
  });

  it("does not mislabel licenses outside the supported set", () => {
    expect(guessSpdx(LGPL3)).toBeUndefined();
    expect(guessSpdx("Copyright 2026. All rights reserved.")).toBeUndefined();
    expect(guessSpdx("© 2025 Anthropic, PBC. All rights reserved. Use is governed by your agreement with Anthropic.")).toBeUndefined();
  });
});

describe("describeLicense", () => {
  it("produces the contract shape with an spdx guess when the text is known", () => {
    expect(describeLicense({ file: "LICENSE", installAs: "LICENSE" }, MIT)).toEqual({
      spdx: "MIT",
      file: "LICENSE",
      installAs: "LICENSE",
    });
  });

  it("omits spdx when the text is unrecognised and records a note when nothing was found", () => {
    expect(describeLicense({ file: "x/LICENSE" }, "custom terms")).toEqual({ file: "x/LICENSE" });
    expect(describeLicense(null, null)).toEqual({ note: expect.stringMatching(/No license text found upstream/) });
  });
});
