/*!
 * Copyright 2019, OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  hrTimeToNanoseconds,
  otperformance as performance,
} from '@opentelemetry/core';
import * as core from '@opentelemetry/core';
import * as tracing from '@opentelemetry/tracing';
import { HrTime } from '@opentelemetry/types';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { addSpanNetworkEvent, getResource, PerformanceEntries } from '../src';
import { PerformanceTimingNames as PTN } from '../src/enums/PerformanceTimingNames';

const SECOND_TO_NANOSECONDS = 1e9;

function createHrTime(startTime: HrTime, addToStart: number): HrTime {
  let seconds = startTime[0];
  let nanos = startTime[1] + addToStart;
  if (nanos >= SECOND_TO_NANOSECONDS) {
    nanos = SECOND_TO_NANOSECONDS - nanos;
    seconds++;
  }
  return [seconds, nanos];
}

function createResource(
  resource = {},
  startTime: HrTime,
  addToStart: number
): PerformanceResourceTiming {
  const fetchStart = core.hrTimeToNanoseconds(startTime) + 1;
  const responseEnd = fetchStart + addToStart;
  const million = 1000 * 1000; // used to convert nano to milli
  const defaultResource = {
    connectEnd: 0,
    connectStart: 0,
    decodedBodySize: 0,
    domainLookupEnd: 0,
    domainLookupStart: 0,
    encodedBodySize: 0,
    fetchStart: fetchStart / million,
    initiatorType: 'xmlhttprequest',
    nextHopProtocol: '',
    redirectEnd: 0,
    redirectStart: 0,
    requestStart: 0,
    responseEnd: responseEnd / million,
    responseStart: 0,
    secureConnectionStart: 0,
    transferSize: 0,
    workerStart: 0,
    duration: 0,
    entryType: '',
    name: '',
    startTime: 0,
  };
  return Object.assign(
    {},
    defaultResource,
    resource
  ) as PerformanceResourceTiming;
}

describe('utils', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('addSpanNetworkEvent', () => {
    describe('when entries contain the performance', () => {
      it('should add event to span', () => {
        const addEventSpy = sinon.spy();
        const span = ({
          addEvent: addEventSpy,
        } as unknown) as tracing.Span;
        const entries = {
          [PTN.FETCH_START]: 123,
        } as PerformanceEntries;

        assert.strictEqual(addEventSpy.callCount, 0);

        addSpanNetworkEvent(span, PTN.FETCH_START, entries);

        assert.strictEqual(addEventSpy.callCount, 1);
        const args = addEventSpy.args[0];

        assert.strictEqual(args[0], 'fetchStart');
        assert.strictEqual(args[1], 123);
      });
    });
    describe('when entry has time equal to 0', () => {
      it('should NOT add event to span', () => {
        const addEventSpy = sinon.spy();
        const span = ({
          addEvent: addEventSpy,
        } as unknown) as tracing.Span;
        const entries = {
          [PTN.FETCH_START]: 0,
        } as PerformanceEntries;

        assert.strictEqual(addEventSpy.callCount, 0);

        addSpanNetworkEvent(span, PTN.FETCH_START, entries);

        assert.strictEqual(addEventSpy.callCount, 0);
      });
    });
    describe('when entries does NOT contain the performance', () => {
      it('should NOT add event to span', () => {
        const addEventSpy = sinon.spy();
        const span = ({
          addEvent: addEventSpy,
        } as unknown) as tracing.Span;
        const entries = {
          [PTN.FETCH_START]: 123,
        } as PerformanceEntries;

        assert.strictEqual(addEventSpy.callCount, 0);

        addSpanNetworkEvent(span, 'foo', entries);

        assert.strictEqual(
          addEventSpy.callCount,
          0,
          'should not call addEvent'
        );
      });
    });
  });
  describe('getResource', () => {
    const startTime = [0, 123123123] as HrTime;
    let spyHrTime: any;
    beforeEach(() => {
      const time = createHrTime(startTime, 500);
      sandbox.stub(performance, 'timeOrigin').value(0);
      sandbox
        .stub(performance, 'now')
        .callsFake(() => hrTimeToNanoseconds(time));

      spyHrTime = sinon.stub(core, 'hrTime').returns(time);
    });
    afterEach(() => {
      spyHrTime.restore();
    });

    describe('when resources are empty', () => {
      it('should return undefined', () => {
        const spanStartTime = createHrTime(startTime, 1);
        const spanEndTime = createHrTime(startTime, 100);
        const spanUrl = 'http://foo.com/bar.json';
        const resources: PerformanceResourceTiming[] = [];

        const resource = getResource(
          spanUrl,
          spanStartTime,
          spanEndTime,
          resources
        );

        assert.deepStrictEqual(
          resource.mainRequest,
          undefined,
          'main request should be undefined'
        );
      });
    });

    describe('when resources has correct entry', () => {
      it('should return the closest one', () => {
        const spanStartTime = createHrTime(startTime, 1);
        const spanEndTime = createHrTime(startTime, 402);
        const spanUrl = 'http://foo.com/bar.json';
        const resources: PerformanceResourceTiming[] = [];

        // this one started earlier
        resources.push(
          createResource(
            {
              name: 'http://foo.com/bar.json',
            },
            createHrTime(startTime, -1),
            100
          )
        );

        // this one is correct
        resources.push(
          createResource(
            {
              name: 'http://foo.com/bar.json',
            },
            createHrTime(startTime, 1),
            400
          )
        );

        // this one finished after span
        resources.push(
          createResource(
            {
              name: 'http://foo.com/bar.json',
            },
            createHrTime(startTime, 1),
            1000
          )
        );

        const resource = getResource(
          spanUrl,
          spanStartTime,
          spanEndTime,
          resources
        );

        assert.deepStrictEqual(
          resource.mainRequest,
          resources[1],
          'main request should be defined'
        );
      });
      describe('But one resource has been already used', () => {
        it('should return the next closest', () => {
          const spanStartTime = createHrTime(startTime, 1);
          const spanEndTime = createHrTime(startTime, 402);
          const spanUrl = 'http://foo.com/bar.json';
          const resources: PerformanceResourceTiming[] = [];

          // this one started earlier
          resources.push(
            createResource(
              {
                name: 'http://foo.com/bar.json',
              },
              createHrTime(startTime, -1),
              100
            )
          );

          // this one is correct but ignored
          resources.push(
            createResource(
              {
                name: 'http://foo.com/bar.json',
              },
              createHrTime(startTime, 1),
              400
            )
          );

          // this one is also correct
          resources.push(
            createResource(
              {
                name: 'http://foo.com/bar.json',
              },
              createHrTime(startTime, 1),
              300
            )
          );

          // this one finished after span
          resources.push(
            createResource(
              {
                name: 'http://foo.com/bar.json',
              },
              createHrTime(startTime, 1),
              1000
            )
          );

          const ignoredResources = new WeakSet<PerformanceResourceTiming>();
          ignoredResources.add(resources[1]);
          const resource = getResource(
            spanUrl,
            spanStartTime,
            spanEndTime,
            resources,
            ignoredResources
          );

          assert.deepStrictEqual(
            resource.mainRequest,
            resources[2],
            'main request should be defined'
          );
        });
      });
    });

    describe('when there are multiple resources from CorsPreflight requests', () => {
      it('should return main request and cors preflight request', () => {
        const spanStartTime = createHrTime(startTime, 1);
        const spanEndTime = createHrTime(startTime, 182);
        const spanUrl = 'http://foo.com/bar.json';
        const resources: PerformanceResourceTiming[] = [];

        // this one started earlier
        resources.push(
          createResource(
            {
              name: 'http://foo.com/bar.json',
            },
            createHrTime(startTime, 1),
            10
          )
        );

        // this one is correct
        resources.push(
          createResource(
            {
              name: 'http://foo.com/bar.json',
            },
            createHrTime(startTime, 1),
            11
          )
        );

        // this one finished after span
        resources.push(
          createResource(
            {
              name: 'http://foo.com/bar.json',
            },
            createHrTime(startTime, 50),
            100
          )
        );

        // this one finished after span
        resources.push(
          createResource(
            {
              name: 'http://foo.com/bar.json',
            },
            createHrTime(startTime, 50),
            130
          )
        );

        const resource = getResource(
          spanUrl,
          spanStartTime,
          spanEndTime,
          resources,
          undefined
        );

        assert.deepStrictEqual(
          resource.corsPreFlightRequest,
          resources[0],
          'cors preflight request should be defined'
        );

        assert.deepStrictEqual(
          resource.mainRequest,
          resources[3],
          'main request should be defined'
        );
      });
    });
  });
});
