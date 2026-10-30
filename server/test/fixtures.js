// A complete, valid handout to render and validate in tests.
//
// `demoHandout()` is already structurally complete (it has to pass validateHandout() with no
// warnings), so tests use it rather than keeping a second copy of the same data in step.
import { demoHandout } from '../lib/demo.js';

/** A fresh, independent copy: tests may break it without affecting other tests. */
export function handoutFixture() {
  return structuredClone(demoHandout());
}

/** Apply one fault to the fixture and get it back, for the validator tests. */
export function brokenHandout(mutate) {
  const handout = handoutFixture();
  mutate(handout);
  return handout;
}
