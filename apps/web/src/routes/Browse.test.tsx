import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Browse } from "./Browse";
import type { LabelDefinition } from "@/lib/types";

// registry/labels.json ships empty, so the dropdown is proven against a fixture
// catalogue; each test fills it before the page mounts and reads it.
const { catalogue } = vi.hoisted(() => ({ catalogue: [] as LabelDefinition[] }));
vi.mock("@/lib/labels", () => ({
  labelCatalogue: catalogue,
  labelDefinition: (slug: string | undefined) => catalogue.find((definition) => definition.slug === slug),
}));

function renderBrowse(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/skills${search}`]}>
      <Routes>
        <Route path="/:type" element={<Browse />} />
      </Routes>
    </MemoryRouter>
  );
}

const filterBar = () => within(screen.getByTestId("filter-bar"));

describe("Browse label filter", () => {
  beforeEach(() => {
    catalogue.length = 0;
  });

  it("offers the label filter once the source filter is Seedr", () => {
    catalogue.push({ slug: "project-x", name: "Project X", color: "green" });
    renderBrowse("?source=seedr");
    expect(filterBar().getByRole("button", { name: "Label" })).toBeInTheDocument();
  });

  it("hides the label filter while no source filter is set", () => {
    catalogue.push({ slug: "project-x", name: "Project X", color: "green" });
    renderBrowse();
    expect(filterBar().queryByRole("button", { name: "Label" })).not.toBeInTheDocument();
  });

  it("hides the label filter when the catalogue is empty", () => {
    renderBrowse("?source=seedr");
    // the Seedr-only Scope filter is there, so it is the empty catalogue that hides Label
    expect(filterBar().getByRole("button", { name: "Scope" })).toBeInTheDocument();
    expect(filterBar().queryByRole("button", { name: "Label" })).not.toBeInTheDocument();
  });
});
