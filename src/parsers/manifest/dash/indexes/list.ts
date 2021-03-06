/*
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

import log from "../../../../log";
import {
  IRepresentationIndex,
  ISegment,
} from "../../../../manifest";
import { getTimescaledRange } from "../../utils/index_helpers";
import getInitSegment from "./get_init_segment";
import { createIndexURLs } from "./tokens";

/**
 * Index property defined for a SegmentList RepresentationIndex
 * This object contains every property needed to generate an ISegment for a
 * given media time.
 */
export interface IListIndex {
  /**
   * Duration of each element in the list, in the timescale given (see
   * timescale and list properties.)
   */
  duration : number;
  /** Byte range for a possible index of segments in the server. */
  indexRange?: [number, number];
  /**
   * Temporal offset, in the current timescale (see timescale), to add to the
   * presentation time (time a segment has at decoding time) to obtain the
   * corresponding media time (original time of the media segment in the index
   * and on the media file).
   * For example, to look for a segment beginning at a second `T` on a
   * HTMLMediaElement, we actually will look for a segment in the index
   * beginning at:
   * ```
   * T * timescale + indexTimeOffset
   * ```
   */
  indexTimeOffset : number;
  /** Information on the initialization segment. */
  initialization? : {
    /** URLs to access the initialization segment. */
    mediaURLs: string[] | null;
    /** possible byte range to request it. */
    range?: [number, number];
  };
  /** Information on the list of segments for this index. */
  list: Array<{
    /** URLs of the segment. */
    mediaURLs : string[] | null;
    /** Possible byte-range of the segment. */
    mediaRange? : [number, number];
  }>;
  /**
   * Timescale to convert a time given here into seconds.
   * This is done by this simple operation:
   * ``timeInSeconds = timeInIndex * timescale``
   */
  timescale : number;
}

/**
 * `index` Argument for a SegmentList RepresentationIndex.
 * Most of the properties here are already defined in IListIndex.
 */
export interface IListIndexIndexArgument {
  duration : number;
  indexRange?: [number, number];
  initialization?: { media? : string;
                     range? : [number, number]; };
  list: Array<{ media? : string;
                mediaRange? : [number, number]; }>;
  /**
   * Offset present in the index to convert from the mediaTime (time declared in
   * the media segments and in this index) to the presentationTime (time wanted
   * when decoding the segment).  Basically by doing something along the line
   * of:
   * ```
   * presentationTimeInSeconds =
   *   mediaTimeInSeconds -
   *   presentationTimeOffsetInSeconds +
   *   periodStartInSeconds
   * ```
   * The time given here is in the current
   * timescale (see timescale)
   */
  presentationTimeOffset? : number;
  timescale? : number;
}

/** Aditional context needed by a SegmentList RepresentationIndex. */
export interface IListIndexContextArgument {
  /** Start of the period concerned by this RepresentationIndex, in seconds. */
  periodStart : number;
  /** Base URL for the Representation concerned. */
  representationBaseURLs : string[];
  /** ID of the Representation concerned. */
  representationId? : string;
  /** Bitrate of the Representation concerned. */
  representationBitrate? : number;
}

export default class ListRepresentationIndex implements IRepresentationIndex {
  /** Underlying structure to retrieve segment information. */
  private _index : IListIndex;
  /** Start of the period concerned by this RepresentationIndex, in seconds. */
  protected _periodStart : number;

  /**
   * @param {Object} index
   * @param {Object} context
   */
  constructor(index : IListIndexIndexArgument, context : IListIndexContextArgument) {
    const { periodStart,
            representationBaseURLs,
            representationId,
            representationBitrate } = context;

    this._periodStart = periodStart;
    const presentationTimeOffset =
      index.presentationTimeOffset != null ? index.presentationTimeOffset :
                                             0;
    const timescale = index.timescale ?? 1;
    const indexTimeOffset = presentationTimeOffset - periodStart * timescale;

    const list = index.list.map((lItem) => ({
      mediaURLs: createIndexURLs(representationBaseURLs,
                                 lItem.media,
                                 representationId,
                                 representationBitrate),
      mediaRange: lItem.mediaRange }));
    this._index = { list,
                    timescale,
                    duration: index.duration,
                    indexTimeOffset,
                    indexRange: index.indexRange,
                    initialization: index.initialization == null ?
                      undefined :
                      { mediaURLs: createIndexURLs(representationBaseURLs,
                                                  index.initialization.media,
                                                  representationId,
                                                  representationBitrate),
                        range: index.initialization.range, }, };
  }

  /**
   * Construct init Segment.
   * @returns {Object}
   */
  getInitSegment() : ISegment {
    return getInitSegment(this._index);
  }

  /**
   * @param {Number} fromTime
   * @param {Number} duration
   * @returns {Array.<Object>}
   */
  getSegments(fromTime : number, dur : number) : ISegment[] {
    const index = this._index;
    const { duration, list, timescale } = index;
    const fromTimeInPeriod = fromTime - this._periodStart;
    const [ up, to ] = getTimescaledRange(fromTimeInPeriod, dur, timescale);

    const scaledStart = this._periodStart * timescale;
    const length = Math.min(list.length - 1, Math.floor(to / duration));
    const segments : ISegment[] = [];
    let i = Math.floor(up / duration);
    while (i <= length) {
      const range = list[i].mediaRange;
      const mediaURLs = list[i].mediaURLs;
      const args = { id: String(i),
                     time: i * duration + scaledStart,
                     isInit: false,
                     range,
                     duration,
                     timescale,
                     mediaURLs,
                     timestampOffset: -(index.indexTimeOffset / timescale) };
      segments.push(args);
      i++;
    }
    return segments;
  }

  /**
   * Returns true if, based on the arguments, the index should be refreshed.
   * (If we should re-fetch the manifest)
   * @param {Number} _fromTime
   * @param {Number} toTime
   * @returns {Boolean}
   */
  shouldRefresh(_fromTime : number, toTime : number) : boolean {
    const { timescale, duration, list } = this._index;
    const scaledTo = toTime * timescale;
    const i = Math.floor(scaledTo / duration);
    return i < 0 || i >= list.length;
  }

  /**
   * Returns first position in this index, in seconds.
   * @returns {Number}
   */
  getFirstPosition() : number {
    return this._periodStart;
  }

  /**
   * Returns last position in this index, in seconds.
   * @returns {Number}
   */
  getLastPosition() : number {
    const index = this._index;
    const { duration, list } = index;
    return ((list.length * duration) / index.timescale) + this._periodStart;
  }

  /**
   * Returns true if a Segment returned by this index is still considered
   * available.
   * @param {Object} segment
   * @returns {Boolean}
   */
  isSegmentStillAvailable(segment : ISegment) : boolean {
    if (segment.isInit) {
      return true;
    }
    const index = this._index;
    const scaledStart = this._periodStart * index.timescale;
    const scaledSegmentStartInPeriod = segment.timescale !== index.timescale ?
      ((segment.time * index.timescale) / segment.timescale) + scaledStart :
      segment.time - scaledStart;

    const { duration } = index;
    const segmentNb = scaledSegmentStartInPeriod / duration;
    return segmentNb > 0 && segmentNb % 1 === 0;
  }

  /**
   * We do not check for discontinuity in SegmentList-based indexes.
   * @returns {Number}
   */
  checkDiscontinuity() : -1 {
    return -1;
  }

  /**
   * SegmentList should not be updated.
   * @returns {Boolean}
   */
  canBeOutOfSyncError() : false {
    return false;
  }

  /**
   * @returns {Boolean}
   */
  isFinished() : true {
    return true;
  }

  /**
   * @returns {Boolean}
   */
  isInitialized() : true {
    return true;
  }

  /**
   * @param {Object} newIndex
   */
  _replace(newIndex : ListRepresentationIndex) : void {
    this._index = newIndex._index;
  }

  /**
   * @param {Object} newIndex
   */
  _update() : void {
    log.error("List RepresentationIndex: Cannot update a SegmentList");
  }

  _addSegments() : void {
    if (__DEV__) {
      log.warn("List RepresentationIndex: Tried to add Segments to a list RepresentationIndex");
    }
  }
}
