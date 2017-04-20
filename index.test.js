const Raven = require("raven-js");
const createRavenMiddleware = require("./index");
const { createStore, applyMiddleware } = require("redux");

Raven.config("https://5d5bf17b1bed4afc9103b5a09634775e@sentry.io/146969", {
  allowDuplicates: true
});

const reducer = (previousState = 0, action) => {
  switch (action.type) {
    case "THROW":
      throw new Error("Reducer error");
    case "INCREMENT":
      return previousState + 1;
    case "DOUBLE":
      return (previousState = previousState * 2);
  }
};

describe("raven-for-redux", function() {
  beforeEach(function() {
    this.mockTransport = jest.fn();
    Raven.setTransport(this.mockTransport);
    Raven.setDataCallback(undefined);
    Raven.setBreadcrumbCallback(undefined);

    Raven._breadcrumbs = [];
    Raven._globalContext = {};
  });
  describe("in the default configuration", function() {
    beforeEach(function() {
      this.store = createStore(
        reducer,
        applyMiddleware(createRavenMiddleware(Raven))
      );
    });
    // TODO: This is currently broken.
    xit(
      "includes the initial state when crashing/messaging before any action has been dispatched",
      function() {
        Raven.captureMessage("report!");

        expect(this.mockTransport).toHaveBeenCalledTimes(1);
        const { extra } = this.mockTransport.mock.calls[0][0].data;
        expect(extra.lastAction).toBe(undefined);
        expect(extra.state).toEqual(0);
      }
    );
    it("returns the result of the next dispatch function", function() {
      expect(this.store.dispatch({ type: "INCREMENT" })).toEqual({
        type: "INCREMENT"
      });
    });
    it("logs the last action that was dispatched", function() {
      this.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        this.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(this.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = this.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual({ type: "THROW" });
    });
    it("logs the last state when crashing in the reducer", function() {
      this.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        this.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(this.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = this.mockTransport.mock.calls[0][0].data;
      expect(extra.state).toBe(1);
    });
    it("logs a breadcrumb for each action", function() {
      this.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expect(() => {
        this.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();

      expect(this.mockTransport).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = this.mockTransport.mock.calls[0][0].data;
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
      this.store.dispatch({ type: "INCREMENT" });
      this.store.dispatch({ type: "INCREMENT" });
      this.store.dispatch({ type: "DOUBLE" });
      Raven.captureMessage("report!");

      expect(this.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = this.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual({ type: "DOUBLE" });
      expect(extra.state).toEqual(4);
    });
  });
  describe("with all the options enabled", function() {
    beforeEach(function() {
      this.stateTransformer = jest.fn(state => `transformed state ${state}`);
      this.actionTransformer = jest.fn(
        action => `transformed action ${action.type}`
      );
      this.breadcrumbDataFromAction = jest.fn(action => ({
        extra: action.extra
      }));

      this.store = createStore(
        reducer,
        applyMiddleware(
          createRavenMiddleware(Raven, {
            stateTransformer: this.stateTransformer,
            actionTransformer: this.actionTransformer,
            breadcrumbDataFromAction: this.breadcrumbDataFromAction
          })
        )
      );
    });
    it("does not transform the state or action until an exception is encountered", function() {
      this.store.dispatch({ type: "INCREMENT" });
      expect(this.stateTransformer).not.toHaveBeenCalled();
      expect(this.actionTransformer).not.toHaveBeenCalled();
    });
    it("transforms the action if an error is encountered", function() {
      this.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        this.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(this.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = this.mockTransport.mock.calls[0][0].data;
      expect(extra.lastAction).toEqual("transformed action THROW");
    });
    it("transforms the state if an error is encountered", function() {
      this.store.dispatch({ type: "INCREMENT" });
      expect(() => {
        this.store.dispatch({ type: "THROW" });
      }).toThrow();

      expect(this.mockTransport).toHaveBeenCalledTimes(1);
      const { extra } = this.mockTransport.mock.calls[0][0].data;
      expect(extra.state).toEqual("transformed state 1");
    });
    it("derives breadcrumb data from action", function() {
      this.store.dispatch({ type: "INCREMENT", extra: "FOO" });
      expect(() => {
        this.store.dispatch({ type: "THROW", extra: "BAR" });
      }).toThrow();

      expect(this.mockTransport).toHaveBeenCalledTimes(1);
      const { breadcrumbs } = this.mockTransport.mock.calls[0][0].data;
      expect(breadcrumbs.values.length).toBe(2);
      expect(breadcrumbs.values[0].data).toMatchObject({ extra: "FOO" });
      expect(breadcrumbs.values[1].data).toMatchObject({ extra: "BAR" });
    });
  });
});
