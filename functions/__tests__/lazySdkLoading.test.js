/* global describe, it, expect, jest */
// S7.9 : les SDK lourds (expo-server-sdk, resend, @anthropic-ai/sdk) ne sont
// plus chargés au require de index.js, donc pas au démarrage à froid de
// validateAndCreateEvent. Ils le sont à la première utilisation.
describe("chargement paresseux des SDK lourds", () => {
  it("require('../index') ne charge ni expo-server-sdk, ni resend, ni @anthropic-ai/sdk", () => {
    const loaded = [];
    for (const name of ["expo-server-sdk", "resend", "@anthropic-ai/sdk"]) {
      jest.doMock(name, () => {
        loaded.push(name);
        return jest.requireActual(name);
      });
    }
    jest.isolateModules(() => {
      require("./setup");
      const fns = require("../index");
      expect(typeof fns.validateAndCreateEvent).toBe("function");
    });
    expect(loaded).toEqual([]);
  });
});
