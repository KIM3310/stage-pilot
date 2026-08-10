import { describe, expect, it } from "vitest";
import { tryRepairXmlSelfClosingRootWithBody } from "../../../core/utils/xml-root-repair";

describe("xml-root-repair", () => {
  it("repairs LF and CRLF malformed roots while preserving body indentation", () => {
    expect(
      tryRepairXmlSelfClosingRootWithBody("<get_weather\n  city: Seoul\n/>", [
        "get_weather",
      ])
    ).toBe("<get_weather>\n  city: Seoul\n</get_weather>");

    expect(
      tryRepairXmlSelfClosingRootWithBody(
        "<get_weather  \r\n  <city>Seoul</city>\r\n  />",
        ["get_weather"]
      )
    ).toBe("<get_weather>\n  <city>Seoul</city>\n</get_weather>");
  });

  it("rejects non-tool roots, empty bodies, and existing closing tags", () => {
    expect(
      tryRepairXmlSelfClosingRootWithBody("<unknown\nvalue: 1\n/>", [
        "get_weather",
      ])
    ).toBeNull();
    expect(
      tryRepairXmlSelfClosingRootWithBody("<get_weather\n   \n/>", [
        "get_weather",
      ])
    ).toBeNull();
    expect(
      tryRepairXmlSelfClosingRootWithBody(
        "<get_weather\nvalue: 1\n</get_weather>\n/>",
        ["get_weather"]
      )
    ).toBeNull();
  });

  it("rejects CodeQL adversarial whitespace inputs without backtracking", () => {
    const inputs = [
      `<A\n${"\n ".repeat(50_000)}not-a-closing-line`,
      `<A\na\n${" \n".repeat(50_000)}not-a-closing-line`,
    ];

    for (const input of inputs) {
      expect(tryRepairXmlSelfClosingRootWithBody(input, ["A"])).toBeNull();
    }
  });
});
