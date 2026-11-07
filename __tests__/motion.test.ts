import { LayoutAnimation } from "react-native";

import {
  __setReduceMotionForTests,
  configureLayoutAnimation,
  startLoop,
} from "@/utils/motion";

describe("utils/motion (réduction des animations)", () => {
  afterEach(() => __setReduceMotionForTests(false));

  it("démarre la boucle quand les animations sont autorisées", () => {
    const anim = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    expect(startLoop(anim, false)).toBe(anim);
    expect(anim.start).toHaveBeenCalled();
  });

  it("ne démarre pas la boucle quand les animations sont réduites", () => {
    __setReduceMotionForTests(true);
    const anim = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    startLoop(anim);
    expect(anim.start).not.toHaveBeenCalled();
    // stop() reste appelable au démontage
    anim.stop();
  });

  it("ignore LayoutAnimation quand les animations sont réduites", () => {
    const spy = jest.spyOn(LayoutAnimation, "configureNext").mockImplementation(() => {});
    __setReduceMotionForTests(true);
    configureLayoutAnimation();
    expect(spy).not.toHaveBeenCalled();
    __setReduceMotionForTests(false);
    configureLayoutAnimation();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
