/**
 * tests.js — 基础功能自测（控制台运行 Tests.run()）
 */
const Tests = (() => {
  let _results = [];

  function assert(name, ok) {
    _results.push({ name, ok });
  }

  function run() {
    _results = [];
    testPalette();
    testCalcBead();
    testStateSnapshot();
    testWatermarkState();
    const passed = _results.filter(r => r.ok).length;
    const failed = _results.filter(r => !r.ok).length;
    return { passed, failed, results: _results };
  }

  function testPalette() {
    assert("palette exists", typeof BEAD_PALETTES !== "undefined");
    assert("mard palette loaded", BEAD_PALETTES && BEAD_PALETTES.mard);
    assert("mard has 291 colors", BEAD_PALETTES && BEAD_PALETTES.mard && BEAD_PALETTES.mard.colors && BEAD_PALETTES.mard.colors.length === 291);
  }

  function testCalcBead() {
    assert("calcBeadSize exists", typeof Features !== "undefined" && typeof Features.calcBeadSize === "function");
    assert("15cm = 30 beads @5mm", Features.calcBeadSize(15, 5) === 30);
    assert("10cm = 20 beads @5mm", Features.calcBeadSize(10, 5) === 20);
    assert("7.5cm = 30 beads @2.5mm", Features.calcBeadSize(7.5, 2.5) === 30);
  }

  function testStateSnapshot() {
    assert("state exists", typeof state !== "undefined");
    assert("state has result field", state && "result" in state);
    assert("state has paletteKey", state && "paletteKey" in state);
  }

  function testWatermarkState() {
    assert("watermarkText in state", state && "watermarkText" in state);
    assert("watermarkOpacity in state", state && "watermarkOpacity" in state);
    assert("watermarkAngle in state", state && "watermarkAngle" in state);
    assert("watermarkOpacity is 0-1", state && state.watermarkOpacity >= 0 && state.watermarkOpacity <= 1);
  }

  return { run };
})();
