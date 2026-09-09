import { fireEvent, render, screen, within } from "@testing-library/react";
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

function renderBrowse(search = "", type = "skills") {
  return render(
    <MemoryRouter initialEntries={[`/${type}${search}`]}>
      <Routes>
        <Route path="/:type" element={<Browse />} />
      </Routes>
    </MemoryRouter>
  );
}

const filterBar = () => within(screen.getByTestId("filter-bar"));
const resultCards = () => screen.getByTestId("results-grid").children;

describe("Browse results window", () => {
  it("renders the first window of a long list and widens it on request", () => {
    // /plugins carries the mirrored marketplaces, far more than one window
    renderBrowse("", "plugins");
    const total = Number(/^(\d+) plugins available/.exec(screen.getByText(/plugins available/).textContent ?? "")?.[1]);
    expect(total).toBeGreaterThan(96);
    expect(resultCards()).toHaveLength(48);
    expect(screen.getByText(`Showing 48 of ${total}.`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(resultCards()).toHaveLength(96);
  });

  it("renders a short list whole, without the window notice", () => {
    renderBrowse("", "hooks");
    expect(resultCards().length).toBeLessThan(48);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });
});

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
