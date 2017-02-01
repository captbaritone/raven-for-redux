const createRavenMiddleware = require("./index");
const { createStore, applyMiddleware } = require("redux");

const action = { type: "INCREMENT" };

const getMockRaven = () => ({ context: jest.fn((options, func) => {
    try {
      func();
    } catch (e) {
      throw new Error("Caught error");
    }
  }), captureBreadcrumb: jest.fn(), setExtraContext: jest.fn() });

describe("Raven Redux Middleware (unit test)", () => {
  let Raven, mockStore, next, middleware, state;
  beforeEach(() => {
    state = 0;
    Raven = getMockRaven();
    mockStore = { getState: jest.fn(() => state++) };
    next = jest.fn();
    middleware = createRavenMiddleware(Raven);
  });
  it("calls next()", () => {
    middleware(mockStore)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
  });
  it("adds action types to the breadcrumbs", () => {
    middleware(mockStore)(next)(action);
    expect(Raven.captureBreadcrumb).toHaveBeenCalledWith({
      category: "redux-action"
    });
  });
  it("sets the initial state as context when first booting up", () => {
    middleware(mockStore);
    expect(Raven.setExtraContext).toHaveBeenCalledWith({ state: 0 });
  });
  it("sets the new state and last action as context", () => {
    middleware(mockStore)(next)(action);
    expect(Raven.setExtraContext).toHaveBeenCalledWith({
      lastAction: action,
      state: 1
    });
  });
});

const reducer = (state = 0, action) => {
  switch (action.type) {
    case "INCREMENT":
      return state + 1;
    case "THROW":
      throw new Error("Your reducer errored");
  }
  return state;
};

describe("Raven Redux Middleware (integration tests)", () => {
  let Raven, store;
  beforeEach(() => {
    Raven = getMockRaven();
    store = createStore(reducer, applyMiddleware(createRavenMiddleware(Raven)));
  });
  it("store starts out in default state", () => {
    expect(store.getState()).toBe(0);
  });
  it("logs initial state to Raven", () => {
    expect(Raven.setExtraContext).toHaveBeenCalledWith({ state: 0 });
  });
  it("captures breadcrumbs", () => {
    store.dispatch(action);

    expect(Raven.captureBreadcrumb).toHaveBeenCalledWith({
      category: "redux-action"
    });
  });
  it("sets new state and last action as extra context", () => {
    store.dispatch(action);

    expect(Raven.setExtraContext).toHaveBeenCalledWith({
      lastAction: action,
      state: 1
    });
  });
  it("sets new state and last action as extra context", () => {
    store.dispatch(action);

    expect(Raven.setExtraContext).toHaveBeenCalledWith({
      lastAction: action,
      state: 1
    });
  });
  it("logs action, even if we crash inside the reducer", () => {
    const throwAction = { type: "THROW" };
    expect(() => store.dispatch(throwAction)).toThrow("Caught error");
    expect(Raven.context.mock.calls[0][0]).toEqual({ lastAction: throwAction });
  });
  describe("actionTransformer", () => {
    let actionTransformer;
    beforeEach(() => {
      actionTransformer = action => action.type.toLowerCase();
      const options = { actionTransformer };
      store = createStore(
        reducer,
        applyMiddleware(createRavenMiddleware(Raven, options))
      );
    });
    it("transforms the nextAction passed to context wrapper", () => {
      store.dispatch(action);
      expect(Raven.context.mock.calls[0][0]).toEqual({
        lastAction: actionTransformer(action)
      });
    });
    it("transforms the nextAction passed to setExtraContext", () => {
      store.dispatch(action);
      expect(Raven.setExtraContext).toHaveBeenCalledWith({
        lastAction: actionTransformer(action),
        state: 1
      });
    });
  });
  describe("stateTransformer", () => {
    beforeEach(() => {
      const stateTransformer = state => state + 100;
      const options = { stateTransformer };
      store = createStore(
        reducer,
        applyMiddleware(createRavenMiddleware(Raven, options))
      );
    });
    it("transforms the initial state", () => {
      expect(Raven.setExtraContext).toHaveBeenCalledWith({ state: 100 });
    });
    it("transforms each new state", () => {
      store.dispatch(action);
      expect(Raven.setExtraContext).toHaveBeenCalledWith({
        lastAction: action,
        state: 101
      });
    });
  });
});
