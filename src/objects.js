// Shape types the builder can add, with their editable dimensions (mm).
export const SHAPES = {
  box: {
    label: "Box",
    params: { w: 40, d: 40, h: 20, radius: 0 },
    fields: [
      ["w", "Width", 1, 256],
      ["d", "Depth", 1, 256],
      ["h", "Height", 0.4, 256],
      ["radius", "Corner radius", 0, 60],
    ],
  },
  cylinder: {
    label: "Cylinder",
    params: { d: 30, h: 30 },
    fields: [
      ["d", "Diameter", 1, 256],
      ["h", "Height", 0.4, 256],
    ],
  },
  tube: {
    label: "Tube",
    params: { d: 40, id: 32, h: 30 },
    fields: [
      ["d", "Outside diameter", 2, 256],
      ["id", "Inside diameter", 0.5, 254],
      ["h", "Height", 0.4, 256],
    ],
  },
  sphere: {
    label: "Sphere",
    params: { d: 30 },
    fields: [["d", "Diameter", 1, 256]],
  },
  cone: {
    label: "Cone",
    params: { d1: 40, d2: 0, h: 40 },
    fields: [
      ["d1", "Bottom diameter", 0, 256],
      ["d2", "Top diameter", 0, 256],
      ["h", "Height", 0.4, 256],
    ],
  },
  polygon: {
    label: "Prism",
    params: { sides: 6, d: 40, h: 20 },
    fields: [
      ["sides", "Sides", 3, 12, 1],
      ["d", "Diameter", 2, 256],
      ["h", "Height", 0.4, 256],
    ],
  },
  text: {
    label: "Text",
    params: { text: "ProtoLab", font: "Archivo Black", size: 12, depth: 3 },
    fields: [
      ["size", "Letter height", 3, 120],
      ["depth", "Depth", 0.4, 60],
    ],
  },
};

// Shapes whose edges can be rounded or beveled.
export const EDGE_TYPES = new Set(["box", "cylinder", "tube", "cone", "polygon", "sketch"]);

let counter = 0;
export const newId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makeObject(type, overrides = {}) {
  const def = SHAPES[type];
  return {
    id: newId(),
    type,
    name: overrides.name || def?.label || "Imported",
    params: { ...(def ? def.params : {}), ...(overrides.params || {}) },
    position: overrides.position || [0, 0, 0],
    rotation: overrides.rotation || [0, 0, 0],
    scale: overrides.scale ?? 1,
    hole: overrides.hole || false,
    hidden: false,
  };
}
