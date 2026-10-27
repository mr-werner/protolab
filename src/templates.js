// Starter templates. Each is a plain list of builder objects, so people can
// change any part of it after loading. All of them fit a 256 mm printer.
import { makeObject as o } from "./objects.js";

export const TEMPLATES = [
  {
    id: "keychain",
    name: "Name keychain",
    blurb: "A tag with raised letters and a ring hole.",
    build: () => [
      o("box", { name: "Tag", params: { w: 64, d: 22, h: 3, radius: 6 } }),
      o("text", { name: "Name", params: { text: "ALEX", font: "Archivo Black", size: 11, depth: 2 }, position: [4, 0, 3] }),
      o("cylinder", { name: "Ring hole", hole: true, params: { d: 5, h: 10 }, position: [-25, 0, -2] }),
    ],
  },
  {
    id: "nameplate",
    name: "Desk name plate",
    blurb: "A standing sign for a desk or shelf.",
    build: () => [
      o("box", { name: "Base", params: { w: 160, d: 40, h: 5, radius: 3 } }),
      o("box", { name: "Face", params: { w: 160, d: 5, h: 42, radius: 0 }, position: [0, 4, 4] }),
      o("text", {
        name: "Name",
        params: { text: "Jordan Lee", font: "Archivo Black", size: 16, depth: 2 },
        position: [0, 1.6, 25],
        rotation: [90, 0, 0],
      }),
    ],
  },
  {
    id: "phone-stand",
    name: "Phone stand",
    blurb: "Holds a phone upright, with a slot for the charging cable.",
    build: () => [
      o("box", { name: "Base", params: { w: 80, d: 90, h: 6, radius: 4 } }),
      o("box", { name: "Back", params: { w: 80, d: 8, h: 100, radius: 0 }, position: [0, 20, 2], rotation: [-18, 0, 0] }),
      o("box", { name: "Lip", params: { w: 80, d: 6, h: 18, radius: 0 }, position: [0, -30, 2] }),
      o("box", { name: "Cable slot", hole: true, params: { w: 14, d: 20, h: 30, radius: 0 }, position: [0, -30, 5] }),
    ],
  },
  {
    id: "box-lid",
    name: "Box with lid",
    blurb: "A small storage box. The lid prints next to it, upside down.",
    build: () => [
      o("box", { name: "Box", params: { w: 80, d: 60, h: 40, radius: 4 }, position: [-50, 0, 0] }),
      o("box", { name: "Inside", hole: true, params: { w: 76, d: 56, h: 40, radius: 2 }, position: [-50, 0, 2] }),
      o("box", { name: "Lid", params: { w: 80, d: 60, h: 2.4, radius: 4 }, position: [50, 0, 0] }),
      o("box", { name: "Lid lip", params: { w: 75.4, d: 55.4, h: 5, radius: 1.8 }, position: [50, 0, 2] }),
      o("box", { name: "Lip hollow", hole: true, params: { w: 71.4, d: 51.4, h: 6, radius: 1 }, position: [50, 0, 2.4] }),
    ],
  },
  {
    id: "planter",
    name: "Plant pot",
    blurb: "A tapered pot with a drainage hole.",
    build: () => [
      o("cone", { name: "Pot", params: { d1: 70, d2: 92, h: 80 } }),
      o("cone", { name: "Soil space", hole: true, params: { d1: 63, d2: 86, h: 80 }, position: [0, 0, 3] }),
      o("cylinder", { name: "Drain hole", hole: true, params: { d: 8, h: 10 }, position: [0, 0, -2] }),
    ],
  },
  {
    id: "coaster",
    name: "Coaster",
    blurb: "A round coaster with a raised rim.",
    build: () => [
      o("cylinder", { name: "Disc", params: { d: 100, h: 3 } }),
      o("tube", { name: "Rim", params: { d: 100, id: 92, h: 6 } }),
      o("polygon", { name: "Center", params: { sides: 6, d: 30, h: 4 } }),
    ],
  },
  {
    id: "hook",
    name: "Wall hook",
    blurb: "Screws to a wall through two holes.",
    build: () => [
      o("box", { name: "Back plate", params: { w: 30, d: 5, h: 70, radius: 0 } }),
      o("box", { name: "Arm", params: { w: 30, d: 32, h: 6, radius: 0 }, position: [0, -16, 0] }),
      o("box", { name: "Tip", params: { w: 30, d: 6, h: 16, radius: 0 }, position: [0, -29, 0] }),
      o("cylinder", { name: "Screw hole", hole: true, params: { d: 4.5, h: 12 }, position: [0, 6, 25], rotation: [90, 0, 0] }),
      o("cylinder", { name: "Screw hole", hole: true, params: { d: 4.5, h: 12 }, position: [0, 6, 55], rotation: [90, 0, 0] }),
    ],
  },
  {
    id: "cable-clip",
    name: "Cable clip",
    blurb: "Snaps over a cable and sticks or screws down.",
    build: () => [
      o("tube", { name: "Clip", params: { d: 20, id: 12, h: 10 }, position: [0, 0, 0] }),
      o("box", { name: "Opening", hole: true, params: { w: 8, d: 12, h: 12, radius: 0 }, position: [0, 8, -1] }),
      o("box", { name: "Tab", params: { w: 36, d: 3, h: 10, radius: 0 }, position: [0, -9.5, 0] }),
    ],
  },
  {
    id: "bookmark",
    name: "Bookmark",
    blurb: "Thin enough for a book, with raised lettering.",
    build: () => [
      o("box", { name: "Strip", params: { w: 40, d: 150, h: 2, radius: 5 } }),
      o("text", { name: "Words", params: { text: "READ MORE", font: "Archivo Black", size: 9, depth: 1 }, position: [0, -6, 2], rotation: [0, 0, 90] }),
      o("cylinder", { name: "Tassel hole", hole: true, params: { d: 5, h: 6 }, position: [0, 66, -2] }),
    ],
  },
];
