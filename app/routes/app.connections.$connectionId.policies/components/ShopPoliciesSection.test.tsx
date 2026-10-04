import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ShopPolicyRow } from "~/utils/sync/definitions.server";
import { ShopPoliciesSection } from "./ShopPoliciesSection";

const policies: ShopPolicyRow[] = [
  { type: "REFUND_POLICY", title: "Refund policy", body: "Refunds..." },
  { type: "PRIVACY_POLICY", title: "Privacy policy", body: "We collect..." },
];

function checkboxByLabel(label: string): Element | null {
  return document.querySelector(`s-checkbox[label="${label}"]`);
}

describe("ShopPoliciesSection", () => {
  it("shows an empty state when there are no policies", () => {
    render(
      <ShopPoliciesSection
        policies={[]}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(document.querySelector("s-paragraph")?.textContent).toMatch(
      /no shop policies found/i,
    );
  });

  it("renders a select-all checkbox and one row per policy", () => {
    render(
      <ShopPoliciesSection
        policies={policies}
        selected={new Set()}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toBeInTheDocument();
    expect(checkboxByLabel("Refund policy")).toBeInTheDocument();
    expect(checkboxByLabel("Privacy policy")).toBeInTheDocument();
  });

  it("marks select-all indeterminate when only some policies are selected", () => {
    render(
      <ShopPoliciesSection
        policies={policies}
        selected={new Set(["policy:REFUND_POLICY"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toHaveAttribute(
      "indeterminate",
      "true",
    );
    expect(checkboxByLabel("Refund policy")).toHaveAttribute("checked", "true");
  });

  it("marks select-all checked once every policy is selected", () => {
    render(
      <ShopPoliciesSection
        policies={policies}
        selected={new Set(["policy:REFUND_POLICY", "policy:PRIVACY_POLICY"])}
        onToggle={vi.fn()}
      />,
    );

    expect(checkboxByLabel("Select all (2)")).toHaveAttribute(
      "checked",
      "true",
    );
  });
});
