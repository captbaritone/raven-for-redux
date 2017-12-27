const Raven = require("raven-js");
const createRavenMiddleware = require("./index");
const { createStore, applyMiddleware } = require("redux");

Raven.config("https://5d5bf17b1bed4afc9103b5a09634775e@sentry.io/146969", {
  allowDuplicates: true
}).install();

const reducer = (previousState = 0, action) => {
  switch (action.type) {
    case "THROW":
      // Raven does not seem to be able to capture global exceptions in Jest tests.
      // So we explicitly wrap this error in a Raven context.
      Raven.context(() => {
        throw new Error("Reducer error");
      });
    case "INCREMENT":
      return previousState + 1;
    case "DOUBLE":
      return (previousState = previousState * 2);
    default:
      return previousState;
  }
};

const context = {};

describe("raven-for-redux", () => {
  beforeEach(() => {
    context.mockTransport = jest.fn();
    Raven.setTransport(context.mockTransport);
    Raven.setDataCallback(undefined);
    Raven.setBreadcrumbCallback(undefined);
    Raven.setUserContext(undefined);

    Raven._breadcrumbs = [];
    Raven._globalContext = {};
  });
  describe("in the default configuration", () => {
    beforeEach(() => {
      context.store = createStore(
        reducer,
        applyMiddleware(createRavenMiddleware(Raven))
      );
    });
    it("includes the initial state when crashing/messaging before any action has been dispatched", () => {
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toBe(undefined);
      expect(extra.state).toEqual(0);
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
      expect(extra.state).toBe(1);
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
    it("includes the last state/action when crashing/reporting outside the reducer", () => {
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "DOUBLE" });
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual({ type: "DOUBLE" });
      expect(extra.state).toEqual(4);
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
  });
  describe("with all the options enabled", () => {
    beforeEach(() => {
      context.stateTransformer = jest.fn(state => `transformed state ${state}`);
      context.actionTransformer = jest.fn(
        action => `transformed action ${action.type}`
      );
      context.getUserContext = jest.fn(state => `user context ${state}`);
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
            getUserContext: context.getUserContext
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
      context.stateTransformer = jest.fn(state => `transformed state ${state}`);

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
