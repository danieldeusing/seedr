import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ItemCard } from "./ItemCard";
import type { LabelDefinition, RegistryItem } from "@/lib/types";

// registry/labels.json ships empty, so the badge is proven against a fixture
// catalogue; each test fills it before the card mounts and reads it.
const { catalogue } = vi.hoisted(() => ({ catalogue: [] as LabelDefinition[] }));
vi.mock("@/lib/labels", () => ({
  labelCatalogue: catalogue,
  labelDefinition: (slug: string | undefined) => catalogue.find((definition) => definition.slug === slug),
}));

const PROJECT_X: LabelDefinition = { slug: "project-x", name: "Project X", color: "green" };

const skill = (overrides: Partial<RegistryItem> = {}): RegistryItem => ({
  slug: "alpha",
  name: "Alpha",
  type: "skill",
  description: "A skill.",
  compatibility: ["claude"],
  sourceType: "seedr",
  targetScope: "project",
  ...overrides,
});

function renderCard(item: RegistryItem) {
  return render(
    <MemoryRouter>
      <ItemCard item={item} />
    </MemoryRouter>
  );
}

describe("ItemCard plugin type badge", () => {
  // A wrapper plugin cross-listed on the skills page, or featured on the home
  // page, has no filter to offer, so the badge is plain content. It still has
  // to sit above the link stretched over the card, or hover never reaches it.
  it("explains what a wrapper is on hover, even where the badge filters nothing", async () => {
    renderCard(skill({ type: "plugin", pluginType: "wrapper", wrapper: "skill", sourceType: "community" }));
    const badge = screen.getByText("Wrapper");
    expect(badge.parentElement?.className).toContain("z-10");

    await userEvent.hover(badge);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Packages a single skill as a plugin");
  });
});

describe("ItemCard label badge", () => {
  beforeEach(() => {
    catalogue.length = 0;
  });

  it("shows the label beside the other badges", () => {
    catalogue.push(PROJECT_X);
    renderCard(skill({ label: "project-x" }));
    expect(screen.getByText("Project X")).toBeInTheDocument();
    // beside, not instead of: the scope badge is still there
    expect(screen.getByText("Project")).toBeInTheDocument();
  });

  it("shows nothing for an item that carries no label", () => {
    catalogue.push(PROJECT_X);
    renderCard(skill());
    expect(screen.queryByText("Project X")).not.toBeInTheDocument();
  });

  it("shows nothing for a label the catalogue does not define", () => {
    renderCard(skill({ label: "project-x" }));
    expect(screen.queryByText("Project X")).not.toBeInTheDocument();
    expect(screen.queryByText("project-x")).not.toBeInTheDocument();
  });
});
