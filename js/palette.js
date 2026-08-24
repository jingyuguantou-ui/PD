const MARD = (window.MARD_COLORS || []).map((c) => ({
  name: c.code,
  code: c.code,
  hex: c.hex,
  r: c.r,
  g: c.g,
  b: c.b,
}));

const BEAD_PALETTES = {
  mard: {
    label: "MARD 官方 291 色",
    colors: MARD,
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BEAD_PALETTES };
}
