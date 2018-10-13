const Raven = require("raven-js");
const createRavenMiddleware = require("./index");
const { createStore, applyMiddleware } = require("redux");

const stringify = require.requireActual(
  "./vendor/json-stringify-safe/stringify"
);
const stringifyMocked = require("./vendor/json-stringify-safe/stringify");
jest.mock("./vendor/json-stringify-safe/stringify");

Raven.config(
  "https://5d5bf17b1bed4afc9103b5a09634775e@sentry.io/146969"
).install();

const reducer = (previousState = { value: 0 }, action) => {
  switch (action.type) {
    case "THROW":
      // Raven does not seem to be able to capture global exceptions in Jest tests.
      // So we explicitly wrap this error in a Raven context.
      Raven.context(() => {
        throw new Error("Reducer error");
      });
    case "INCREMENT":
      return { value: previousState.value + 1 };
    case "DOUBLE":
      return { value: previousState.value * 2 };
    default:
      return previousState;
  }
};

const context = {};

describe("raven-for-redux", () => {
  beforeEach(() => {
    stringifyMocked.mockImplementation(obj => stringify(obj));
    context.mockTransport = jest.fn();
    Raven.setTransport(context.mockTransport);
    Raven.setDataCallback(undefined);
    Raven.setBreadcrumbCallback(undefined);
    Raven.setUserContext(undefined);
    Raven._globalOptions.allowDuplicates = true;
    Raven._breadcrumbs = [];
    Raven._globalContext = {};
  });
  describe("in the default configuration", () => {
    beforeEach(() => {
      context.middleware = createRavenMiddleware(Raven);
      context.store = createStore(reducer, applyMiddleware(context.middleware));
    });
    it("merges Redux info with existing 'extras'", () => {
      Raven.captureException(new Error("Crash!"), {
        extra: { anotherValue: 10 }
      });
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra).toMatchObject({
        state: { value: 0 },
        lastAction: undefined,
        anotherValue: 10
        // session:duration will also be defined
      });
    });
    it("if explicitly passed extras contain a `state` property, the explicit version wins", () => {
      Raven.captureException(new Error("Crash!"), {
        extra: { anotherValue: 10, state: "SOME OTHER STATE" }
      });
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra).toMatchObject({
        state: "SOME OTHER STATE",
        lastAction: undefined,
        anotherValue: 10
        // session:duration will also be defined
      });
    });
    it("if explicitly passed extras contain a `lastAction` property, the explicit version wins", () => {
      Raven.captureException(new Error("Crash!"), {
        extra: { anotherValue: 10, lastAction: "SOME OTHER LAST ACTION" }
      });
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra).toMatchObject({
        state: { value: 0 },
        lastAction: "SOME OTHER LAST ACTION",
        anotherValue: 10
        // session:duration will also be defined
      });
    });
    it("includes the initial state when crashing/messaging before any action has been dispatched", () => {
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toBe(undefined);
      expect(extra.state).toEqual({ value: 0 });
    });
    it("returns the result of the next dispatch function", () => {
      expect(context.store.dispatch({ type: "INCREMENT" })).toEqual({
        type: "INCREMENT"
      });
    });
    it("logs the last action that was dispatched", () => {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual({ type: "THROW" });
    });
    it("logs the last state when crashing in the reducer", () => {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.state).toEqual({ value: 1 });
    });
    it("logs a breadcrumb for each action", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = context.mockTransport.mock.calls[0][0].data;
      expect(breadcrumbs.values.length).toBe(2);
      expect(breadcrumbs.values[0]).toMatchObject({
        category: "redux-action",
        data: undefined,
        message: "INCREMENT"
      });
      expect(breadcrumbs.values[1]).toMatchObject({
        category: "redux-action",
        data: undefined,
        message: "THROW"
      });
    });
    it("includes timestamps in the breadcrumbs", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();
      const { breadcrumbs } = context.mockTransport.mock.calls[0][0].data;
      const firstBreadcrumb = breadcrumbs.values[1];
      expect(firstBreadcrumb.timestamp).toBeLessThanOrEqual(+new Date() / 1000);
    });
    it("trims breadcrumbs over 100", () => {
      let n = 150;
      while (n--) {
        context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      }
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();
      const { breadcrumbs } = context.mockTransport.mock.calls[0][0].data;
      expect(breadcrumbs.values.length).toBe(100);
    });
    it("preserves order of native Raven breadcrumbs & raven-for-redux breadcrumbs", async () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      await new Promise(resolve => setTimeout(resolve, 100));
      Raven.captureBreadcrumb({ message: "some message" });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();
      const { breadcrumbs } = context.mockTransport.mock.calls[0][0].data;
      expect(breadcrumbs.values.length).toBe(3);
      expect(breadcrumbs.values[0]).toMatchObject({ message: "INCREMENT" });
      expect(breadcrumbs.values[1]).toMatchObject({ message: "some message" });
      expect(breadcrumbs.values[2]).toMatchObject({ message: "THROW" });
    });
    it("includes the last state/action when crashing/reporting outside the reducer", () => {
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "DOUBLE" });
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual({ type: "DOUBLE" });
      expect(extra.state).toEqual({ value: 4 });
    });
    it("preserves user context", () => {
      const userData = { userId: 1, username: "captbaritone" };
      Raven.setUserContext(userData);
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();

      expect(context.mockTransport.mock.calls[0][0].data.user).toEqual(
        userData
      );
    });

    ["captureException", "captureMessage"].forEach(fnName => {
      it(`skips state for ${fnName} if request would be larger than 200000B`, () => {
        expect(Raven._globalOptions.transport).toEqual(context.mockTransport);
        stringifyMocked
          .mockClear()
          .mockImplementationOnce(() => ({ length: 200001 }))
          .mockImplementationOnce(() => ({ length: 500 }));
        // Test that allowDuplicates is set to true inside our handler and reset afterwards
        // (Error message needs to be unique for each test, because we set allowDuplicates to null)
        Raven._globalOptions.allowDuplicates = null;
        Raven[fnName].call(
          Raven,
          fnName === "captureException"
            ? new Error("Test skip state")
            : "Test skip state"
        );

        // Ensure transport and allowDuplicates have been reset
        expect(Raven._globalOptions.transport).toEqual(context.mockTransport);
        expect(Raven._globalOptions.allowDuplicates).toEqual(null);
        expect(context.mockTransport).toHaveBeenCalledTimes(1);
        const { extra } = context.mockTransport.mock.calls[0][0].data;
        expect(extra).toMatchObject({
          state:
            "Could not send state because request would be larger than 200KB. (Was: 200001B)",
          lastAction: undefined
        });
      });

      it(`retries ${fnName} without any state if Sentry returns 413 request too large`, () => {
        expect(Raven._globalOptions.transport).toEqual(context.mockTransport);
        context.mockTransport.mockImplementationOnce(options => {
          options.onError({ request: { status: 413 } });
        });
        // Test that allowDuplicates is set to true inside our handler and reset afterwards
        // (Error message needs to be unique for each test, because we set allowDuplicates to null)
        Raven._globalOptions.allowDuplicates = null;
        Raven[fnName].call(
          Raven,
          fnName === "captureException"
            ? new Error("Test retry on 413 error")
            : "Test retry on 413 error"
        );

        // Ensure transport and allowDuplicates have been reset
        expect(Raven._globalOptions.transport).toEqual(context.mockTransport);
        expect(Raven._globalOptions.allowDuplicates).toEqual(null);
        expect(context.mockTransport).toHaveBeenCalledTimes(2);
        const { extra } = context.mockTransport.mock.calls[0][0].data;
        expect(extra).toMatchObject({
          state: { value: 0 },
          lastAction: undefined
        });
        const { extra: extra2 } = context.mockTransport.mock.calls[1][0].data;
        expect(extra2).toMatchObject({
          state: "Failed to submit state to Sentry: 413 request too large.",
          lastAction: undefined
        });
      });
    });
  });
  describe("with all the options enabled", () => {
    beforeEach(() => {
      context.stateTransformer = jest.fn(
        state => `transformed state ${state.value}`
      );
      context.actionTransformer = jest.fn(
        action => `transformed action ${action.type}`
      );
      context.getUserContext = jest.fn(state => `user context ${state.value}`);
      context.getTags = jest.fn(state => `tags ${state.value}`);
      context.breadcrumbDataFromAction = jest.fn(action => ({
        extra: action.extra
      }));
      context.filterBreadcrumbActions = action => {
        return action.type !== "UNINTERESTING_ACTION";
      };

      context.store = createStore(
        reducer,
        applyMiddleware(
          createRavenMiddleware(Raven, {
            stateTransformer: context.stateTransformer,
            actionTransformer: context.actionTransformer,
            breadcrumbDataFromAction: context.breadcrumbDataFromAction,
            filterBreadcrumbActions: context.filterBreadcrumbActions,
            getUserContext: context.getUserContext,
            getTags: context.getTags
          })
        )
      );
    });
    it("does not transform the state or action until an exception is encountered", () => {
      context.store.dispatch({ type: "INCREMENT" });
      expect(context.stateTransformer).not.toHaveBeenCalled();
      expect(context.actionTransformer).not.toHaveBeenCalled();
    });
    it("transforms the action if an error is encountered", () => {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual("transformed action THROW");
    });
    it("transforms the state if an error is encountered", () => {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.state).toEqual("transformed state 1");
    });
    it("derives breadcrumb data from action", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = context.mockTransport.mock.calls[0][0].data;
      expect(breadcrumbs.values.length).toBe(2);
      expect(breadcrumbs.values[0].data).toMatchObject({ extra: "FOO" });
      expect(breadcrumbs.values[1].data).toMatchObject({ extra: "BAR" });
    });
    it("transforms the user context on data callback", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      const userData = { userId: 1, username: "captbaritone" };
      Raven.setUserContext(userData);
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();

      expect(context.mockTransport.mock.calls[0][0].data.user).toEqual(
        "user context 1"
      );
    });
    it("transforms the tags on data callback", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expect(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();
      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      expect(context.mockTransport.mock.calls[0][0].data.tags).toEqual(
        "tags 1"
      );
    });
  });
  describe("with multiple data callbaks", () => {
    beforeEach(() => {
      context.firstOriginalDataCallback = jest.fn((data, original) => {
        const newData = Object.assign({}, data, {
          firstData: "first"
        });
        return original ? original(newData) : newData;
      });
      context.secondOriginalDataCallback = jest.fn((data, original) => {
        const newData = Object.assign({}, data, {
          secondData: "second"
        });
        return original ? original(newData) : newData;
      });
      Raven.setDataCallback(context.firstOriginalDataCallback);
      Raven.setDataCallback(context.secondOriginalDataCallback);
      context.stateTransformer = jest.fn(
        state => `transformed state ${state.value}`
      );

      context.store = createStore(
        reducer,
        applyMiddleware(
          createRavenMiddleware(Raven, {
            stateTransformer: context.stateTransformer
          })
        )
      );
    });

    it("runs all the data callbacks given", () => {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();
      expect(context.firstOriginalDataCallback).toHaveBeenCalledTimes(1);
      expect(context.secondOriginalDataCallback).toHaveBeenCalledTimes(1);

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const data = context.mockTransport.mock.calls[0][0].data;
      expect(data.extra.state).toEqual("transformed state 1");
      expect(data.firstData).toEqual("first");
      expect(data.secondData).toEqual("second");
    });
  });
  describe("with filterBreadcrumbActions option enabled", () => {
    beforeEach(() => {
      context.filterBreadcrumbActions = action => {
        return action.type !== "UNINTERESTING_ACTION";
      };

      context.store = createStore(
        reducer,
        applyMiddleware(
          createRavenMiddleware(Raven, {
            filterBreadcrumbActions: context.filterBreadcrumbActions
          })
        )
      );
    });
    it("filters actions for breadcrumbs", () => {
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = context.mockTransport.mock.calls[0][0].data;
      expect(breadcrumbs.values.length).toBe(1);
    });
    it("sends action with data.extra even if it was filtered", () => {
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      // Even though the action isn't added to breadcrumbs, it should be sent with extra data
      expect(extra.lastAction).toEqual({ type: "UNINTERESTING_ACTION" });
    });
  });
});
