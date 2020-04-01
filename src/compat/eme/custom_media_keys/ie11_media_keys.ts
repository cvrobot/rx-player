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

import {
  merge as observableMerge,
  Subject,
} from "rxjs";
import { takeUntil } from "rxjs/operators";
import EventEmitter from "../../../utils/event_emitter";
import PPromise from "../../../utils/promise";
import * as events from "../../event_listeners";
import {
  ICustomMediaKeys,
  ICustomMediaKeySession,
  ICustomMediaKeyStatusMap,
  IMediaKeySessionEvents,
} from "./types";
import wrapUpdate from "./wrap_update";

class IE11MediaKeySession extends EventEmitter<IMediaKeySessionEvents>
                          implements ICustomMediaKeySession {
  public readonly update: (license: ArrayBuffer,
                           sessionId?: string) => Promise<void>;
  public readonly closed: Promise<void>;
  public expiration: number;
  public keyStatuses: ICustomMediaKeyStatusMap;
  public sessionId: string;
  private readonly _mk: MSMediaKeys;
  private readonly _closeSession$: Subject<void>;
  private _ss?: MediaKeySession;
  constructor(mk: MSMediaKeys) {
    super();
    this.sessionId = "";
    this.expiration = NaN;
    this.keyStatuses = new Map();
    this._mk = mk;
    this._closeSession$ = new Subject();
    this.closed = new PPromise((resolve) => {
      this._closeSession$.subscribe(resolve);
    });
    this.update = wrapUpdate((license, sessionId) => {
      if (this._ss == null) {
        throw new Error("MediaKeySession not set");
      }
      /* tslint:disable no-unsafe-any */
      (this._ss as any).update(license, sessionId);
      /* tslint:enable no-unsafe-any */
      this.sessionId = sessionId;
    });
  }
  generateRequest(_initDataType: string, initData: ArrayBuffer): Promise<void> {
    return new PPromise((resolve) => {
      /* tslint:disable no-unsafe-any */
      this._ss = (this._mk as any).createSession("video/mp4",
                                                 initData) as MediaKeySession;
      /* tslint:enable no-unsafe-any */
      observableMerge(events.onKeyMessage$(this._ss),
                      events.onKeyAdded$(this._ss),
                      events.onKeyError$(this._ss)
      ).pipe(takeUntil(this._closeSession$))
        .subscribe((evt: Event) => this.trigger(evt.type, evt));
      resolve();
    });
  }
  close(): Promise<void> {
    return new PPromise((resolve) => {
      if (this._ss != null) {
        /* tslint:disable no-floating-promises */
        this._ss.close();
        /* tslint:enable no-floating-promises */
        this._ss = undefined;
      }
      this._closeSession$.next();
      this._closeSession$.complete();
      resolve();
    });
  }
  load(): Promise<boolean> {
    return PPromise.resolve(false);
  }
  remove(): Promise<void> {
    return PPromise.resolve();
  }
}

class IE11CustomMediaKeys implements ICustomMediaKeys {
  private _videoElement?: HTMLMediaElement;
  private _mediaKeys?: MSMediaKeys;

  constructor(keyType: string) {
    /* tslint:disable no-unsafe-any */
    this._mediaKeys = new MSMediaKeys(keyType);
    /* tslint:enable no-unsafe-any */
  }

  _setVideo(videoElement: HTMLMediaElement): void {
    this._videoElement = videoElement;
    /* tslint:disable no-unsafe-any */
    if ((this._videoElement as any).msSetMediaKeys !== undefined) {
      return (this._videoElement as any).msSetMediaKeys(this._mediaKeys);
    }
    /* tslint:enable no-unsafe-any */
  }

  createSession(/* sessionType */): ICustomMediaKeySession {
    if (this._videoElement === undefined || this._mediaKeys === undefined) {
      throw new Error("Video not attached to the MediaKeys");
    }
    return new IE11MediaKeySession(this._mediaKeys);
  }

  setServerCertificate(): Promise<void> {
    throw new Error("Server certificate is not implemented in your browser");
  }
}

export default function getIE11MediaKeysCallbacks() {
  /* tslint:disable no-unsafe-any */
  const isTypeSupported = (keySystem: string, type?: string|null) =>
    MSMediaKeys.isTypeSupported(keySystem, type);
  /* tslint:enable no-unsafe-any */
  const createCustomMediaKeys = (keyType: string) => new IE11CustomMediaKeys(keyType);
  return {
    isTypeSupported,
    createCustomMediaKeys,
  };
}
