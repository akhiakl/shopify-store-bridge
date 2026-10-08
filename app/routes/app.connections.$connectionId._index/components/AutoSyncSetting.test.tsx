import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { AutoSyncSetting } from "./AutoSyncSetting";

function renderSetting(props: { enabled: boolean; canChange: boolean }) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <AutoSyncSetting {...props} />,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

function checkbox(): HTMLElement {
  return document.querySelector('s-checkbox[label="Auto-sync"]') as HTMLElement;
}

describe("AutoSyncSetting", () => {
  it("shows the saved state, and is read-only when it can't be changed", async () => {
    renderSetting({ enabled: true, canChange: false });
    await screen.findByText((_, el) => el === checkbox());
    expect(checkbox()).toHaveAttribute("checked");
    expect(checkbox()).toHaveAttribute("disabled");
  });

  it("can be changed when the source may change it", async () => {
    // See MetafieldDefinitionsSection.test.tsx for why interaction isn't
    // simulated: the refusal messages are covered in autoSync.server.test.
    renderSetting({ enabled: false, canChange: true });
    await screen.findByText((_, el) => el === checkbox());
    // React 18 renders `disabled={false}` as "false"; React 19 omits it.
    expect(checkbox().getAttribute("disabled") ?? "false").toBe("false");
    expect(checkbox()).toHaveAttribute(
      "details",
      expect.stringMatching(/run the last sync again/i),
    );
  });
});
