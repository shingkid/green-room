import { downloadTextFile } from "./browser";

describe("downloadTextFile", () => {
  it("creates and revokes an object URL", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.fn();
    const createElement = vi.spyOn(document, "createElement").mockImplementation(() => {
      return { click, href: "", download: "" } as unknown as HTMLAnchorElement;
    });

    downloadTextFile("file.txt", "hello");

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");

    createElement.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
