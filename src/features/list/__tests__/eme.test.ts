/**
 * Copyright 2015 CANAL+ Group
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import emeManager from "../../../core/eme";
import addEMEFeature from "../eme";

/* tslint:disable no-unsafe-any */
jest.mock("../../../core/eme", () => ({
  __esModule: true as const,
  default: jest.fn(),
}));

describe("Features list - EME", () => {
  it("should add EME in the current features", () => {
    const featureObject : any = {};
    addEMEFeature(featureObject);
    expect(featureObject).toEqual({ emeManager });
    expect(featureObject.emeManager).toBe(emeManager);
  });
});
/* tslint:enable no-unsafe-any */
