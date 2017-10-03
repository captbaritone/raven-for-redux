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

describe("raven-for-redux", function() {
  beforeEach(function() {
    context.mockTransport = jest.fn();
    Raven.setTransport(context.mockTransport);
    Raven.setDataCallback(undefined);
    Raven.setBreadcrumbCallback(undefined);
    Raven.setUserContext(undefined);

    Raven._breadcrumbs = [];
    Raven._globalContext = {};
  });
  describe("in the default configuration", function() {
    beforeEach(function() {
      context.store = createStore(
        reducer,
        applyMiddleware(createRavenMiddleware(Raven))
      );
    });
    it("includes the initial state when crashing/messaging before any action has been dispatched", function() {
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toBe(undefined);
      expect(extra.state).toEqual(0);
    });
    it("returns the result of the next dispatch function", function() {
      expect(context.store.dispatch({ type: "INCREMENT" })).toEqual({
        type: "INCREMENT"
      });
    });
    it("logs the last action that was dispatched", function() {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual({ type: "THROW" });
    });
    it("logs the last state when crashing in the reducer", function() {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.state).toBe(1);
    });
    it("logs a breadcrumb for each action", function() {
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
    it("includes the last state/action when crashing/reporting outside the reducer", function() {
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "DOUBLE" });
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual({ type: "DOUBLE" });
      expect(extra.state).toEqual(4);
    });
  });
  describe("with all the options enabled", function() {
    beforeEach(function() {
      context.stateTransformer = jest.fn(state => `transformed state ${state}`);
      context.actionTransformer = jest.fn(
        action => `transformed action ${action.type}`
      );
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
            filterBreadcrumbActions: context.filterBreadcrumbActions
          })
        )
      );
    });
    it("does not transform the state or action until an exception is encountered", function() {
      context.store.dispatch({ type: "INCREMENT" });
      expect(context.stateTransformer).not.toHaveBeenCalled();
      expect(context.actionTransformer).not.toHaveBeenCalled();
    });
    it("transforms the action if an error is encountered", function() {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual("transformed action THROW");
    });
    it("transforms the state if an error is encountered", function() {
      context.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        context.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      expect(extra.state).toEqual("transformed state 1");
    });
    it("derives breadcrumb data from action", function() {
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
    it("preserves user context", function() {
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

  describe("with filterBreadcrumbActions option enabled", function() {
    beforeEach(function() {
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
    it("filters actions for breadcrumbs", function() {
      context.store.dispatch({ type: "INCREMENT" });
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = context.mockTransport.mock.calls[0][0].data;
      expect(breadcrumbs.values.length).toBe(1);
    });
    it("sends action with data.extra even if it was filtered", function() {
      context.store.dispatch({ type: "UNINTERESTING_ACTION" });
      Raven.captureMessage("report!");

      expect(context.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = context.mockTransport.mock.calls[0][0].data;
      // Even though the action isn't added to breadcrumbs, it should be sent with extra data
      expect(extra.lastAction).toEqual({ type: "UNINTERESTING_ACTION" });
    });
  });
});
