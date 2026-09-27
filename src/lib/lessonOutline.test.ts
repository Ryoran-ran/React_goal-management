import { describe, expect, it } from "vitest";
import { parseLessonOutline } from "./lessonOutline";

describe("lesson outline", () => {
  it("attaches space-, full-width-space- and tab-indented explanations to their item", () => {
    expect(
      parseLessonOutline(
        "・体重を乗せ切る\n  前の足に移動する\n　特に後退時\n\t・ゆっくり確認\n・上体を保つ\n  肩を上げない",
      ),
    ).toEqual([
      {
        kind: "item",
        text: "体重を乗せ切る",
        details: ["前の足に移動する", "特に後退時", "・ゆっくり確認"],
      },
      { kind: "item", text: "上体を保つ", details: ["肩を上げない"] },
    ]);
  });

  it("recognizes common bullet and numbered markers without splitting decimal values", () => {
    expect(
      parseLessonOutline(
        "- ウォーク\r\n* ファン\r• 足\r● 肩\n1. 目線\n２． 呼吸\n3) 姿勢\n1.5拍待つ",
      ).map(({ text, details }) => [text, details]),
    ).toEqual([
      ["ウォーク", []],
      ["ファン", []],
      ["足", []],
      ["肩", []],
      ["目線", []],
      ["呼吸", []],
      ["姿勢", []],
      ["1.5拍待つ", []],
    ]);
  });

  it("treats ordinary line breaks as separate list items", () => {
    expect(
      parseLessonOutline("  音声で入力した文章\n続きの文章\n　補足"),
    ).toEqual([
      {
        kind: "item",
        text: "音声で入力した文章",
        details: [],
      },
      { kind: "item", text: "続きの文章", details: ["補足"] },
    ]);
  });

  it("uses indentation only for supplemental details and ignores blank lines", () => {
    expect(
      parseLessonOutline(
        "全体のメモ\n\n・ウォーク\n説明の続き\n\n  補足\n・ファン\n",
      ),
    ).toEqual([
      { kind: "item", text: "全体のメモ", details: [] },
      { kind: "item", text: "ウォーク", details: [] },
      { kind: "item", text: "説明の続き", details: ["補足"] },
      { kind: "item", text: "ファン", details: [] },
    ]);
  });

  it("ignores empty lines and empty bullets", () => {
    expect(parseLessonOutline("\n　\t\r\n・\n- \n1. \n")).toEqual([]);
  });
});
