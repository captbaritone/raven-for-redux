const createSentryMiddleware = require("./index");
const { createStore, applyMiddleware } = require("redux");

/*
 * Initializing @sentry/browser and @sentry/node in the same environment seems
 * to cause problems, so we make this tests file genric and then define separate
 * test files for each environment.
 */

// Docs claim the default is 100 but it's really 30. To avoid ambiguity, we use our own:
// Docs: https://docs.sentry.io/error-reporting/configuration/?platform=browser#max-breadcrumbs
// Code: https://github.com/getsentry/sentry-javascript/blob/02b8ab64e7b3aaee0df34009340ab3139f027ab3/packages/hub/src/hub.ts#L52
const MAX_BREADCRUMBS = 75;

const sendEvent = jest.fn(async () => {
  // Must be thenable to prevent errors
});

class MockTransport {
  constructor() {
    this.sendEvent = sendEvent;
    // This never gets called in practice
    this.close = jest.fn(async () => {});
  }
}

function testSentryForRaven(Sentry) {
  Sentry.init({
    dsn: "https://5d5bf17b1bed4afc9103b5a09634775e@sentry.io/146969",
    transport: MockTransport,
    maxBreadcrumbs: MAX_BREADCRUMBS
  });

  function expectToThrow(cb) {
    expect(() => {
      try {
        cb();
      } catch (e) {
        // Sentry does not seem to be able to capture global exceptions in Jest tests.
        // So we explicitly wrap this error in a Sentry captureException.
        Sentry.captureException(e);
        throw e;
      }
    }).toThrow();
  }

  const reducer = (previousState = { value: 0 }, action) => {
    switch (action.type) {
      case "THROW":
        throw new Error("Reducer error");
      case "INCREMENT":
        return { value: previousState.value + 1 };
      case "DOUBLE":
        return { value: previousState.value * 2 };
      default:
        return previousState;
    }
  };

  const context = {};

  beforeEach(() => {
    Sentry.configureScope(scope => {
      // Reset the context/extra/user/tags data.
      scope.clear();
      // Remove any even processors added by the middleware.
      // I've reached out to the team to find out if there's a better way to do this.
      scope._eventProcessors = [];
    });
    sendEvent.mockClear();
  });
  describe("in the default configuration", () => {
    beforeEach(() => {
      context.middleware = createSentryMiddleware(Sentry);
      context.store = createStore(reducer, applyMiddleware(context.middleware));
    });
    it("merges Redux info with existing 'extras'", async () => {
      Sentry.setExtras({ anotherValue: 10 });
      Sentry.captureException(new Error("Crash!"));
      await Sentry.flush();
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra).toMatchObject({
        state: { value: 0 },
        lastAction: undefined,
        anotherValue: 10
      });
    });
    it("if explicitly passed extras contain a `state` property, the explicit version wins", async () => {
      Sentry.setExtras({ anotherValue: 10, state: "SOME OTHER STATE" });
      Sentry.captureException(new Error("Crash!"));
      await Sentry.flush();
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra).toMatchObject({
        state: "SOME OTHER STATE",
        lastAction: undefined,
        anotherValue: 10
      });
    });
    it("if explicitly passed extras contain a `lastAction` property, the explicit version wins", async () => {
      Sentry.setExtras({
        anotherValue: 10,
        lastAction: "SOME OTHER LAST ACTION"
      });
      Sentry.captureException(new Error("Crash!"));
      await Sentry.flush();
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra).toMatchObject({
        state: { value: 0 },
        lastAction: "SOME OTHER LAST ACTION",
        anotherValue: 10
      });
    });
    it("includes the initial state when crashing/messaging before any action has been dispatched", async () => {
      Sentry.captureMessage("report!");

      await Sentry.flush();
      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra.lastAction).toBe(undefined);
      expect(extra.state).toEqual({ value: 0 });
    });
    it("returns the result of the next dispatch function", () => {
      expect(context.store.dispatch({ type: "INCREMENT" })).toEqual({
        type: "INCREMENT"
      });
    });
    it("logs the last action that was dispatched", async () => {
      context.store.dispatch({ type: "INCREMENT" });

      expectToThrow(() => {
        context.store.dispatch({ type: "THROW" });
      });
      await Sentry.flush();

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra.lastAction).toEqual({ type: "THROW" });
    });
    it("logs the last state when crashing in the reducer", async () => {
      context.store.dispatch({ type: "INCREMENT" });
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW" });
      });

      await Sentry.flush();
      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra.state).toEqual({ value: 1 });
    });
    it("logs a breadcrumb for each action", async () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });

      await Sentry.flush();
      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = sendEvent.mock.calls[0][0];
      expect(breadcrumbs.length).toBe(2);
      expect(breadcrumbs[0]).toMatchObject({
        category: "redux-action",
        message: "INCREMENT"
      });
      expect(breadcrumbs[1]).toMatchObject({
        category: "redux-action",
        message: "THROW"
      });
    });
    it("includes timestamps in the breadcrumbs", async () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });
      await Sentry.flush();
      const { breadcrumbs } = sendEvent.mock.calls[0][0];
      const firstBreadcrumb = breadcrumbs[1];
      expect(firstBreadcrumb.timestamp).toBeLessThanOrEqual(+new Date() / 1000);
    });
    it("trims breadcrumbs over MAX_BREADCRUMBS", async () => {
      let n = 150;
      expect(n > MAX_BREADCRUMBS).toBe(true);
      while (n--) {
        context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      }
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });
      await Sentry.flush();
      const { breadcrumbs } = sendEvent.mock.calls[0][0];
      expect(breadcrumbs.length).toBe(MAX_BREADCRUMBS);
    });
    it("preserves order of native Sentry breadcrumbs & sentry-for-redux breadcrumbs", async () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      await new Promise(resolve => setTimeout(resolve, 100));
      Sentry.addBreadcrumb({ message: "some message" });
      await new Promise(resolve => setTimeout(resolve, 100));
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });
      const { breadcrumbs } = sendEvent.mock.calls[0][0];
      expect(breadcrumbs.length).toBe(3);
      expect(breadcrumbs[0]).toMatchObject({ message: "INCREMENT" });
      expect(breadcrumbs[1]).toMatchObject({ message: "some message" });
      expect(breadcrumbs[2]).toMatchObject({ message: "THROW" });
    });
    it("includes the last state/action when crashing/reporting outside the reducer", () => {
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "DOUBLE" });
      Sentry.captureMessage("report!");

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra.lastAction).toEqual({ type: "DOUBLE" });
      expect(extra.state).toEqual({ value: 4 });
    });
    it("preserves user context", () => {
      const userData = { userId: 1, username: "captbaritone" };
      Sentry.setUser(userData);
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });

      expect(sendEvent.mock.calls[0][0].user).toEqual(userData);
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
      context.breadcrumbMessageFromAction = jest.fn(
        action => `transformed action ${action.type}`
      );
      context.filterBreadcrumbActions = action => {
        return action.type !== "UNINTERESTING_ACTION";
      };

      context.store = createStore(
        reducer,
        applyMiddleware(
          createSentryMiddleware(Sentry, {
            stateTransformer: context.stateTransformer,
            actionTransformer: context.actionTransformer,
            breadcrumbDataFromAction: context.breadcrumbDataFromAction,
            breadcrumbMessageFromAction: context.breadcrumbMessageFromAction,
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
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW" });
      });

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra.lastAction).toEqual("transformed action THROW");
    });
    it("transforms the state if an error is encountered", () => {
      context.store.dispatch({ type: "INCREMENT" });
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW" });
      });

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { extra } = sendEvent.mock.calls[0][0];
      expect(extra.state).toEqual("transformed state 1");
    });
    it("derives breadcrumb data from action", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = sendEvent.mock.calls[0][0];
      expect(breadcrumbs.length).toBe(2);
      expect(breadcrumbs[0].message).toBe("transformed action INCREMENT");
      expect(breadcrumbs[0].data).toMatchObject({ extra: "FOO" });
      expect(breadcrumbs[1].message).toBe("transformed action THROW");
      expect(breadcrumbs[1].data).toMatchObject({ extra: "BAR" });
    });
    it("transforms the user context on data callback", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      const userData = { userId: 1, username: "captbaritone" };
      Sentry.setUser(userData);
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });

      expect(sendEvent.mock.calls[0][0].user).toEqual("user context 1");
    });
    it("transforms the tags on data callback", () => {
      context.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expectToThrow(() => {
        context.store.dispatch({ type: "THROW", extra: "BAR" });
      });
      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent.mock.calls[0][0].tags).toEqual("tags 1");
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
          createSentryMiddleware(Sentry, {
            filterBreadcrumbActions: context.filterBreadcrumbActions
          })
        )
      );
    });
    it("filters actions for breadcrumbs", () => {
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      Sentry.captureMessage("report!");

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = sendEvent.mock.calls[0][0];
      expect(breadcrumbs.length).toBe(1);
    });
    it("sends action with data.extra even if it was filtered", async () => {
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      Sentry.captureMessage("report!");

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const { extra } = sendEvent.mock.calls[0][0];
      // Even though the action isn't added to breadcrumbs, it should be sent with extra data
      expect(extra.lastAction).toEqual({ type: "UNINTERESTING_ACTION" });
    });
  });
  describe("Middleware is attached to the scope", () => {
    // This is important for server rendering use cases
    it("so middlewares in different scopes don't affect eachother", async () => {
      // The first request errors after four increments.
      Sentry.withScope(() => {
        const store = createStore(
          reducer,
          applyMiddleware(createSentryMiddleware(Sentry))
        );
        store.dispatch({ type: "INCREMENT" });
        store.dispatch({ type: "INCREMENT" });
        store.dispatch({ type: "INCREMENT" });
        store.dispatch({ type: "INCREMENT" });
        expectToThrow(() => {
          store.dispatch({ type: "THROW" });
        });
      });
      // The second request errors before any increments.
      Sentry.withScope(() => {
        const store = createStore(
          reducer,
          applyMiddleware(createSentryMiddleware(Sentry))
        );
        expectToThrow(() => {
          store.dispatch({ type: "THROW" });
        });
      });

      await Sentry.flush();
      expect(sendEvent).toHaveBeenCalledTimes(2);
      expect(sendEvent.mock.calls[0][0].extra.state.value).toBe(4);
      expect(sendEvent.mock.calls[1][0].extra.state.value).toBe(0);
    });
    it("so errors thrown in child scopes include Redux context", () => {
      createStore(reducer, applyMiddleware(createSentryMiddleware(Sentry)));
      Sentry.withScope(() => {
        Sentry.captureException(new Error("Whoo's"));
      });

      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent.mock.calls[0][0].extra.state.value).toBe(0);
    });
    it("so errors thrown in a parent scope don't include Redux context", async () => {
      Sentry.withScope(() => {
        createStore(reducer, applyMiddleware(createSentryMiddleware(Sentry)));
      });

      Sentry.captureException(new Error("Whoo's"));

      await Sentry.flush();
      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent.mock.calls[0][0].extra).toBe(undefined);
    });

    // This test is included to document _current_ behavior, not nessesarily desired behavior.
    it("so (sadly) multiple middleware's created in the same scope will collide (the first one wins)", async () => {
      const storeOne = createStore(
        reducer,
        applyMiddleware(createSentryMiddleware(Sentry))
      );
      const storeTwo = createStore(
        reducer,
        applyMiddleware(createSentryMiddleware(Sentry))
      );

      storeOne.dispatch({ type: "INCREMENT" });
      storeOne.dispatch({ type: "INCREMENT" });
      storeOne.dispatch({ type: "INCREMENT" });
      storeOne.dispatch({ type: "INCREMENT" });

      storeTwo.dispatch({ type: "INCREMENT" });

      Sentry.captureException(new Error("Whoo's"));

      await Sentry.flush();
      expect(sendEvent).toHaveBeenCalledTimes(1);
      const reportedState = sendEvent.mock.calls[0][0].extra.state;
      expect(reportedState).toEqual(storeOne.getState());
      expect(reportedState).not.toEqual(storeTwo.getState());
    });
  });
}

module.exports = testSentryForRaven;
